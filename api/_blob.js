// Shared blob read/write with versioned keys to bypass CDN cache.
// Uses a pointer blob (locations-latest.txt) that stores the URL of the
// current data blob, avoiding list() calls on every read.

const { put, list, del, head } = require("@vercel/blob");
const seedData = require("../seed-data.json");

const BLOB_PREFIX = "locations-";
const POINTER_KEY = "locations-latest.txt";

async function readLocations() {
  try {
    // Read pointer to find current data blob URL
    const ptr = await head(POINTER_KEY);
    const pointerRes = await fetch(ptr.url + "?t=" + Date.now());
    const dataUrl = (await pointerRes.text()).trim();
    const res = await fetch(dataUrl + "?t=" + Date.now());
    return res.json();
  } catch {
    // Fallback: scan for versioned blobs (first run or migration)
    try {
      const { blobs } = await list({ prefix: BLOB_PREFIX });
      const dataBlobs = blobs.filter((b) => b.pathname.endsWith(".json") && b.pathname !== POINTER_KEY);
      if (!dataBlobs.length) return null;
      dataBlobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      const res = await fetch(dataBlobs[0].url);
      return res.json();
    } catch {
      return null;
    }
  }
}

async function writeLocations(data) {
  const key = BLOB_PREFIX + Date.now() + ".json";
  // Write new data blob
  const blob = await put(key, JSON.stringify(data, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
  });
  // Update pointer to new blob URL
  await put(POINTER_KEY, blob.url, {
    access: "public",
    contentType: "text/plain",
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
  });
  // Clean up old data blobs in background (don't await)
  cleanupOldBlobs(key).catch(() => {});
}

async function cleanupOldBlobs(currentKey) {
  const { blobs } = await list({ prefix: BLOB_PREFIX });
  const toDelete = blobs.filter(
    (b) => b.pathname !== currentKey && b.pathname !== POINTER_KEY && b.pathname.endsWith(".json")
  );
  if (toDelete.length > 0) {
    await del(toDelete.map((b) => b.url));
  }
}

module.exports = { readLocations, writeLocations, seedData };
