// Local kiosk server for Church of God World Map
// Syncs location data from the hosted Vercel app and serves it locally.
// Requires Node.js 18+ (uses built-in fetch, no npm install needed).

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const REMOTE_URL = "https://world-map-cog.vercel.app/api/locations";
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // sync every 5 minutes

const CACHE_DIR = path.join(__dirname, "local-data");
const CACHE_FILE = path.join(CACHE_DIR, "locations.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const SEED_FILE = path.join(__dirname, "seed-data.json");

// ── Cache dir setup ────────────────────────────────────────────────────────────
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// ── Sync state ─────────────────────────────────────────────────────────────────
let syncStatus = {
  lastSync: null,
  nextSync: null,
  error: null,
  count: 0,
  source: "none",
};

async function syncFromRemote() {
  console.log(`[sync] Fetching ${REMOTE_URL} …`);
  try {
    const res = await fetch(REMOTE_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Response was not a JSON array");
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), "utf8");
    syncStatus = {
      lastSync: new Date().toISOString(),
      nextSync: new Date(Date.now() + SYNC_INTERVAL_MS).toISOString(),
      error: null,
      count: data.length,
      source: "remote",
    };
    console.log(`[sync] OK — ${data.length} locations cached`);
  } catch (err) {
    syncStatus.error = err.message;
    syncStatus.nextSync = new Date(Date.now() + SYNC_INTERVAL_MS).toISOString();
    console.error(`[sync] FAILED: ${err.message}`);
  }
}

// ── Data helpers ───────────────────────────────────────────────────────────────
function readCachedLocations() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    } catch {
      // fall through
    }
  }
  // Fallback to seed-data.json if no cache yet
  if (fs.existsSync(SEED_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
    } catch {
      // fall through
    }
  }
  return null;
}

// ── Static file MIME types ─────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    }
  });
}

// ── Request router ─────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // GET /api/locations — serve cached (or seed) data
  if (pathname === "/api/locations" && req.method === "GET") {
    const data = readCachedLocations();
    if (!data) {
      res.writeHead(503, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Sync in progress. Try again in a moment." }));
    }
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    });
    return res.end(JSON.stringify(data));
  }

  // GET /api/sync-status — diagnostics
  if (pathname === "/api/sync-status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify(syncStatus, null, 2));
  }

  // POST /api/sync-now — trigger an immediate sync (admin convenience)
  if (pathname === "/api/sync-now" && req.method === "POST") {
    syncFromRemote();
    res.writeHead(202, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ message: "Sync triggered" }));
  }

  // Static files
  let filePath;
  if (pathname === "/" || pathname === "/index.html") {
    filePath = path.join(PUBLIC_DIR, "index.html");
  } else if (pathname === "/admin" || pathname === "/admin.html") {
    filePath = path.join(PUBLIC_DIR, "admin.html");
  } else if (pathname === "/submit" || pathname === "/submit.html") {
    filePath = path.join(PUBLIC_DIR, "submit.html");
  } else {
    // Prevent path traversal outside PUBLIC_DIR
    filePath = path.join(PUBLIC_DIR, pathname);
    if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      return res.end("403 Forbidden");
    }
  }

  serveStatic(res, filePath);
});

// ── Boot ───────────────────────────────────────────────────────────────────────
syncFromRemote(); // immediate first sync
setInterval(syncFromRemote, SYNC_INTERVAL_MS);

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\nLocal kiosk server running at http://localhost:${PORT}`);
  console.log(`Remote source:  ${REMOTE_URL}`);
  console.log(`Cache file:     ${CACHE_FILE}`);
  console.log(`Sync interval:  ${SYNC_INTERVAL_MS / 60000} minutes\n`);
});
