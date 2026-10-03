const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

module.exports = (sequelize) => {
  const reviewController = require("../controllers/reviewController")(sequelize);
  const authenticate = authMiddleware.withSession(sequelize);

  router.post("/", authenticate, reviewController.addReview);
  router.put("/:id", authenticate, reviewController.updateReview);
  router.delete("/:id", authenticate, reviewController.deleteReview);
  router.get("/:bookId", reviewController.getReviewsForBook);

  return router;
};
