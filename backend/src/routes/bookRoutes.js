const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

module.exports = (sequelize) => {
  const bookController = require("../controllers/bookController")(sequelize);

  router.get("/", bookController.getAllBooks);
  router.get("/:id", bookController.getBookById); // Ensure this route exists
  router.post("/", authMiddleware, bookController.addBook);

  return router;
};
