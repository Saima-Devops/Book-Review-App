const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const books = require('../src/controllers/bookController');
const reviews = require('../src/controllers/reviewController');
const users = require('../src/controllers/userController');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function response() {
  return {
    code: 200,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

// Inject models through the existing Sequelize factory, without changing app code.
function fixture() {
  const book = { id: 10, uploadedBy: 1, update: mock.fn(async () => {}), destroy: mock.fn(async () => {}) };
  const review = {
    id: 20, userId: 1, bookId: 10,
    update: mock.fn(async () => {}), destroy: mock.fn(async () => {}),
  };
  const models = {
    Book: {
      findAll: mock.fn(async () => [book]),
      findByPk: mock.fn(async () => book),
      findOne: mock.fn(async () => null),
      create: mock.fn(async (data) => ({ id: 10, ...data })),
    },
    Review: {
      destroy: mock.fn(async () => 1),
      findAll: mock.fn(async () => [{ rating: 5 }, { rating: 2 }]),
      findByPk: mock.fn(async () => review),
      create: mock.fn(async (data) => ({ id: 20, ...data })),
    },
    User: {
      findByPk: mock.fn(async () => ({ id: 1, name: 'Reader' })),
      findOne: mock.fn(async () => null),
      create: mock.fn(async (data) => ({ id: 1, ...data })),
    },
  };
  return { book, review, models, sequelize: {
    define: (name) => models[name],
    transaction: mock.fn(async (operation) => operation({ LOCK: { UPDATE: 'UPDATE' } })),
  } };
}

test('books can be listed and looked up', async () => {
  const f = fixture();
  const controller = books(f.sequelize);
  const list = response();
  await controller.getAllBooks({}, list);
  assert.deepEqual(list.body, [f.book]);
  const single = response();
  await controller.getBookById({ params: { id: 10 } }, single);
  assert.equal(single.body, f.book);
});

test('missing book returns 404', async () => {
  const f = fixture();
  f.models.Book.findByPk = async () => null;
  const res = response();
  await books(f.sequelize).getBookById({ params: { id: 999 } }, res);
  assert.equal(res.code, 404);
});

test('new book trims fields and defaults rating to zero', async () => {
  const f = fixture();
  const res = response();
  await books(f.sequelize).addBook({ user: { userId: 1 }, body: { title: ' New Book ', author: ' Author ' } }, res);
  assert.equal(res.code, 201);
  assert.deepEqual(res.body.book, { id: 10, title: 'New Book', author: 'Author', rating: 0, synopsis: '', uploadedBy: 1 });
});

for (const body of [
  { title: ' ', author: 'Author' }, { title: 'Book', author: '' },
  { title: 'Book', author: 'Author', rating: -1 },
  { title: 'Book', author: 'Author', rating: 6 },
  { title: 'Book', author: 'Author', rating: 'invalid' },
]) {
  test(`invalid book fields return 400: ${JSON.stringify(body)}`, async () => {
    const f = fixture();
    const res = response();
    await books(f.sequelize).addBook({ body }, res);
    assert.equal(res.code, 400);
    assert.equal(f.models.Book.create.mock.callCount(), 0);
  });
}

test('duplicate book is not created', async () => {
  const f = fixture();
  f.models.Book.findOne = async () => f.book;
  const res = response();
  await books(f.sequelize).addBook({ body: { title: 'Book', author: 'Author' } }, res);
  assert.equal(res.code, 400);
  assert.equal(f.models.Book.create.mock.callCount(), 0);
});

for (const rating of [1, 2, 3, 4, 5]) {
  test(`review accepts ${rating} stars and recomputes the book average`, async () => {
    const f = fixture();
    const res = response();
    await reviews(f.sequelize).addReview({ user: { userId: 1 }, body: { bookId: 10, comment: 'Useful', rating } }, res);
    assert.equal(res.code, 201);
    assert.equal(res.body.review.username, 'Reader');
    assert.equal(res.body.review.userId, 1);
    assert.equal(res.body.review.rating, rating);
    assert.deepEqual(f.book.update.mock.calls[0].arguments[0], { rating: 3.5 });
  });
}

for (const rating of [0, 6, 2.5, 'invalid', undefined]) {
  test(`invalid review rating is rejected: ${rating}`, async () => {
    const f = fixture();
    const res = response();
    await reviews(f.sequelize).addReview({ user: { userId: 1 }, body: { bookId: 10, comment: 'Useful', rating } }, res);
    assert.equal(res.code, 400);
    assert.equal(f.models.Review.create.mock.callCount(), 0);
  });
}

for (const method of ['updateReview', 'deleteReview']) {
  test(`${method} prevents another user from changing a review`, async () => {
    const f = fixture();
    const res = response();
    await reviews(f.sequelize)[method]({ user: { userId: 2 }, params: { id: 20 }, body: { comment: 'Changed', rating: 3 } }, res);
    assert.equal(res.code, 403);
    assert.equal(f.review.update.mock.callCount(), 0);
    assert.equal(f.review.destroy.mock.callCount(), 0);
    assert.equal(f.book.update.mock.callCount(), 0);
  });
  test(`${method} returns 404 for a missing review`, async () => {
    const f = fixture();
    f.models.Review.findByPk = async () => null;
    const res = response();
    await reviews(f.sequelize)[method]({ user: { userId: 1 }, params: { id: 999 }, body: { comment: 'Changed', rating: 3 } }, res);
    assert.equal(res.code, 404);
  });
}

test('owner can edit a review and update the book rating', async () => {
  const f = fixture();
  const res = response();
  await reviews(f.sequelize).updateReview({ user: { userId: 1 }, params: { id: 20 }, body: { comment: ' Changed ', rating: 4 } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(f.review.update.mock.calls[0].arguments, [{ comment: 'Changed', rating: 4 }]);
  assert.equal(f.book.update.mock.callCount(), 1);
});

test('deleting the final review resets the book rating to zero', async () => {
  const f = fixture();
  f.models.Review.findAll = async () => [];
  const res = response();
  await reviews(f.sequelize).deleteReview({ user: { userId: 1 }, params: { id: 20 } }, res);
  assert.equal(res.code, 200);
  assert.equal(f.review.destroy.mock.callCount(), 1);
  assert.deepEqual(f.book.update.mock.calls[0].arguments[0], { rating: 0 });
});

test('registration stores a bcrypt hash rather than plaintext', async () => {
  const f = fixture();
  const res = response();
  await users(f.sequelize).register({ body: { name: 'Reader', email: 'reader@example.test', password: 'test-password' } }, res);
  assert.equal(res.code, 201);
  const stored = f.models.User.create.mock.calls[0].arguments[0];
  assert.notEqual(stored.password, 'test-password');
  assert.equal(await bcrypt.compare('test-password', stored.password), true);
});

test('duplicate email registration is rejected', async () => {
  const f = fixture();
  f.models.User.findOne = async () => ({ id: 1 });
  const res = response();
  await users(f.sequelize).register({ body: { email: 'reader@example.test' } }, res);
  assert.equal(res.code, 400);
  assert.equal(f.models.User.create.mock.callCount(), 0);
});

test('login signs a token and does not disclose the password hash', async () => {
  process.env.JWT_SECRET = 'unit-test-secret-not-for-production';
  const f = fixture();
  f.models.User.findOne = async () => ({ id: 1, name: 'Reader', email: 'reader@example.test', password: await bcrypt.hash('test-password', 4) });
  const res = response();
  await users(f.sequelize).login({ body: { email: 'reader@example.test', password: 'test-password' } }, res);
  assert.equal(res.code, 200);
  assert.equal(jwt.verify(res.body.token, process.env.JWT_SECRET).userId, 1);
  assert.equal(res.body.user.password, undefined);
});

test('unknown user and wrong password fail login', async () => {
  const f = fixture();
  const controller = users(f.sequelize);
  const missing = response();
  await controller.login({ body: { email: 'unknown@example.test', password: 'wrong' } }, missing);
  assert.equal(missing.code, 400);
  f.models.User.findOne = async () => ({ password: await bcrypt.hash('correct', 4) });
  const wrong = response();
  await controller.login({ body: { email: 'reader@example.test', password: 'wrong' } }, wrong);
  assert.equal(wrong.code, 400);
});

test('database failures return 500 instead of a success response', async () => {
  const f = fixture();
  f.models.Book.findAll = async () => { throw new Error('database unavailable'); };
  const res = response();
  await books(f.sequelize).getAllBooks({}, res);
  assert.equal(res.code, 500);
});
