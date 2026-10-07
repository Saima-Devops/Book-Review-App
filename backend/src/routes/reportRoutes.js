const express = require("express");
const { rateLimit } = require("express-rate-limit");
const admin = require("../middleware/adminMiddleware");

module.exports = (sequelize) => {
  const router = express.Router();
  const controller = require("../controllers/reportController")(sequelize);
  router.use(require("../middleware/authMiddleware").withSession(sequelize));
  router.get("/access", controller.access);
  router.post("/", rateLimit({
    windowMs: 60 * 60 * 1000, limit: 10,
    keyGenerator: (req) => String(req.user.userId),
    standardHeaders: "draft-8", legacyHeaders: false,
    message: { message: "Too many reports. Please try again later." },
  }), controller.create);
  router.get("/", admin, controller.list);
  router.patch("/:id", admin, controller.resolve);
  return router;
};
