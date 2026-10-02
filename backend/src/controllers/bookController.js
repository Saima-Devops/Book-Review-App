const BookModel = require("../models/Book");

module.exports = (sequelize) => {
  const Book = BookModel(sequelize);

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
        const { title, author, rating } = req.body;
        const normalizedRating = Number(rating || 0);

        if (!title?.trim() || !author?.trim()) {
          return res.status(400).json({ message: "Title and author are required" });
        }

        if (!Number.isFinite(normalizedRating) || normalizedRating < 0 || normalizedRating > 5) {
          return res.status(400).json({ message: "Rating must be between 0 and 5" });
        }

        const existingBook = await Book.findOne({ where: { title: title.trim(), author: author.trim() } });
        if (existingBook) {
          return res.status(400).json({ message: "Book already exists" });
        }

        const newBook = await Book.create({ title: title.trim(), author: author.trim(), rating: normalizedRating });

        res.status(201).json({ message: "Book added successfully", book: newBook });
      } catch (error) {
        res.status(500).json({ message: "Server error while adding book", error });
      }
    }
  };
};
