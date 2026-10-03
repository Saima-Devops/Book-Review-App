const BookModel = require("../models/Book");
const ReviewModel = require("../models/Review");

module.exports = (sequelize) => {
  const Book = BookModel(sequelize);
  const Review = ReviewModel(sequelize);

  return {
    getAllBooks: async (req, res) => {
      try {
        const books = await Book.findAll();
        res.json(books);
      } catch (error) {
        res.status(500).json({ message: "Server error while fetching books", error });
      }
    },

    getBookById: async (req, res) => {
      try {
        const { id } = req.params;
        const book = await Book.findByPk(id);

        if (!book) {
          return res.status(404).json({ message: "Book not found" });
        }

        res.json(book);
      } catch (error) {
        res.status(500).json({ message: "Server error while fetching book", error });
      }
    },

    addBook: async (req, res) => {
      try {
        const { title, author, rating, synopsis = "" } = req.body;
        const normalizedRating = Number(rating || 0);

        if (typeof title !== "string" || typeof author !== "string" || !title.trim() || !author.trim()) {
          return res.status(400).json({ message: "Title and author are required" });
        }

        if (title.trim().length > 255 || author.trim().length > 255) {
          return res.status(400).json({ message: "Title and author must each be 255 characters or fewer" });
        }

        if (typeof synopsis !== "string" || synopsis.trim().length > 2000) {
          return res.status(400).json({ message: "Synopsis must be text with 2000 characters or fewer" });
        }

        if (!Number.isFinite(normalizedRating) || normalizedRating < 0 || normalizedRating > 5) {
          return res.status(400).json({ message: "Rating must be between 0 and 5" });
        }

        const existingBook = await Book.findOne({ where: { title: title.trim(), author: author.trim() } });
        if (existingBook) {
          return res.status(400).json({ message: "Book already exists" });
        }

        const newBook = await Book.create({
          title: title.trim(), author: author.trim(), rating: normalizedRating,
          synopsis: synopsis.trim(), uploadedBy: req.user.userId,
        });

        res.status(201).json({ message: "Book added successfully", book: newBook });
      } catch (error) {
        res.status(500).json({ message: "Server error while adding book", error });
      }
    },

    deleteBook: async (req, res) => {
      try {
        const result = await sequelize.transaction(async (transaction) => {
          const book = await Book.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
          if (!book) return { status: 404, message: "Book not found" };
          if (book.uploadedBy !== req.user.userId) {
            return { status: 403, message: "You can delete only books you uploaded" };
          }
          await Review.destroy({ where: { bookId: book.id }, transaction });
          await book.destroy({ transaction });
          return { status: 200, message: "Book deleted successfully" };
        });
        res.status(result.status).json({ message: result.message });
      } catch (error) {
        res.status(500).json({ message: "Server error while deleting book" });
      }
    },
  };
};
