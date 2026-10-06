const { DataTypes } = require("sequelize");

module.exports = async (sequelize, Book) => {
  const query = sequelize.getQueryInterface();
  const table = Book.getTableName();
  if (!(await query.tableExists(table))) return;

  // Add only missing fields; never recreate the table or guess legacy ownership.
  const columns = await query.describeTable(table);
  for (const [name, type] of [["synopsis", DataTypes.TEXT], ["uploadedBy", DataTypes.INTEGER], ["catalogId", DataTypes.STRING(32)], ["sourceUrl", DataTypes.STRING(512)]]) {
    if (!columns[name]) await query.addColumn(table, name, { type, allowNull: true, ...(name === "catalogId" ? { unique: true } : {}) });
  }
};
