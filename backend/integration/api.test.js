const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');

const origin = process.env.TEST_API_URL;
if (!origin || process.env.ALLOW_TEST_WRITES !== 'yes' ||
    !['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) {
  throw new Error('Integration tests require a disposable local stack, TEST_API_URL, and ALLOW_TEST_WRITES=yes. Never target production.');
}

async function request(path, { method = 'GET', body, token } = {}, expected = 200) {
  const result = await fetch(`${origin}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(result.status, expected, `${method} ${path}: expected ${expected}, received ${result.status}`);
  return result.json();
}

test('real API supports registration, books, rating updates, and owner-only review CRUD', async () => {
  const suffix = randomUUID();
  const password = 'integration-password-not-for-production';
  const accounts = ['owner', 'other'].map((name) => ({ name, username: `${name}-${suffix.slice(0, 16)}`, email: `${name}-${suffix}@example.test`, password }));
  const seeded = await request('/api/books');
  assert.ok(seeded.some((book) => book.title === 'Clean Code'), 'Sample books must be initialized');
  for (const account of accounts) await request('/api/users/register', { method: 'POST', body: account }, 201);
  await request('/api/users/register', { method: 'POST', body: accounts[0] }, 400);
  await request('/api/users/register', { method: 'POST', body: { ...accounts[0], email: `duplicate-${suffix}@example.test` } }, 400);
  await request('/api/users/login', { method: 'POST', body: { username: `missing-${suffix}`, password } }, 400);
  await request('/api/users/login', { method: 'POST', body: { email: accounts[0].email, password: 'wrong' } }, 400);
  const owner = await request('/api/users/login', { method: 'POST', body: { username: accounts[0].username, password } });
  const other = await request('/api/users/login', { method: 'POST', body: { username: accounts[1].username, password } });
  assert.ok(owner.token);
  assert.equal(owner.user.password, undefined);

  const bookInput = { title: `CI book ${suffix}`, author: 'CI author', synopsis: ' A short CI synopsis ', uploadedBy: other.user.id };
  await request('/api/books', { method: 'POST', body: bookInput }, 401);
  await request('/api/books', { method: 'POST', body: bookInput, token: 'invalid' }, 400);
  await request('/api/books', { method: 'POST', body: { title: '', author: 'CI author' }, token: owner.token }, 400);
  const { book } = await request('/api/books', { method: 'POST', body: bookInput, token: owner.token }, 201);
  assert.equal(book.uploadedBy, owner.user.id);
  assert.equal(book.synopsis, 'A short CI synopsis');
  await request(`/api/books/${book.id}`, { method: 'DELETE' }, 401);
  await request(`/api/books/${book.id}`, { method: 'DELETE', token: other.token }, 403);
  await request(`/api/books/${seeded[0].id}`, { method: 'DELETE', token: owner.token }, 403);
  await request('/api/books', { method: 'POST', body: { ...bookInput, title: `Invalid synopsis ${suffix}`, synopsis: 'x'.repeat(2001) }, token: owner.token }, 400);
  await request('/api/books', { method: 'POST', body: bookInput, token: owner.token }, 400);
  assert.equal((await request(`/api/books/${book.id}`)).title, bookInput.title);
  await request('/api/books/2147483647', {}, 404);

  const reviewBody = { bookId: book.id, comment: 'First review', rating: 5 };
  await request('/api/reviews', { method: 'POST', body: reviewBody }, 401);
  for (const rating of [0, 6, 2.5]) {
    await request('/api/reviews', { method: 'POST', body: { ...reviewBody, rating }, token: owner.token }, 400);
  }
  await request('/api/reviews', { method: 'POST', body: { ...reviewBody, comment: ' ' }, token: owner.token }, 400);
  await request('/api/reviews', { method: 'POST', body: { ...reviewBody, bookId: 2147483647 }, token: owner.token }, 404);
  const first = await request('/api/reviews', { method: 'POST', body: reviewBody, token: owner.token }, 201);
  const second = await request('/api/reviews', { method: 'POST', body: { ...reviewBody, rating: 1 }, token: other.token }, 201);
  assert.equal((await request(`/api/books/${book.id}`)).rating, 3);
  const listed = await request(`/api/reviews/${book.id}`);
  assert.equal(listed.length, 2);
  assert.ok(listed.some((review) => review.username === 'owner'));

  await request(`/api/reviews/${first.review.id}`, { method: 'PUT', body: { comment: 'Tampered', rating: 1 }, token: other.token }, 403);
  await request(`/api/reviews/${first.review.id}`, { method: 'DELETE', token: other.token }, 403);
  assert.equal((await request(`/api/books/${book.id}`)).rating, 3);
  await request(`/api/reviews/${first.review.id}`, { method: 'PUT', body: { comment: ' Edited ', rating: 3 }, token: owner.token });
  assert.equal((await request(`/api/books/${book.id}`)).rating, 2);
  assert.equal((await request(`/api/reviews/${book.id}`)).find((review) => review.id === first.review.id).comment, 'Edited');
  await request(`/api/reviews/${first.review.id}`, { method: 'DELETE', token: owner.token });
  assert.equal((await request(`/api/books/${book.id}`)).rating, 1);
  await request(`/api/reviews/${second.review.id}`, { method: 'DELETE', token: other.token });
  assert.equal((await request(`/api/books/${book.id}`)).rating, 0);
  assert.deepEqual(await request(`/api/reviews/${book.id}`), []);
  await request(`/api/reviews/${first.review.id}`, { method: 'DELETE', token: owner.token }, 404);
  await request('/api/reviews', { method: 'POST', body: reviewBody, token: other.token }, 201);
  await request(`/api/books/${book.id}`, { method: 'DELETE', token: owner.token });
  await request(`/api/books/${book.id}`, {}, 404);
  assert.deepEqual(await request(`/api/reviews/${book.id}`), []);
  assert.ok((await request('/api/books')).some((item) => item.id === seeded[0].id));
});

test('concurrent review creation and book deletion never leave orphaned reviews', async () => {
  const suffix = randomUUID();
  const account = { name: 'Race Reader', username: `race-${suffix.slice(0, 16)}`, email: `race-${suffix}@example.test`, password: 'integration-password' };
  await request('/api/users/register', { method: 'POST', body: account }, 201);
  const { token } = await request('/api/users/login', { method: 'POST', body: account });
  const { book } = await request('/api/books', { method: 'POST', body: { title: `Concurrent ${suffix}`, author: 'CI Author' }, token }, 201);
  const [review, deletion] = await Promise.all([
    fetch(`${origin}/api/reviews`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ bookId: book.id, comment: 'Concurrent review', rating: 5 }), signal: AbortSignal.timeout(15000),
    }),
    fetch(`${origin}/api/books/${book.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
    }),
  ]);
  assert.ok([201, 404].includes(review.status));
  assert.equal(deletion.status, 200);
  assert.deepEqual(await request(`/api/reviews/${book.id}`), []);
  await request(`/api/books/${book.id}`, {}, 404);
});
