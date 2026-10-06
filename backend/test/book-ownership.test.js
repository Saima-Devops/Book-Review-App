const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const controller = require('../src/controllers/bookController');
const migrate = require('../src/config/migrateBookFields');

function setup(uploadedBy = 1) {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const book = { id: 10, uploadedBy, destroy: mock.fn(async () => {}) };
  const Book = {
    findByPk: mock.fn(async () => book),
    findOne: async () => null,
    create: async (data) => ({ id: 10, ...data }),
  };
  const Review = { destroy: mock.fn(async () => {}) };
  const sequelize = { define: (name) => name === 'Book' ? Book : Review, transaction: async (fn) => fn(transaction) };
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  return { book, Book, Review, sequelize, transaction, res, api: controller(sequelize) };
}

test('upload stores a trimmed synopsis and ignores a forged uploader ID', async () => {
  const f = setup();
  await f.api.addBook({ user: { userId: 1 }, body: { title: 'Book', author: 'Author', synopsis: ' Summary ', uploadedBy: 2 } }, f.res);
  assert.equal(f.res.code, 201);
  assert.equal(f.res.body.book.synopsis, 'Summary');
  assert.equal(f.res.body.book.uploadedBy, 1);
});

for (const synopsis of [{ text: 'invalid' }, 'x'.repeat(2001)]) {
  test('invalid or oversized synopsis is rejected', async () => {
    const f = setup();
    await f.api.addBook({ user: { userId: 1 }, body: { title: 'Book', author: 'Author', synopsis } }, f.res);
    assert.equal(f.res.code, 400);
  });
}

for (const owner of [2, null]) {
  test(`another user's or legacy book cannot be deleted (owner ${owner})`, async () => {
    const f = setup(owner);
    await f.api.deleteBook({ user: { userId: 1 }, params: { id: 10 } }, f.res);
    assert.equal(f.res.code, 403);
    assert.equal(f.book.destroy.mock.callCount(), 0);
    assert.equal(f.Review.destroy.mock.callCount(), 0);
  });
}

test('owner deletes a book and its reviews under the same row-locked transaction', async () => {
  const f = setup();
  await f.api.deleteBook({ user: { userId: 1 }, params: { id: 10 } }, f.res);
  assert.equal(f.res.code, 200);
  assert.deepEqual(f.Book.findByPk.mock.calls[0].arguments[1], { transaction: f.transaction, lock: 'UPDATE' });
  assert.deepEqual(f.Review.destroy.mock.calls[0].arguments[0], { where: { bookId: 10 }, transaction: f.transaction });
  assert.equal(f.book.destroy.mock.calls[0].arguments[0].transaction, f.transaction);
});

test('missing book returns 404', async () => {
  const f = setup();
  f.Book.findByPk = async () => null;
  await f.api.deleteBook({ user: { userId: 1 }, params: { id: 999 } }, f.res);
  assert.equal(f.res.code, 404);
});

test('failed review cleanup does not proceed to book deletion', async () => {
  const f = setup();
  f.Review.destroy = async () => { throw new Error('cleanup failed'); };
  await f.api.deleteBook({ user: { userId: 1 }, params: { id: 10 } }, f.res);
  assert.equal(f.res.code, 500);
  assert.equal(f.book.destroy.mock.callCount(), 0);
});

test('migration adds only missing nullable fields and is safe to repeat', async () => {
  const columns = { id: {}, title: {}, author: {}, rating: {} };
  const query = {
    tableExists: async () => true,
    describeTable: async () => columns,
    addColumn: mock.fn(async (table, name, definition) => { columns[name] = definition; }),
  };
  const sequelize = { getQueryInterface: () => query };
  const Book = { getTableName: () => 'Books' };
  await migrate(sequelize, Book);
  assert.equal(query.addColumn.mock.callCount(), 4);
  assert.equal(columns.synopsis.allowNull, true);
  assert.equal(columns.uploadedBy.allowNull, true);
  assert.equal(columns.catalogId.unique, true);
  assert.equal(columns.sourceUrl.allowNull, true);
  await migrate(sequelize, Book);
  assert.equal(query.addColumn.mock.callCount(), 4);
});

test('fresh databases defer table creation to the existing model sync', async () => {
  const query = { tableExists: async () => false, describeTable: mock.fn(), addColumn: mock.fn() };
  await migrate({ getQueryInterface: () => query }, { getTableName: () => 'Books' });
  assert.equal(query.describeTable.mock.callCount(), 0);
  assert.equal(query.addColumn.mock.callCount(), 0);
});
