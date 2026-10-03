const { DataTypes } = require("sequelize");

module.exports = async (sequelize, User) => {
  const query = sequelize.getQueryInterface();
  const table = User.getTableName();
  if (!(await query.tableExists(table))) return;
  const columns = await query.describeTable(table);
  const additions = {
    username: { type: DataTypes.STRING(32), allowNull: true, unique: true },
    resetTokenHash: { type: DataTypes.STRING(64), allowNull: true },
    resetTokenExpires: { type: DataTypes.DATE, allowNull: true },
    authVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  };
  for (const [name, definition] of Object.entries(additions)) {
    if (!columns[name]) await query.addColumn(table, name, definition);
  }
};
