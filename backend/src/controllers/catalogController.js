const catalog = require("../services/bookCatalog");

module.exports = (service = catalog) => {
  const run = (operation) => async (req, res) => {
    try { res.json(await operation(req)); }
    catch (error) {
      res.status(error.status || 503).json({ message: error.status ? error.message : "Book lookup is unavailable. You can still enter the book manually." });
    }
  };
  return {
    search: run(async (req) => ({ books: await service.search(req.query.q) })),
    details: run((req) => service.details(req.params.catalogId)),
  };
};
