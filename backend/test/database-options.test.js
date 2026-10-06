const assert = require("node:assert/strict");
const { test } = require("node:test");
const { rootCertificates } = require("node:tls");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const databaseOptions = require("../src/config/databaseOptions");

test("local MySQL keeps its existing non-TLS defaults", () => {
  assert.deepEqual(databaseOptions({ DB_HOST: "database" }), {
    host: "database", dialect: "mysql", port: 3306, logging: false,
  });
  assert.equal(databaseOptions({ DB_SSL: "false", DB_PORT: "24720" }).port, "24720");
});

test("inline CA enables verification of both certificate and hostname", () => {
  const result = databaseOptions({ DB_SSL: "true", DB_SSL_CA: rootCertificates[0] });
  assert.deepEqual(result.dialectOptions.ssl, {
    ca: rootCertificates[0], rejectUnauthorized: true, verifyIdentity: true,
  });
});

test("mounted CA file is supported", () => {
  const dir = mkdtempSync(join(tmpdir(), "book-shelf-ca-"));
  try {
    const path = join(dir, "ca.pem");
    writeFileSync(path, rootCertificates[0]);
    assert.equal(databaseOptions({ DB_SSL: "true", DB_SSL_CA_FILE: path }).dialectOptions.ssl.ca, rootCertificates[0]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const [name, env] of [
  ["missing CA", { DB_SSL: "true" }],
  ["ambiguous CA", { DB_SSL: "true", DB_SSL_CA: rootCertificates[0], DB_SSL_CA_FILE: "/ca.pem" }],
  ["invalid CA", { DB_SSL: "true", DB_SSL_CA: "not a certificate" }],
  ["missing file", { DB_SSL: "true", DB_SSL_CA_FILE: "/does-not-exist-book-shelf/ca.pem" }],
  ["invalid TLS mode", { DB_SSL: "yes" }],
  ["CA without TLS", { DB_SSL_CA: rootCertificates[0] }],
  ["CA with TLS disabled", { DB_SSL: "false", DB_SSL_CA_FILE: "/ca.pem" }],
]) {
  test(`${name} fails closed`, () => assert.throws(() => databaseOptions(env)));
}
