const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("Book", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING, allowNull: false },
    author: { type: DataTypes.STRING, allowNull: false },
    synopsis: { type: DataTypes.TEXT, allowNull: true },
    uploadedBy: { type: DataTypes.INTEGER, allowNull: true },
    catalogId: { type: DataTypes.STRING(32), allowNull: true, unique: true },
    sourceUrl: { type: DataTypes.STRING(512), allowNull: true },
    coverData: { type: DataTypes.TEXT("medium"), allowNull: true },
    coverVersion: { type: DataTypes.STRING(64), allowNull: true },
    rating: { type: DataTypes.FLOAT, defaultValue: 0 },
  });
};
