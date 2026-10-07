const { DataTypes } = require("sequelize");

module.exports = (sequelize) => sequelize.define("Report", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  reporterId: { type: DataTypes.INTEGER, allowNull: false },
  targetType: { type: DataTypes.ENUM("book", "review"), allowNull: false },
  targetId: { type: DataTypes.INTEGER, allowNull: false },
  bookId: { type: DataTypes.INTEGER, allowNull: false },
  targetTitle: { type: DataTypes.STRING, allowNull: false },
  contentSnapshot: { type: DataTypes.TEXT, allowNull: false },
  reason: { type: DataTypes.STRING(32), allowNull: false },
  details: { type: DataTypes.STRING(2000), allowNull: false, defaultValue: "" },
  status: { type: DataTypes.ENUM("pending", "dismissed", "removed"), allowNull: false, defaultValue: "pending" },
  moderatorId: { type: DataTypes.INTEGER, allowNull: true },
  moderatorNote: { type: DataTypes.STRING(2000), allowNull: false, defaultValue: "" },
  resolvedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  indexes: [
    { unique: true, fields: ["reporterId", "targetType", "targetId"] },
    { fields: ["status", "createdAt"] },
  ],
});
