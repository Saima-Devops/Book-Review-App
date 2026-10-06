const { readFileSync } = require("node:fs");
const { X509Certificate } = require("node:crypto");

module.exports = function databaseOptions(env) {
  const options = {
    host: env.DB_HOST, dialect: "mysql", port: env.DB_PORT || 3306, logging: false,
  };
  if (env.DB_SSL && !["true", "false"].includes(env.DB_SSL)) {
    throw new Error("DB_SSL must be true or false");
  }
  if (env.DB_SSL !== "true") {
    if (env.DB_SSL_CA || env.DB_SSL_CA_FILE) {
      throw new Error("Set DB_SSL=true when supplying a database CA certificate");
    }
    return options;
  }
  if (Boolean(env.DB_SSL_CA) === Boolean(env.DB_SSL_CA_FILE)) {
    throw new Error("TLS requires exactly one of DB_SSL_CA or DB_SSL_CA_FILE");
  }
  const ca = env.DB_SSL_CA || readFileSync(env.DB_SSL_CA_FILE, "utf8");
  // Reject invalid certificates before attempting a connection, without logging their contents.
  try {
    new X509Certificate(ca);
  } catch {
    throw new Error("Invalid database CA certificate");
  }
  options.dialectOptions = {
    ssl: { ca, rejectUnauthorized: true, verifyIdentity: true },
  };
  return options;
};
