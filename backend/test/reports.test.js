const assert = require("node:assert/strict");
const { test, mock } = require("node:test");
const controller = require("../src/controllers/reportController");
const admin = require("../src/middleware/adminMiddleware");

function setup() {
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const book = { id: 20, title: "Example", author: "Author", synopsis: "Summary", destroy: mock.fn(async () => {}), update: mock.fn(async () => {}) };
  const report = { id: 1, bookId: 20, targetId: 20, targetType: "book", status: "pending", update: mock.fn(async () => {}) };
  const Report = { create: mock.fn(async () => {}), findByPk: mock.fn(async () => report), update: mock.fn(async () => {}), findAndCountAll: mock.fn(async () => ({ rows: [report], count: 1 })) };
  const Book = { findByPk: mock.fn(async () => book) };
  const Review = { findByPk: mock.fn(async () => ({ id: 30, bookId: 20, comment: "Review" })), destroy: mock.fn(async () => {}), findAll: mock.fn(async () => [{ rating: 5 }, { rating: 2 }]) };
  const sequelize = { define: (name) => ({ Report, Book, Review })[name], transaction: mock.fn(async (fn) => fn(transaction)) };
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  const request = { user: { userId: 7 }, params: { id: "1" }, body: { targetType: "book", targetId: 20, reason: "spam", details: " Notes " }, query: {} };
  return { report, book, Report, Book, Review, sequelize, transaction, res, request, api: controller(sequelize) };
}

test("admins are configured explicitly, not inferred from names, emails or JWT roles", () => {
  assert.equal(admin.isAdmin(7, {}), false);
  assert.equal(admin.isAdmin(7, { ADMIN_USER_IDS: " 7, 12 " }), true);
  for (const value of ["*", "7abc", "07", "-7", "7.0"]) assert.equal(admin.isAdmin(7, { ADMIN_USER_IDS: value }), false);
  const f = setup(); let continued = false;
  admin({ user: { userId: 2147483647, isAdmin: true } }, f.res, () => { continued = true; });
  assert.equal(f.res.code, 403); assert.equal(continued, false);
});

test("report captures content and authenticated reporter, ignoring forged fields", async () => {
  const f = setup(); Object.assign(f.request.body, { reporterId: 99, status: "removed", moderatorId: 99 });
  await f.api.create(f.request, f.res);
  assert.equal(f.res.code, 201);
  const data = f.Report.create.mock.calls[0].arguments[0];
  assert.equal(data.reporterId, 7); assert.equal(data.details, "Notes");
  assert.equal(data.contentSnapshot, "Author\nSummary");
  assert.equal(data.status, undefined); assert.equal(data.moderatorId, undefined);
});

test("review report captures review text and related book", async () => {
  const f = setup(); f.request.body.targetType = "review"; f.request.body.targetId = 30;
  await f.api.create(f.request, f.res);
  assert.equal(f.Report.create.mock.calls[0].arguments[0].contentSnapshot, "Review");
  assert.equal(f.Report.create.mock.calls[0].arguments[0].bookId, 20);
});

for (const invalid of [{ targetType: "user" }, { targetId: -1 }, { targetId: "1 OR 1=1" }, { targetId: 2147483648 }, { reason: "invented" }, { details: {} }, { details: "x".repeat(2001) }]) {
  test(`invalid report input is rejected: ${Object.keys(invalid)[0]}`, async () => {
    const f = setup(); Object.assign(f.request.body, invalid);
    await f.api.create(f.request, f.res); assert.equal(f.res.code, 400); assert.equal(f.Report.create.mock.callCount(), 0);
  });
}

test("missing content returns 404 and duplicate reports return 409", async () => {
  const f = setup(); f.Book.findByPk = async () => null;
  await f.api.create(f.request, f.res); assert.equal(f.res.code, 404);
  const g = setup(); g.Report.create = async () => { throw Object.assign(new Error(), { name: "SequelizeUniqueConstraintError" }); };
  await g.api.create(g.request, g.res); assert.equal(g.res.code, 409);
});

