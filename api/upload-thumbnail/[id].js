const { put, head } = require("@vercel/blob");
const cloudinary = require("cloudinary").v2;

const BLOB_KEY = "locations.json";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function readLocations() {
  try {
    const meta = await head(BLOB_KEY);
    const url = meta.url + (meta.url.includes("?") ? "&" : "?") + "t=" + Date.now();
    const res = await fetch(url);
    return res.json();
  } catch {
    return null;
  }
}

async function writeLocations(data) {
  await put(BLOB_KEY, JSON.stringify(data, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;
  const data = await readLocations();
  if (!data) return res.status(500).json({ error: "No location data found" });

  const loc = data.find((l) => l.id === id);
  if (!loc) return res.status(404).json({ error: "location not found" });

  // Read raw binary body
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const fileData = Buffer.concat(chunks);

  if (fileData.length === 0) {
    return res.status(400).json({ error: "No file data received" });
  }

  const fileContentType = req.headers["x-file-type"] || "image/jpeg";
  if (!fileContentType.startsWith("image/")) {
    return res.status(400).json({ error: "Only image files allowed" });
  }

  try {
    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "world-map",
          public_id: id + "-thumb-" + Date.now(),
          resource_type: "image",
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(fileData);
    });

    const imageUrl = result.secure_url;

    // ONLY set thumbnail — never touch images array
    loc.thumbnail = imageUrl;
    await writeLocations(data);

    return res.json({ thumbnail: imageUrl });
  } catch (uploadErr) {
    console.error("Cloudinary upload error:", uploadErr);
    return res.status(500).json({ error: "Image upload failed: " + uploadErr.message });
  }
};

module.exports.config = {
  api: { bodyParser: false },
};
