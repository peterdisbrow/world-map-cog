const { readLocations, writeLocations } = require("../_blob");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Extract Cloudinary public_id from URL for deletion
function getCloudinaryPublicId(url) {
  if (!url || !url.includes("cloudinary.com")) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(world-map\/.+)\.\w+$/);
  return match ? match[1] : null;
}

async function deleteCloudinaryImage(url) {
  const publicId = getCloudinaryPublicId(url);
  if (publicId) {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch {}
  }
}

module.exports = async function handler(req, res) {
  const { id } = req.query;

  if (req.method === "PUT") {
    let data = await readLocations();
    const idx = data.findIndex((l) => l.id === id);
    if (idx === -1) return res.status(404).json({ error: "not found" });
    data[idx] = { ...data[idx], ...req.body, id };
    await writeLocations(data);
    return res.json({ ...data[idx], _allLocations: data });
  }

  if (req.method === "PATCH") {
    // Remove a single image
    const { imageUrl } = req.body || {};
    if (!imageUrl) return res.status(400).json({ error: "imageUrl required" });
    let data = await readLocations();
    const idx = data.findIndex((l) => l.id === id);
    if (idx === -1) return res.status(404).json({ error: "not found" });
    const loc = data[idx];
    if (!loc.images) loc.images = loc.image ? [loc.image] : [];
    loc.images = loc.images.filter((url) => url !== imageUrl);
    loc.image = loc.images[0] || null;
    await writeLocations(data);
    // Delete from Cloudinary (fire and forget)
    deleteCloudinaryImage(imageUrl);
    return res.json({ images: loc.images, _allLocations: data });
  }

  if (req.method === "DELETE") {
    let data = await readLocations();
    const idx = data.findIndex((l) => l.id === id);
    if (idx === -1) return res.status(404).json({ error: "not found" });
    const removed = data.splice(idx, 1)[0];
    await writeLocations(data);
    const allImages = removed.images || (removed.image ? [removed.image] : []);
    for (const url of allImages) {
      if (!url) continue;
      deleteCloudinaryImage(url);
    }
    return res.json({ success: true });
  }

  res.status(405).json({ error: "Method not allowed" });
};
