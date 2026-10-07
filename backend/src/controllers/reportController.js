const { isAdmin } = require("../middleware/adminMiddleware");
const reasons = ["spam", "harassment", "inappropriate", "copyright", "misleading", "other"];
const validId = (id) => /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(Number(id)) && Number(id) <= 2147483647;

module.exports = (sequelize) => {
  const Report = require("../models/Report")(sequelize);
  const Book = require("../models/Book")(sequelize);
  const Review = require("../models/Review")(sequelize);
  return {
    access: (req, res) => res.json({ isAdmin: isAdmin(req.user.userId) }),

    create: async (req, res) => {
      const { targetType, targetId, reason, details = "" } = req.body || {};
      if (!["book", "review"].includes(targetType) || !validId(targetId) || !reasons.includes(reason) ||
          typeof details !== "string" || details.length > 2000) {
        return res.status(400).json({ message: "Choose valid content and a reason; details must be 2000 characters or fewer." });
      }
      try {
        const target = await (targetType === "book" ? Book : Review).findByPk(targetId);
        if (!target) return res.status(404).json({ message: "This content is no longer available" });
        const book = targetType === "book" ? target : await Book.findByPk(target.bookId);
        if (!book) return res.status(404).json({ message: "This book is no longer available" });
        await Report.create({
          reporterId: req.user.userId, targetType, targetId: Number(targetId), bookId: book.id,
          targetTitle: book.title,
          contentSnapshot: (targetType === "book" ? `${book.author}\n${book.synopsis || ""}` : target.comment).slice(0, 8000),
          reason, details: details.trim(),
        });
        return res.status(201).json({ message: "Report submitted. An administrator will review it." });
      } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") return res.status(409).json({ message: "You have already reported this content." });
        return res.status(500).json({ message: "Unable to submit report" });
      }
    },

    list: async (req, res) => {
      const status = req.query.status || "pending";
      const page = Number(req.query.page || 1);
      if (!["pending", "dismissed", "removed"].includes(status) || !Number.isInteger(page) || page < 1 || page > 100000) {
        return res.status(400).json({ message: "Invalid report filter or page" });
      }
      try {
        const result = await Report.findAndCountAll({ where: { status }, order: [["createdAt", "DESC"], ["id", "DESC"]], limit: 20, offset: (page - 1) * 20 });
        res.json({ reports: result.rows, total: result.count, page, pageSize: 20 });
      } catch {
        res.status(500).json({ message: "Unable to load reports" });
      }
    },

    resolve: async (req, res) => {
      const { action, note = "" } = req.body || {};
      if (!validId(req.params.id) || !["dismiss", "remove"].includes(action) || typeof note !== "string" || note.length > 2000) {
        return res.status(400).json({ message: "Choose a valid action; notes must be 2000 characters or fewer." });
      }
      try {
        const result = await sequelize.transaction(async (transaction) => {
          const report = await Report.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
          if (!report) return { code: 404, message: "Report not found" };
          if (report.status !== "pending") return { code: 409, message: "This report has already been resolved" };
          const decision = { status: action === "remove" ? "removed" : "dismissed", moderatorId: req.user.userId, moderatorNote: note.trim(), resolvedAt: new Date() };
          if (action === "remove") {
            // Match the book lock used by review creation and owner book deletion.
            const book = await Book.findByPk(report.bookId, { transaction, lock: transaction.LOCK.UPDATE });
            if (report.targetType === "book") {
              await Review.destroy({ where: { bookId: report.bookId }, transaction });
              if (book) await book.destroy({ transaction });
              await Report.update(decision, { where: { bookId: report.bookId, status: "pending" }, transaction });
            } else {
              await Review.destroy({ where: { id: report.targetId, bookId: report.bookId }, transaction });
              if (book) {
                const remaining = await Review.findAll({ where: { bookId: book.id }, transaction });
                const rating = remaining.length ? remaining.reduce((sum, review) => sum + Number(review.rating), 0) / remaining.length : 0;
                await book.update({ rating: Number(rating.toFixed(1)) }, { transaction });
              }
              await Report.update(decision, { where: { targetType: "review", targetId: report.targetId, status: "pending" }, transaction });
            }
          } else {
            await report.update(decision, { transaction });
          }
          return { code: 200, message: action === "remove" ? "Content removed; related reports resolved." : "Report dismissed; content unchanged." };
        });
        res.status(result.code).json({ message: result.message });
      } catch {
        res.status(500).json({ message: "Unable to resolve report. No moderation changes were committed." });
      }
    },
  };
};
