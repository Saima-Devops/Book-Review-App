const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(401).json({ message: "Access denied. No token provided." });

  try {
    const decoded = jwt.verify(token.replace("Bearer ", ""), process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ message: "Invalid token" });
  }
};

module.exports.withSession = (sequelize) => {
  const User = require("../models/User")(sequelize);
  return (req, res, next) => module.exports(req, res, async () => {
    try {
      const user = await User.findByPk(req.user.userId);
      if (!user || (req.user.authVersion || 0) !== user.authVersion) {
        return res.status(401).json({ message: "Please log in again." });
      }
      next();
    } catch {
      res.status(500).json({ message: "Server error" });
    }
  });
};
