const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

module.exports = (sequelize) => {
  const reviewController = require("../controllers/reviewController")(sequelize);

  router.post("/", authMiddleware, reviewController.addReview);
  router.put("/:id", authMiddleware, reviewController.updateReview);
  router.delete("/:id", authMiddleware, reviewController.deleteReview);
  router.get("/:bookId", reviewController.getReviewsForBook);

  return router;
};
