const { Sequelize } = require("sequelize");
require("dotenv").config();
const databaseOptions = require("./databaseOptions");
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, databaseOptions(process.env));
module.exports = async () => {
  await sequelize.authenticate();
  console.log("Database connected successfully");
  return sequelize;
};
