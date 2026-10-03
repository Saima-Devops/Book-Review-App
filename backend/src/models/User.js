const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("User", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    username: { type: DataTypes.STRING(32), allowNull: true, unique: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    resetTokenHash: { type: DataTypes.STRING(64), allowNull: true },
    resetTokenExpires: { type: DataTypes.DATE, allowNull: true },
    authVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  });
};
