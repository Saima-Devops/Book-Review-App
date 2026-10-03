const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

module.exports = (sequelize) => {
  const bookController = require("../controllers/bookController")(sequelize);
  const authenticate = authMiddleware.withSession(sequelize);

  router.get("/", bookController.getAllBooks);
  router.get("/:id", bookController.getBookById); // Ensure this route exists
  router.post("/", authenticate, bookController.addBook);
  router.delete("/:id", authenticate, bookController.deleteBook);

  return router;
};
