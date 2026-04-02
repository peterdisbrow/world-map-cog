const { readLocations, writeLocations, seedData } = require("./_blob");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    let data = await readLocations();
    if (!data) {
      data = seedData;
      await writeLocations(data);
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    return res.json(data);
  }

  if (req.method === "POST") {
    const loc = req.body;
    if (!loc || !loc.id || !loc.name) {
      return res.status(400).json({ error: "id and name required" });
    }
    let data = (await readLocations()) || seedData;
    if (data.find((l) => l.id === loc.id)) {
      return res.status(409).json({ error: "id already exists" });
    }
    data.push(loc);
    await writeLocations(data);
    return res.status(201).json({ ...loc, _allLocations: data });
  }

  res.status(405).json({ error: "Method not allowed" });
};
