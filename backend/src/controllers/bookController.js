const BookModel = require("../models/Book");
const ReviewModel = require("../models/Review");
const { Op } = require("sequelize");
const { VALID_ID, sourceUrl } = require("../services/bookCatalog");
const normalizeCover = require("../services/bookCover");
const publicBook = (book) => {
  const data = book.toJSON ? book.toJSON() : { ...book };
  delete data.coverData;
  return data;
};

module.exports = (sequelize) => {
  const Book = BookModel(sequelize);
  const Review = ReviewModel(sequelize);

  return {
    getAllBooks: async (req, res) => {
      try {
        const books = await Book.findAll({ attributes: { exclude: ["coverData"] } });
        res.json(books.map(publicBook));
      } catch (error) {
        res.status(500).json({ message: "Server error while fetching books", error });
      }
    },

    getBookById: async (req, res) => {
      try {
        const { id } = req.params;
        const book = await Book.findByPk(id, { attributes: { exclude: ["coverData"] } });

        if (!book) {
          return res.status(404).json({ message: "Book not found" });
        }

        res.json(publicBook(book));
      } catch (error) {
        res.status(500).json({ message: "Server error while fetching book", error });
      }
    },

    addBook: async (req, res) => {
      try {
        const { title, author, rating, synopsis = "", catalogId = null, sourceUrl: submittedSource = null } = req.body;
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
        if ((catalogId !== null && (typeof catalogId !== "string" || !VALID_ID.test(catalogId))) ||
            (submittedSource !== null && (!catalogId || submittedSource !== sourceUrl(catalogId)))) {
          return res.status(400).json({ message: "Choose a valid catalog book or enter the book manually." });
        }

        const match = { title: title.trim(), author: author.trim() };
        const existingBook = await Book.findOne({ where: catalogId ? { [Op.or]: [match, { catalogId }] } : match });
        if (existingBook) {
          return res.status(400).json({ message: "Book already exists" });
        }

        const normalizedCover = await normalizeCover(req.body.cover);
        const newBook = await Book.create({
          title: title.trim(), author: author.trim(), rating: normalizedRating,
          synopsis: synopsis.trim(), uploadedBy: req.user.userId,
          catalogId, sourceUrl: catalogId ? sourceUrl(catalogId) : null,
          ...normalizedCover,
        });

        res.status(201).json({ message: "Book added successfully", book: publicBook(newBook) });
      } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        if (error.name === "SequelizeUniqueConstraintError") return res.status(400).json({ message: "Book already exists" });
        res.status(500).json({ message: "Server error while adding book", error });
      }
    },

    getCover: async (req, res) => {
      try {
        const book = await Book.findByPk(req.params.id, { attributes: ["id", "coverData", "coverVersion"] });
        if (!book?.coverData) return res.status(404).json({ message: "Cover not found" });
        res.set({ "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=3600", ETag: `"${book.coverVersion}"` });
        res.send(Buffer.from(book.coverData, "base64"));
      } catch { res.status(500).json({ message: "Unable to load cover" }); }
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
