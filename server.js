const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { spawnSync } = require("child_process");

const seedData = require("./seed-data.json");

const SERVER_VERSION = fs.readFileSync(path.join(__dirname, "VERSION"), "utf8").trim();
const SERVER_START_TIME = Date.now();
const LOG_MAX_BYTES = 5 * 1024 * 1024; // 5MB

let lastUpdateCheckAt = null;

const PORT = Number(process.env.PORT || 3030);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const LOCAL_DATA_DIR = process.env.LOCAL_DATA_DIR || path.join(ROOT_DIR, "local-data");
const MIRRORED_ASSETS_DIR = path.join(LOCAL_DATA_DIR, "mirrored-assets");
const LOCATIONS_FILE = path.join(LOCAL_DATA_DIR, "locations.json");
const SYNC_STATE_FILE = path.join(LOCAL_DATA_DIR, "sync-state.json");
const REMOTE_BASE_URL = process.env.REMOTE_BASE_URL || "https://world-map-cog.vercel.app";
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS || 5 * 60 * 1000);
const REMOTE_FETCH_TIMEOUT_MS = Number(process.env.REMOTE_FETCH_TIMEOUT_MS || 15000);
const ASSET_FETCH_TIMEOUT_MS = Number(process.env.ASSET_FETCH_TIMEOUT_MS || 20000);

const GITHUB_REPO = "peterdisbrow/world-map-cog";
const RELEASE_TAG = "v1.0.0";
const UPDATE_STATE_FILE = path.join(LOCAL_DATA_DIR, "last-update.json");
const UPDATE_EXIT_CODE = 100;
// Names at the top level of ROOT_DIR that must never be overwritten by an update
const PRESERVE_ON_UPDATE = new Set(["local-data", "node.exe", "node_modules"]);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

// ---- Network resilience: never let unhandled errors crash the server ----
process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT]", err.message || err);
});
process.on("unhandledRejection", (reason) => {
  console.warn("[UNHANDLED-REJECTION]", reason instanceof Error ? reason.message : reason);
});

// ---- Log rotation ----
function rotateLogIfNeeded(logPath) {
  try {
    const stat = fs.statSync(logPath);
    if (stat.size >= LOG_MAX_BYTES) {
      const oldPath = logPath + ".old";
      try { fs.unlinkSync(oldPath); } catch {}
      fs.renameSync(logPath, oldPath);
      console.log(`[log-rotate] rotated ${path.basename(logPath)} (${stat.size} bytes)`);
    }
  } catch {}
}

let syncPromise = null;
let syncState = {
  mode: "mirror",
  remoteBaseUrl: REMOTE_BASE_URL,
  syncIntervalMs: SYNC_INTERVAL_MS,
  syncing: false,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastReason: null,
  source: "seed",
  locationCount: Array.isArray(seedData) ? seedData.length : 0,
  cachedAssetCount: 0,
  assetMap: {},
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  send(res, status, text, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  });
}

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function hashString(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

function isBundledPublicPath(pathname) {
  return pathname.startsWith("/assets/") || pathname.startsWith("/vendor/");
}

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonFile(filePath, data) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmpFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmpFile, JSON.stringify(data, null, 2) + "\n", "utf8");
  await fsp.rename(tmpFile, filePath);
}

async function ensureLocalStore() {
  await fsp.mkdir(MIRRORED_ASSETS_DIR, { recursive: true });

  if (!(await fileExists(LOCATIONS_FILE))) {
    await writeJsonFile(LOCATIONS_FILE, seedData);
  }

  if (await fileExists(SYNC_STATE_FILE)) {
    try {
      const raw = await fsp.readFile(SYNC_STATE_FILE, "utf8");
      const parsed = JSON.parse(raw);
      syncState = { ...syncState, ...parsed, assetMap: parsed.assetMap || {} };
    } catch {}
  } else {
    await writeJsonFile(SYNC_STATE_FILE, syncState);
  }
}

