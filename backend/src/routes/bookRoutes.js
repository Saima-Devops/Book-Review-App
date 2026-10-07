const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { rateLimit } = require("express-rate-limit");

module.exports = (sequelize) => {
  const bookController = require("../controllers/bookController")(sequelize);
  const authenticate = authMiddleware.withSession(sequelize);
  const catalog = require("../controllers/catalogController")();
  const lookupLimit = rateLimit({
    windowMs: 60000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: (req) => String(req.user.userId),
    message: { message: "Too many book searches. Please wait a minute or enter the book manually." },
  });

  router.get("/", bookController.getAllBooks);
  router.get("/catalog/search", authenticate, lookupLimit, catalog.search);
  router.get("/catalog/:catalogId", authenticate, lookupLimit, catalog.details);
  router.get("/:id/cover", bookController.getCover);
  router.get("/:id", bookController.getBookById); // Ensure this route exists
  router.post("/", authenticate, rateLimit({
    windowMs: 60000, limit: 10, keyGenerator: (req) => String(req.user.userId),
    standardHeaders: "draft-8", legacyHeaders: false,
    message: { message: "Too many book submissions. Please try again shortly." },
  }), bookController.addBook);
  router.delete("/:id", authenticate, bookController.deleteBook);

  return router;
};
