function isAdmin(userId, env = process.env) {
  return String(env.ADMIN_USER_IDS || "").split(",").map((id) => id.trim())
    .filter((id) => /^[1-9]\d*$/.test(id)).includes(String(userId));
}

module.exports = (req, res, next) => {
  if (!isAdmin(req.user.userId)) return res.status(403).json({ message: "Administrator access required" });
  next();
};
module.exports.isAdmin = isAdmin;
