const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const UserModel = require("../models/User");
const { Op } = require("sequelize");
const { randomBytes, createHash } = require("node:crypto");
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
const resetMessage = "If an account exists for that email, a password-reset link will be sent.";

module.exports = (sequelize, options = {}) => {
  const User = UserModel(sequelize);

  return {
    register: async (req, res) => {
      try {
        const { name, email, password, username } = req.body;
        if (typeof name !== "string" || !name.trim() || name.length > 255 ||
            typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            typeof password !== "string" || password.length < 8 || Buffer.byteLength(password) > 72 ||
            (username !== undefined && (typeof username !== "string" || !/^[a-zA-Z0-9_.-]{3,32}$/.test(username)))) {
          return res.status(400).json({ message: "Enter a name, valid email, username (3-32 letters, numbers, dots, underscores or hyphens), and password (8-72 bytes)." });
        }
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedUsername = username?.toLowerCase() || null;

        // Check if user already exists
        const existingUser = await User.findOne({ where: { [Op.or]: [{ email: normalizedEmail }, ...(normalizedUsername ? [{ username: normalizedUsername }, { name: normalizedUsername, username: null }] : [{ name: name.trim() }])] } });
        if (existingUser) {
          return res.status(400).json({ message: "Email or username already registered" });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        await User.create({ name: name.trim(), username: normalizedUsername, email: normalizedEmail, password: hashedPassword });

        res.status(201).json({ message: "User registered successfully" });
      } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") return res.status(400).json({ message: "Email or username already registered" });
        res.status(500).json({ message: "Server error" });
      }
    },

    login: async (req, res) => {
      try {
        const { email, password, username } = req.body;
        if (typeof password !== "string" || (typeof username !== "string" && typeof email !== "string")) {
          return res.status(400).json({ message: "Invalid username or password" });
        }

        // Check if user exists
        // Email login remains compatible with existing API clients; the UI uses username only.
        let user;
        if (typeof username === "string") {
          user = await User.findOne({ where: { username: username.trim().toLowerCase() } });
          if (!user) {
            const legacy = await User.findAll({ where: { username: null, name: username.trim() }, limit: 2 });
            if (legacy.length === 1) user = legacy[0];
          }
        } else {
          user = await User.findOne({ where: { email: email.trim().toLowerCase() } });
        }
        if (!user) {
          return res.status(400).json({ message: "Invalid username or password" });
        }

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(400).json({ message: "Invalid username or password" });
        }

        // Generate JWT token
        const token = jwt.sign({ userId: user.id, authVersion: user.authVersion || 0 }, process.env.JWT_SECRET, { expiresIn: "1h" });

        res.json({ token, user: { id: user.id, name: user.name, username: user.username, email: user.email } });
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    },

    forgotPassword: async (req, res) => {
      const email = req.body.email;
      if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Enter a valid email address." });
      }
      let send;
      try { send = options.sendReset || require("../services/passwordMail")(); } catch { send = null; }
      if (!send) return res.status(503).json({ message: "Password recovery is not configured. Please contact the administrator." });
      try {
        await sequelize.transaction(async (transaction) => {
          const user = await User.findOne({ where: { email: email.trim().toLowerCase() }, transaction, lock: transaction.LOCK.UPDATE });
          if (!user || new Date(user.resetTokenExpires).getTime() > Date.now() + 29 * 60 * 1000) return;
          const token = randomBytes(32).toString("hex");
          await send(user.email, token);
          await user.update({ resetTokenHash: tokenHash(token), resetTokenExpires: new Date(Date.now() + 30 * 60 * 1000) }, { transaction });
        });
      } catch {
        // Never log reset tokens or reveal whether the email belongs to an account.
        console.error("Password recovery delivery or storage failed.");
      }
      return res.json({ message: resetMessage });
    },

    resetPassword: async (req, res) => {
      const { token, password } = req.body;
      if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token) || typeof password !== "string" || password.length < 8 || Buffer.byteLength(password) > 72) {
        return res.status(400).json({ message: "Use a valid reset link and a password of at least 8 characters (maximum 72 bytes)." });
      }
      try {
        const changed = await sequelize.transaction(async (transaction) => {
          const user = await User.findOne({ where: { resetTokenHash: tokenHash(token), resetTokenExpires: { [Op.gt]: new Date() } }, transaction, lock: transaction.LOCK.UPDATE });
          if (!user) return false;
          await user.update({ password: await bcrypt.hash(password, 10), resetTokenHash: null, resetTokenExpires: null, authVersion: user.authVersion + 1 }, { transaction });
          return true;
        });
        if (!changed) return res.status(400).json({ message: "This reset link is invalid or expired. Request a new one." });
        return res.json({ message: "Password changed. Please log in with your new password." });
      } catch {
        return res.status(500).json({ message: "Server error" });
      }
    },
  };
};