async function readLocations() {
  await ensureLocalStore();
  const raw = await fsp.readFile(LOCATIONS_FILE, "utf8");
  return JSON.parse(raw);
}

async function writeLocations(locations) {
  await writeJsonFile(LOCATIONS_FILE, locations);
}

async function persistSyncState() {
  await writeJsonFile(SYNC_STATE_FILE, syncState);
}

async function serveFile(res, filePath) {
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) {
      return sendText(res, 404, "Not found");
    }

    res.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": stat.size,
      "Content-Type": contentTypeFor(filePath),
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    sendText(res, 404, "Not found");
  }
}

function publicFilePath(pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.resolve(PUBLIC_DIR, "." + requested);
  if (!resolved.startsWith(path.resolve(PUBLIC_DIR) + path.sep) && resolved !== path.resolve(PUBLIC_DIR)) {
    return null;
  }
  return resolved;
}

function sendReadOnlyPage(res, kind) {
  const isAdmin = kind === "admin";
  const heading = isAdmin ? "Local Admin Disabled" : "Local Submit Disabled";
  const targetPath = isAdmin ? "/admin" : "/submit";
  const description = isAdmin
    ? "This kiosk runtime is read-only. Manage content in the hosted Vercel app, then let the wall machine sync the latest snapshot."
    : "Submissions should go to the hosted Vercel app. The local kiosk only mirrors hosted content for offline playback.";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${heading}</title>
<style>
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at top, #16304b 0%, #08101c 55%, #030507 100%);
    color: #f1ead5;
    font-family: "Segoe UI", system-ui, sans-serif;
  }
  .card {
    width: min(680px, calc(100vw - 40px));
    background: rgba(7, 16, 28, 0.94);
    border: 1px solid rgba(240, 192, 64, 0.25);
    border-radius: 24px;
    padding: 32px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  }
  h1 {
    margin: 0 0 14px;
    font-size: 34px;
    color: #f0c040;
  }
  p {
    margin: 0 0 16px;
    line-height: 1.6;
    color: #c9d3e6;
    font-size: 18px;
  }
  .actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 24px;
  }
  a {
    text-decoration: none;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    padding: 0 20px;
    border-radius: 999px;
    font-weight: 600;
  }
  .btn-primary {
    background: #f0c040;
    color: #111;
  }
  .btn-secondary {
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: #f1ead5;
  }
  .meta {
    margin-top: 20px;
    font-size: 14px;
    color: #91a1bb;
  }
</style>
</head>
<body>
  <div class="card">
    <h1>${htmlEscape(heading)}</h1>
    <p>${htmlEscape(description)}</p>
    <p>Hosted content URL: ${htmlEscape(new URL(targetPath, REMOTE_BASE_URL).href)}</p>
    <div class="actions">
      <a class="btn btn-primary" href="${htmlEscape(new URL(targetPath, REMOTE_BASE_URL).href)}">Open Hosted ${isAdmin ? "Admin" : "Submit"}</a>
      <a class="btn btn-secondary" href="/">Back To Local Map</a>
    </div>
    <div class="meta">Local kiosk mode mirrors hosted content and keeps the latest synced snapshot available during internet outages.</div>
  </div>
