const ReviewModel = require("../models/Review");
const BookModel = require("../models/Book");
const UserModel = require("../models/User");

module.exports = (sequelize) => {
  const Review = ReviewModel(sequelize);
  const Book = BookModel(sequelize);
  const User = UserModel(sequelize);

  const updateBookRating = async (bookId) => {
    const reviews = await Review.findAll({ where: { bookId } });
    const book = await Book.findByPk(bookId);

    if (!book) return;

    const nextRating = reviews.length
      ? reviews.reduce((total, review) => total + Number(review.rating), 0) / reviews.length
      : 0;

    await book.update({ rating: Number(nextRating.toFixed(1)) });
  };

  const isValidRating = (rating) => {
    const value = Number(rating);
    return Number.isInteger(value) && value >= 1 && value <= 5;
  };

  return {
    addReview: async (req, res) => {
      try {
        const { bookId, comment, rating } = req.body;
        const userId = req.user.userId; // Extract userId from JWT token

        if (!bookId || !comment?.trim() || !isValidRating(rating)) {
          return res.status(400).json({ message: "Book, review text, and a 1-5 star rating are required" });
        }

        // Get the username from the User model
        const user = await User.findByPk(userId);
        if (!user) {
          return res.status(400).json({ message: "User not found" });
        }

        // Check if the book exists
        const book = await Book.findByPk(bookId);
        if (!book) {
          return res.status(404).json({ message: "Book not found" });
        }

        // Create a new review with username and timestamp
        const newReview = await Review.create({
          userId,
          bookId,
          comment,
          rating,
          username: user.name, // Store username
        });

        await updateBookRating(bookId);
        res.status(201).json({ message: "Review added successfully", review: newReview });
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    },

    updateReview: async (req, res) => {
      try {
        const { id } = req.params;
        const { comment, rating } = req.body;
        const userId = req.user.userId;

        if (!comment?.trim() || !isValidRating(rating)) {
          return res.status(400).json({ message: "Review text and a 1-5 star rating are required" });
        }

        const review = await Review.findByPk(id);
        if (!review) {
          return res.status(404).json({ message: "Review not found" });
        }

        if (review.userId !== userId) {
          return res.status(403).json({ message: "You can edit only your own review" });
        }

        await review.update({ comment: comment.trim(), rating });
        await updateBookRating(review.bookId);

        res.json({ message: "Review updated successfully", review });
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    },

    deleteReview: async (req, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.userId;

        const review = await Review.findByPk(id);
        if (!review) {
          return res.status(404).json({ message: "Review not found" });
        }

        if (review.userId !== userId) {
          return res.status(403).json({ message: "You can delete only your own review" });
        }

        const { bookId } = review;
        await review.destroy();
        await updateBookRating(bookId);

        res.json({ message: "Review deleted successfully" });
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    },

    getReviewsForBook: async (req, res) => {
      try {
        const { bookId } = req.params;

        // Fetch reviews for the book, including usernames
        const reviews = await Review.findAll({
          where: { bookId },
          order: [["createdAt", "DESC"]], // Show latest reviews first
        });

        res.json(reviews);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    },
  };
};
