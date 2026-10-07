const express = require("express");
require("dotenv").config();
const cors = require("cors");
const initializeDatabase = require("./config/db");

const app = express();
app.use("/api/books", express.json({ limit: "768kb" }));
app.use(express.json());
app.use((error, req, res, next) => {
  if (error.type === "entity.too.large") return res.status(413).json({ message: "Cover upload is too large. Choose a smaller image." });
  if (error.type === "entity.parse.failed") return res.status(400).json({ message: "Invalid request body" });
  next(error);
});

// Read allowed origins from environment variables
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : ["http://localhost:3000"];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true); // Allow requests from valid origins
    } else {
      callback(new Error("CORS policy: Not allowed by server"));
    }
  },
  credentials: true,
}));

// Debugging: Log incoming requests
app.use((req, res, next) => {
  console.log(`🛠 Incoming request from: ${req.headers.origin}`);
  next();
});

async function startServer() {
  try {
    // Initialize database
    const sequelize = await initializeDatabase();

    // Load models
    const User = require("./models/User")(sequelize);
    const Book = require("./models/Book")(sequelize);
    const Review = require("./models/Review")(sequelize);

    // Sync database in the correct order (Users -> Books -> Reviews)
    await require("./config/migrateUserFields")(sequelize, User);
    await User.sync();
    await require("./config/migrateBookFields")(sequelize, Book);
    await Book.sync();
    await Review.sync();
    const Report = require("./models/Report")(sequelize);
    await Report.sync();

    console.log("✅ Database schema updated successfully!");

    // Insert sample books if table is empty
    const bookCount = await Book.count();
    if (bookCount === 0 && await Report.count() === 0) {
      await Book.bulkCreate([
        { title: "The Pragmatic Programmer", author: "Andrew Hunt", rating: 4.8 },
        { title: "Clean Code", author: "Robert C. Martin", rating: 4.7 },
        { title: "JavaScript: The Good Parts", author: "Douglas Crockford", rating: 4.5 },
      ]);
      console.log("📚 Sample books added!");
    }

    // Load routes
    const userRoutes = require("./routes/userRoutes")(sequelize);
    const bookRoutes = require("./routes/bookRoutes")(sequelize);
    const reviewRoutes = require("./routes/reviewRoutes")(sequelize);

    // Register API routes
    app.use("/api/users", userRoutes);
    app.use("/api/books", bookRoutes);
    app.use("/api/reviews", reviewRoutes);
    app.use("/api/reports", require("./routes/reportRoutes")(sequelize));

    // Health check route
    app.get("/", (req, res) => {
      res.send("📚 Book Review API is running...");
    });

    // Start the server
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

// Start the server
startServer();
