const { test, mock } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createHash } = require("node:crypto");
const controllers = require("../src/controllers/userController");
const auth = require("../src/middleware/authMiddleware");
const migrate = require("../src/config/migrateUserFields");

function response() {
  return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
function fixture() {
  const user = { id: 7, name: "Existing Reader", username: "reader", email: "reader@example.test", authVersion: 0 };
  user.update = mock.fn(async (values) => Object.assign(user, values));
  const User = { findOne: mock.fn(async () => user), findAll: mock.fn(async () => [user]), findByPk: mock.fn(async () => user), create: mock.fn(async (values) => values) };
  const sequelize = { define: () => User, transaction: async (fn) => fn({ LOCK: { UPDATE: "UPDATE" } }) };
  const sendReset = mock.fn(async () => {});
  return { user, User, sequelize, sendReset, controller: controllers(sequelize, { sendReset }) };
}

test("username login uses a normalized username, not email", async () => {
  const f = fixture(); process.env.JWT_SECRET = "test-secret";
  f.user.password = await bcrypt.hash("correct-password", 4);
  const res = response();
  await f.controller.login({ body: { username: " Reader ", password: "correct-password" } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(f.User.findOne.mock.calls[0].arguments[0], { where: { username: "reader" } });
  assert.equal(jwt.verify(res.body.token, process.env.JWT_SECRET).authVersion, 0);
  assert.equal(res.body.user.resetTokenHash, undefined);
});

test("unique legacy name remains usable; ambiguous legacy names cannot log in", async () => {
  const f = fixture(); process.env.JWT_SECRET = "test-secret";
  f.User.findOne = async () => null;
  f.user.password = await bcrypt.hash("correct-password", 4);
  const res = response();
  await f.controller.login({ body: { username: "Existing Reader", password: "correct-password" } }, res);
  assert.ok(res.body.token);
  f.User.findAll = async () => [f.user, { ...f.user, id: 8 }];
  const ambiguous = response();
  await f.controller.login({ body: { username: "Existing Reader", password: "correct-password" } }, ambiguous);
  assert.equal(ambiguous.code, 400);
});

test("recovery stores only a hash, sets expiry, and does not return the token", async () => {
  const f = fixture(); const res = response(); const before = Date.now();
  await f.controller.forgotPassword({ body: { email: f.user.email } }, res);
  assert.equal(res.code, 200);
  const token = f.sendReset.mock.calls[0].arguments[1];
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(f.user.resetTokenHash, createHash("sha256").update(token).digest("hex"));
  assert.notEqual(f.user.resetTokenHash, token);
  assert.ok(f.user.resetTokenExpires.getTime() >= before + 30 * 60 * 1000);
  assert.ok(!JSON.stringify(res.body).includes(token));
  await f.controller.forgotPassword({ body: { email: f.user.email } }, response());
  assert.equal(f.sendReset.mock.callCount(), 1, "cooldown blocks repeat delivery");
});

test("unknown email receives the same generic response without mail delivery", async () => {
  const known = fixture(); const first = response();
  await known.controller.forgotPassword({ body: { email: known.user.email } }, first);
  const unknown = fixture(); unknown.User.findOne = async () => null; const second = response();
  await unknown.controller.forgotPassword({ body: { email: "unknown@example.test" } }, second);
  assert.deepEqual(second.body, first.body);
  assert.equal(unknown.sendReset.mock.callCount(), 0);
});

test("recovery accepts surrounding email whitespace and supplies the login username", async () => {
  const f = fixture(); const res = response();
  await f.controller.forgotPassword({ body: { email: ` ${f.user.email.toUpperCase()} ` } }, res);
  assert.equal(res.code, 200);
  assert.equal(f.User.findOne.mock.calls[0].arguments[0].where.email, f.user.email);
  assert.equal(f.sendReset.mock.calls[0].arguments[2], "reader");
});

test("a new recovery request after cooldown replaces the previous link", async () => {
  const f = fixture();
  await f.controller.forgotPassword({ body: { email: f.user.email } }, response());
  const previous = f.user.resetTokenHash;
  f.user.resetTokenExpires = new Date(Date.now() + 28 * 60 * 1000);
  await f.controller.forgotPassword({ body: { email: f.user.email } }, response());
  assert.equal(f.sendReset.mock.callCount(), 2);
  assert.notEqual(f.user.resetTokenHash, previous);
});

test("a failed email delivery does not replace the stored link or change the password", async () => {
  const f = fixture(); f.user.password = "original-hash";
  f.sendReset.mock.mockImplementation(async () => { throw new Error("SMTP rejected"); });
  const log = mock.method(console, "error", () => {});
  try {
    const res = response();
    await f.controller.forgotPassword({ body: { email: f.user.email } }, res);
    assert.equal(res.code, 200);
    assert.equal(f.user.update.mock.callCount(), 0);
    assert.equal(f.user.password, "original-hash");
    assert.equal(log.mock.calls[0].arguments[0], "Password recovery delivery or storage failed.");
  } finally { log.mock.restore(); }
});

test("reset makes the new password usable, rejects the old password, and prevents token reuse", async () => {
  const f = fixture(); process.env.JWT_SECRET = "test-secret";
  const token = "a".repeat(64);
  f.user.password = await bcrypt.hash("old-password", 4);
  f.user.resetTokenHash = createHash("sha256").update(token).digest("hex");
  f.user.resetTokenExpires = new Date(Date.now() + 30000);
  f.User.findOne = async ({ where }) => {
    if (where.resetTokenHash) return where.resetTokenHash === f.user.resetTokenHash && f.user.resetTokenExpires > new Date() ? f.user : null;
    if (where.username) return where.username === f.user.username ? f.user : null;
    return null;
  };
  await f.controller.resetPassword({ body: { token, password: "new-password" } }, response());
  const valid = response();
  await f.controller.login({ body: { username: "reader", password: "new-password" } }, valid);
  assert.ok(valid.body.token);
  const old = response();
  await f.controller.login({ body: { username: "reader", password: "old-password" } }, old);
  assert.equal(old.code, 400);
  const reused = response();
  await f.controller.resetPassword({ body: { token, password: "another-password" } }, reused);
  assert.equal(reused.code, 400);
  assert.equal(await bcrypt.compare("new-password", f.user.password), true);
});

test("reset hashes the password, consumes token, and increments session version", async () => {
  const f = fixture(); const res = response();
  await f.controller.resetPassword({ body: { token: "a".repeat(64), password: "new-password" } }, res);
  assert.equal(res.code, 200);
  assert.equal(await bcrypt.compare("new-password", f.user.password), true);
  assert.equal(f.user.resetTokenHash, null);
  assert.equal(f.user.resetTokenExpires, null);
  assert.equal(f.user.authVersion, 1);
  const lookup = f.User.findOne.mock.calls[0].arguments[0];
  assert.equal(lookup.lock, "UPDATE");
  assert.ok(Reflect.ownKeys(lookup.where.resetTokenExpires).length);
});

test("expired, missing or reused token never changes password", async () => {
  const f = fixture(); f.User.findOne = async () => null;
  const res = response();
  await f.controller.resetPassword({ body: { token: "b".repeat(64), password: "new-password" } }, res);
  assert.equal(res.code, 400);
  assert.equal(f.user.update.mock.callCount(), 0);
});

for (const body of [{ token: "bad", password: "new-password" }, { token: "a".repeat(64), password: "short" }, { token: "a".repeat(64), password: "x".repeat(73) }]) {
  test("invalid recovery input is rejected before database access", async () => {
    const f = fixture(); const res = response();
    await f.controller.resetPassword({ body }, res);
    assert.equal(res.code, 400); assert.equal(f.User.findOne.mock.callCount(), 0);
  });
}

test("session middleware rejects a JWT issued before a password reset", async () => {
  const f = fixture(); process.env.JWT_SECRET = "test-secret"; f.user.authVersion = 1;
  const token = jwt.sign({ userId: 7, authVersion: 0 }, process.env.JWT_SECRET);
  const res = response(); const next = mock.fn();
  await auth.withSession(f.sequelize)({ header: () => `Bearer ${token}` }, res, next);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(res.code, 401); assert.equal(next.mock.callCount(), 0);
});

test("user migration only adds missing columns and remains safe to repeat", async () => {
  const columns = { id: {}, name: {}, email: {}, password: {} };
  const query = { tableExists: async () => true, describeTable: async () => columns, addColumn: mock.fn(async (_, name, definition) => { columns[name] = definition; }) };
  const sequelize = { getQueryInterface: () => query };
  await migrate(sequelize, { getTableName: () => "Users" });
  assert.equal(query.addColumn.mock.callCount(), 4);
  await migrate(sequelize, { getTableName: () => "Users" });
  assert.equal(query.addColumn.mock.callCount(), 4);
  assert.equal(columns.authVersion.defaultValue, 0);
});

test("unconfigured recovery reports unavailable without checking account existence", async () => {
  const f = fixture(); const original = process.env.SMTP_HOST; delete process.env.SMTP_HOST;
  try {
    const res = response(); await controllers(f.sequelize).forgotPassword({ body: { email: f.user.email } }, res);
    assert.equal(res.code, 503); assert.equal(f.User.findOne.mock.callCount(), 0);
  } finally { if (original !== undefined) process.env.SMTP_HOST = original; }
});
