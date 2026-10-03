const express = require("express");
const router = express.Router();
const { rateLimit } = require("express-rate-limit");
const { createHash } = require("node:crypto");

module.exports = (sequelize) => {
  const userController = require("../controllers/userController")(sequelize);

  router.post("/register", userController.register);
  router.post("/login", userController.login);
  router.post("/forgot-password", rateLimit({
    windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: (req) => createHash("sha256").update(String(req.body.email || "").trim().toLowerCase()).digest("hex"),
    message: { message: "Too many reset requests. Please try again in 15 minutes." },
  }), userController.forgotPassword);
  router.post("/reset-password", rateLimit({
    windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
    message: { message: "Too many reset attempts. Please try again in 15 minutes." },
  }), userController.resetPassword);

  return router;
};