</body>
</html>`;

  sendText(res, 200, html, "text/html; charset=utf-8");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REMOTE_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extFromUrlOrType(assetUrl, contentType = "") {
  try {
    const parsed = new URL(assetUrl);
    const ext = path.extname(parsed.pathname);
    if (ext && ext.length <= 5) return ext.toLowerCase();
  } catch {}

  const normalized = String(contentType || "").toLowerCase();
  if (normalized.includes("png")) return ".png";
  if (normalized.includes("webp")) return ".webp";
  if (normalized.includes("svg")) return ".svg";
  if (normalized.includes("gif")) return ".gif";
  return ".jpg";
}

async function cacheRemoteAsset(rawUrl, priorAssetMap, nextAssetMap, usedFiles, memo) {
  if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
  if (rawUrl.startsWith("data:")) return rawUrl;

  const key = rawUrl.trim();
  if (!key) return key;
  if (memo.has(key)) return memo.get(key);

  const promise = (async () => {
    const remoteUrl = new URL(key, REMOTE_BASE_URL);
    const remoteBase = new URL(REMOTE_BASE_URL);

    if (isBundledPublicPath(remoteUrl.pathname) && (!key.startsWith("http") || remoteUrl.origin === remoteBase.origin)) {
      return remoteUrl.pathname;
    }

    const absoluteUrl = remoteUrl.href;
    const existingFile = priorAssetMap[absoluteUrl];
    if (existingFile) {
      const existingPath = path.join(MIRRORED_ASSETS_DIR, existingFile);
      if (await fileExists(existingPath)) {
        usedFiles.add(existingFile);
        nextAssetMap[absoluteUrl] = existingFile;
        return `/mirrored-assets/${encodeURIComponent(existingFile)}`;
      }
    }

    const res = await fetchWithTimeout(absoluteUrl, {}, ASSET_FETCH_TIMEOUT_MS);
    if (!res.ok) {
      throw new Error(`Asset sync failed (${res.status}) for ${absoluteUrl}`);
    }

    const ext = extFromUrlOrType(absoluteUrl, res.headers.get("content-type"));
    const fileName = `${hashString(absoluteUrl)}${ext}`;
    const outPath = path.join(MIRRORED_ASSETS_DIR, fileName);
    const tempPath = `${outPath}.${process.pid}.${Date.now()}.tmp`;
    const body = Buffer.from(await res.arrayBuffer());

    await fsp.writeFile(tempPath, body);
    await fsp.rename(tempPath, outPath);

    usedFiles.add(fileName);
    nextAssetMap[absoluteUrl] = fileName;
    return `/mirrored-assets/${encodeURIComponent(fileName)}`;
  })().catch((error) => {
    console.warn("[mirror-sync]", error.message);
    return rawUrl;
  });

  memo.set(key, promise);
  return promise;
}

function pickFallbackAsset(candidate, fallback) {
  if (!candidate || candidate === fallback) return candidate;
  if (!fallback || typeof fallback !== "string") return candidate;
  if (fallback.startsWith("/assets/") || fallback.startsWith("/mirrored-assets/")) return fallback;
  return candidate;
}

async function rewriteLocationsForMirror(locations, priorAssetMap = {}, priorLocations = []) {
  const memo = new Map();
  const usedFiles = new Set();
  const nextAssetMap = {};
  const mirrored = [];
  const priorById = new Map(priorLocations.map((loc) => [loc.id, loc]));

  for (const loc of locations) {
    const current = { ...loc };
    const priorLoc = priorById.get(loc.id) || {};
    const mirroredImages = [];

    if (Array.isArray(loc.images)) {
      for (let index = 0; index < loc.images.length; index++) {
        const imageUrl = loc.images[index];
        const mirroredUrl = await cacheRemoteAsset(imageUrl, priorAssetMap, nextAssetMap, usedFiles, memo);
        const fallbackUrl = Array.isArray(priorLoc.images) ? priorLoc.images[index] : null;
        mirroredImages.push(pickFallbackAsset(mirroredUrl, fallbackUrl));
      }
    }

    current.images = mirroredImages;

    if (loc.image) {
      const mirroredImage = await cacheRemoteAsset(loc.image, priorAssetMap, nextAssetMap, usedFiles, memo);
      current.image = current.images[0] || pickFallbackAsset(mirroredImage, priorLoc.image);
    } else {
      current.image = current.images[0] || null;
    }

    current.thumbnail = loc.thumbnail
      ? pickFallbackAsset(
          await cacheRemoteAsset(loc.thumbnail, priorAssetMap, nextAssetMap, usedFiles, memo),
          priorLoc.thumbnail
        )
      : null;

    mirrored.push(current);
  }

  const cachedFiles = await fsp.readdir(MIRRORED_ASSETS_DIR);
  await Promise.all(
    cachedFiles.map(async (fileName) => {
      if (!usedFiles.has(fileName)) {
        try {
          await fsp.unlink(path.join(MIRRORED_ASSETS_DIR, fileName));
        } catch {}
      }
    })
  );

  return { mirrored, nextAssetMap, cachedAssetCount: usedFiles.size };
}

async function syncFromRemote(reason = "manual") {
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    await ensureLocalStore();
    syncState = {
      ...syncState,
      syncing: true,
      lastAttemptAt: new Date().toISOString(),
      lastError: null,
      lastReason: reason,
    };
    await persistSyncState();

    try {
      const url = new URL("/api/locations", REMOTE_BASE_URL);
      url.searchParams.set("t", Date.now().toString());

      const res = await fetchWithTimeout(url, {}, REMOTE_FETCH_TIMEOUT_MS);
      if (!res.ok) {
        throw new Error(`Remote sync failed with status ${res.status}`);
      }

      const remoteLocations = await res.json();
      if (!Array.isArray(remoteLocations)) {
        throw new Error("Remote sync returned invalid location data");
      }

      const priorLocations = await readLocations();
      const { mirrored, nextAssetMap, cachedAssetCount } = await rewriteLocationsForMirror(
        remoteLocations,
        syncState.assetMap || {},
        priorLocations
      );

      await writeLocations(mirrored);
      syncState = {
        ...syncState,
        syncing: false,
        lastSuccessAt: new Date().toISOString(),
        lastError: null,
        source: "vercel",
        locationCount: mirrored.length,
        cachedAssetCount,
        assetMap: nextAssetMap,
      };
      await persistSyncState();
      console.log(`[mirror-sync] synced ${mirrored.length} locations from ${REMOTE_BASE_URL}`);
    } catch (error) {
      syncState = {
        ...syncState,
        syncing: false,
        lastError: error.message,
      };
      await persistSyncState();
      console.warn(`[mirror-sync] ${error.message}`);
    } finally {
      syncPromise = null;
    }
  })();

  return syncPromise;
}

function scheduleSync() {
  const interval = setInterval(() => {
    rotateLogIfNeeded(path.join(ROOT_DIR, "server.log"));
    rotateLogIfNeeded(path.join(ROOT_DIR, "debug.log"));
    syncFromRemote("interval").catch(() => {});
  }, SYNC_INTERVAL_MS);

  if (typeof interval.unref === "function") {
    interval.unref();
  }
}

// ---- Auto-updater ----

async function readUpdateState() {
  try {
    const raw = await fsp.readFile(UPDATE_STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeUpdateState(patch) {
  const current = await readUpdateState();
  await writeJsonFile(UPDATE_STATE_FILE, { ...current, ...patch });
}

async function extractZipWithPowershell(zipPath, destDir) {
  await fsp.rm(destDir, { recursive: true, force: true });
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command",
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 60000 }
  );
  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || "").trim();
    throw new Error(`ZIP extraction failed (exit ${result.status}): ${msg}`);
  }
}

async function copyDirContents(srcDir, destDir, topLevelSkip) {
  const entries = await fsp.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (topLevelSkip && topLevelSkip.has(entry.name)) continue;
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await fsp.mkdir(dest, { recursive: true });
      await copyDirContents(src, dest, null);
    } else if (entry.isFile()) {
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.copyFile(src, dest);
    }
  }
}

async function checkAndApplyUpdate() {
  console.log("[auto-update] checking for updates...");
  const checkedAt = new Date().toISOString();
  lastUpdateCheckAt = checkedAt;

  try {
    const releaseApiUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${RELEASE_TAG}`;
    const apiRes = await fetchWithTimeout(
      releaseApiUrl,
      { headers: { "User-Agent": "world-map-kiosk/1.0" } },
      15000
    );

    if (!apiRes.ok) {
      throw new Error(`GitHub API responded with ${apiRes.status}`);
    }

    const release = await apiRes.json();
    const asset = (release.assets || []).find((a) => a.name === "world-map-kiosk-portable.zip");

    if (!asset) {
      throw new Error("world-map-kiosk-portable.zip not found in release assets");
    }

    const remoteTimestamp = asset.updated_at || release.published_at;
    const state = await readUpdateState();

    if (state.installedTimestamp && new Date(remoteTimestamp) <= new Date(state.installedTimestamp)) {
      console.log(`[auto-update] up to date (installed: ${state.installedTimestamp})`);
      await writeUpdateState({ lastCheckedAt: checkedAt, lastError: null });
      return false;
    }

    console.log(`[auto-update] update available (remote asset: ${remoteTimestamp}), downloading...`);

    const dlRes = await fetchWithTimeout(
      asset.browser_download_url,
      { headers: { "User-Agent": "world-map-kiosk/1.0" } },
      120000
    );

    if (!dlRes.ok) {
      throw new Error(`Download failed with HTTP ${dlRes.status}`);
    }

    const zipBytes = Buffer.from(await dlRes.arrayBuffer());
    const zipTempPath = path.join(LOCAL_DATA_DIR, "pending-update.zip");
    await fsp.writeFile(zipTempPath, zipBytes);
    console.log(`[auto-update] downloaded ${zipBytes.length} bytes`);

    const stagingDir = path.join(LOCAL_DATA_DIR, "update-staging");
    await extractZipWithPowershell(zipTempPath, stagingDir);
    console.log("[auto-update] extracted zip");

    // Strip top-level wrapper folder if the zip contains exactly one directory
    const stagingEntries = await fsp.readdir(stagingDir, { withFileTypes: true });
    const sourceDir =
      stagingEntries.length === 1 && stagingEntries[0].isDirectory()
        ? path.join(stagingDir, stagingEntries[0].name)
        : stagingDir;

    await copyDirContents(sourceDir, ROOT_DIR, PRESERVE_ON_UPDATE);
    console.log("[auto-update] files installed");

    await fsp.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    await fsp.unlink(zipTempPath).catch(() => {});

    await writeUpdateState({
      lastCheckedAt: checkedAt,
      lastInstalledAt: checkedAt,
      installedTimestamp: remoteTimestamp,
      lastError: null,
    });

    console.log("[auto-update] update installed — restarting server...");
    process.exit(UPDATE_EXIT_CODE);
  } catch (error) {
    console.warn(`[auto-update] ${error.message}`);
    await writeUpdateState({ lastCheckedAt: checkedAt, lastError: error.message }).catch(() => {});
    return false;
  }
}