test("queues are bounded and deterministically ordered", async () => {
  const f = setup(); f.request.query = { status: "removed", page: "2" };
  await f.api.list(f.request, f.res);
  assert.deepEqual(f.Report.findAndCountAll.mock.calls[0].arguments[0], { where: { status: "removed" }, order: [["createdAt", "DESC"], ["id", "DESC"]], limit: 20, offset: 20 });
  assert.equal(f.res.body.pageSize, 20);
  for (const query of [{ status: "unknown" }, { page: "-1" }, { page: "1.5" }, { page: "100001" }]) {
    f.request.query = query; await f.api.list(f.request, f.res); assert.equal(f.res.code, 400);
  }
});

test("dismissal audits the admin and leaves content unchanged", async () => {
  const f = setup(); f.request.body = { action: "dismiss", note: " Legitimate content " };
  await f.api.resolve(f.request, f.res); assert.equal(f.res.code, 200);
  const [data, options] = f.report.update.mock.calls[0].arguments;
  assert.equal(data.status, "dismissed"); assert.equal(data.moderatorId, 7); assert.equal(data.moderatorNote, "Legitimate content");
  assert.ok(data.resolvedAt instanceof Date); assert.equal(options.transaction, f.transaction);
  assert.equal(f.Review.destroy.mock.callCount(), 0); assert.equal(f.book.destroy.mock.callCount(), 0);
});

test("book removal deletes related reviews and resolves all related pending reports", async () => {
  const f = setup(); f.request.body = { action: "remove" };
  await f.api.resolve(f.request, f.res); assert.equal(f.res.code, 200);
  assert.deepEqual(f.Book.findByPk.mock.calls[0].arguments[1], { transaction: f.transaction, lock: "UPDATE" });
  assert.deepEqual(f.Review.destroy.mock.calls[0].arguments[0], { where: { bookId: 20 }, transaction: f.transaction });
  assert.equal(f.book.destroy.mock.callCount(), 1);
  assert.deepEqual(f.Report.update.mock.calls[0].arguments[1].where, { bookId: 20, status: "pending" });
});

test("review removal preserves the book and recalculates rating", async () => {
  const f = setup(); f.report.targetType = "review"; f.report.targetId = 30; f.request.body = { action: "remove" };
  await f.api.resolve(f.request, f.res); assert.equal(f.res.code, 200);
  assert.deepEqual(f.Review.destroy.mock.calls[0].arguments[0].where, { id: 30, bookId: 20 });
  assert.equal(f.book.update.mock.calls[0].arguments[0].rating, 3.5);
  assert.equal(f.book.destroy.mock.callCount(), 0);
  f.Review.findAll = async () => []; await f.api.resolve(f.request, f.res);
  assert.equal(f.book.update.mock.calls[1].arguments[0].rating, 0);
});

test("already-deleted content can be resolved without deleting unrelated records", async () => {
  const f = setup(); f.Book.findByPk = async () => null; f.request.body = { action: "remove" };
  await f.api.resolve(f.request, f.res); assert.equal(f.res.code, 200); assert.equal(f.book.destroy.mock.callCount(), 0);
});

test("missing and previously resolved reports cannot be actioned", async () => {
  const f = setup(); f.request.body = { action: "remove" }; f.report.status = "dismissed";
  await f.api.resolve(f.request, f.res); assert.equal(f.res.code, 409); assert.equal(f.book.destroy.mock.callCount(), 0);
  f.Report.findByPk = async () => null; await f.api.resolve(f.request, f.res); assert.equal(f.res.code, 404);
});

test("invalid decisions never start a transaction", async () => {
  for (const body of [{ action: "ban" }, { action: "dismiss", note: {} }, { action: "remove", note: "x".repeat(2001) }]) {
    const f = setup(); f.request.body = body; await f.api.resolve(f.request, f.res);
    assert.equal(f.res.code, 400); assert.equal(f.sequelize.transaction.mock.callCount(), 0);
  }
});

test("cleanup failure aborts transaction before book deletion", async () => {
  const f = setup(); f.request.body = { action: "remove" };
  f.Review.destroy = async () => { throw new Error("database error"); };
  await f.api.resolve(f.request, f.res); assert.equal(f.res.code, 500); assert.equal(f.book.destroy.mock.callCount(), 0);
});