function scheduleUpdateCheck() {
  function msUntilTime(hour, minute) {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
  }

  function scheduleNext() {
    const delay = msUntilTime(2, 30);
    const runAt = new Date(Date.now() + delay);
    console.log(`[auto-update] next scheduled check at ${runAt.toLocaleTimeString()} on ${runAt.toLocaleDateString()}`);
    const timer = setTimeout(() => {
      checkAndApplyUpdate().catch(() => {});
      scheduleNext();
    }, delay);
    if (typeof timer.unref === "function") timer.unref();
  }

  scheduleNext();
}

async function handleLocations(req, res, pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const id = parts[2] ? decodeURIComponent(parts[2]) : null;

  if (pathname === "/api/locations" && req.method === "GET") {
    if (!syncState.lastSuccessAt && !syncState.syncing) {
      syncFromRemote("first-read").catch(() => {});
    }
    return sendJson(res, 200, await readLocations());
  }

  if (pathname === "/api/locations" && req.method !== "GET") {
    return sendJson(res, 403, {
      error: "Local kiosk is read-only. Make content changes in the hosted Vercel app.",
      remoteAdminUrl: new URL("/admin", REMOTE_BASE_URL).href,
    });
  }

  if (id) {
    return sendJson(res, 403, {
      error: "Local kiosk is read-only. Make content changes in the hosted Vercel app.",
      remoteAdminUrl: new URL("/admin", REMOTE_BASE_URL).href,
    });
  }

  return sendJson(res, 405, { error: "Method not allowed" });
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      mode: "mirror",
      remoteBaseUrl: REMOTE_BASE_URL,
      syncing: syncState.syncing,
      lastSuccessAt: syncState.lastSuccessAt,
      source: syncState.source,
    });
  }

  if (pathname === "/api/status") {
    const uptimeSec = Math.floor((Date.now() - SERVER_START_TIME) / 1000);
    const healthy = !syncState.lastError;
    return sendJson(res, 200, {
      healthy,
      version: SERVER_VERSION,
      uptime: `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`,
      uptimeSeconds: uptimeSec,
      lastSyncTime: syncState.lastSuccessAt,
      lastSyncError: syncState.lastError,
      lastUpdateCheck: lastUpdateCheckAt,
      locationCount: syncState.locationCount,
      cachedAssetCount: syncState.cachedAssetCount,
      source: syncState.source,
    });
  }

  if (pathname === "/api/sync-status") {
    return sendJson(res, 200, {
      ...syncState,
      assetMap: undefined,
    });
  }

  if (pathname === "/api/sync-now" && req.method === "POST") {
    await syncFromRemote("manual");
    return sendJson(res, 200, {
      ok: !syncState.lastError,
      ...syncState,
      assetMap: undefined,
    });
  }

  if (pathname === "/api/check-update" && req.method === "POST") {
    sendJson(res, 202, { ok: true, message: "Update check started. Server will restart if an update is found." });
    setImmediate(() => checkAndApplyUpdate().catch(() => {}));
    return;
  }

  if (pathname.startsWith("/api/upload/")) {
    return sendJson(res, 403, {
      error: "Local kiosk is read-only. Uploads are disabled here.",
      remoteSubmitUrl: new URL("/submit", REMOTE_BASE_URL).href,
    });
  }

  if (pathname === "/api/locations" || pathname.startsWith("/api/locations/")) {
    return handleLocations(req, res, pathname);
  }

  if (pathname === "/admin" || pathname === "/admin/" || pathname === "/admin.html") {
    return sendReadOnlyPage(res, "admin");
  }

  if (pathname === "/submit" || pathname === "/submit/" || pathname === "/submit.html") {
    return sendReadOnlyPage(res, "submit");
  }

  if (pathname.startsWith("/mirrored-assets/")) {
    const assetName = decodeURIComponent(pathname.slice("/mirrored-assets/".length));
    const resolved = path.resolve(MIRRORED_ASSETS_DIR, "." + path.sep + assetName);
    if (!resolved.startsWith(path.resolve(MIRRORED_ASSETS_DIR) + path.sep) && resolved !== path.resolve(MIRRORED_ASSETS_DIR)) {
      return sendText(res, 403, "Forbidden");
    }
    return serveFile(res, resolved);
  }

  const staticFile = publicFilePath(pathname);
  if (!staticFile) {
    return sendText(res, 403, "Forbidden");
  }
  return serveFile(res, staticFile);
}

const server = http.createServer((req, res) => {
  requestHandler(req, res).catch((error) => {
    console.error("[local-server]", error);
    sendJson(res, 500, { error: "Internal server error" });
  });
});

ensureLocalStore()
  .catch((error) => {
    console.warn(`[mirror-sync] local cache init issue: ${error.message}`);
  })
  .finally(() => {
    scheduleSync();
    scheduleUpdateCheck();
    server.listen(PORT, HOST, () => {
      console.log(`World Map local server running at http://${HOST}:${PORT}`);
      console.log(`Remote content source: ${REMOTE_BASE_URL}`);
      console.log(`Local cache directory: ${LOCAL_DATA_DIR}`);
      syncFromRemote("startup")
        .catch((error) => {
          console.warn(`[mirror-sync] startup sync skipped: ${error.message}`);
        })
        .finally(() => {
          checkAndApplyUpdate().catch((error) => {
            console.warn(`[auto-update] startup check failed: ${error.message}`);
          });
        });
    });
  });
