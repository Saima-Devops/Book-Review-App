const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const sharp = require('sharp');

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

  await request('/api/reports', {}, 401);
  await request('/api/reports', { token: other.token }, 403);
  await request('/api/reports/1', { method: 'PATCH', body: { action: 'remove' }, token: other.token }, 403);
  assert.equal((await request('/api/reports/access', { token: other.token })).isAdmin, false);
  const { book: flagged } = await request('/api/books', { method: 'POST', body: { title: `Moderation ${suffix}`, author: 'Other author' }, token: other.token }, 201);
  const flaggedReview = await request('/api/reviews', { method: 'POST', body: { bookId: flagged.id, comment: 'Flagged review', rating: 1 }, token: other.token }, 201);
  await request('/api/reviews', { method: 'POST', body: { bookId: flagged.id, comment: 'Keep this review', rating: 5 }, token: owner.token }, 201);
  const reportBody = { targetType: 'review', targetId: flaggedReview.review.id, reason: 'spam', details: 'CI moderation fixture' };
  await request('/api/reports', { method: 'POST', body: reportBody }, 401);
  await request('/api/reports', { method: 'POST', body: reportBody, token: owner.token }, 201);
  await request('/api/reports', { method: 'POST', body: reportBody, token: owner.token }, 409);
  if (process.env.ADMIN_USER_IDS === String(owner.user.id)) {
    assert.equal((await request('/api/reports/access', { token: owner.token })).isAdmin, true);
    const queue = await request('/api/reports', { token: owner.token });
    const report = queue.reports.find((item) => item.targetId === flaggedReview.review.id && item.targetType === 'review');
    assert.ok(report);
    await request(`/api/reports/${report.id}`, { method: 'PATCH', body: { action: 'remove', note: 'Verified spam' }, token: owner.token });
    assert.equal((await request(`/api/books/${flagged.id}`)).rating, 5);
    assert.equal((await request(`/api/reviews/${flagged.id}`)).length, 1);
    await request(`/api/reports/${report.id}`, { method: 'PATCH', body: { action: 'dismiss' }, token: owner.token }, 409);
    await request('/api/reports', { method: 'POST', body: { targetType: 'book', targetId: flagged.id, reason: 'other' }, token: owner.token }, 201);
    const bookReport = (await request('/api/reports', { token: owner.token })).reports.find((item) => item.targetId === flagged.id && item.targetType === 'book');
    await request(`/api/reports/${bookReport.id}`, { method: 'PATCH', body: { action: 'dismiss', note: 'Keep book' }, token: owner.token });
    assert.equal((await request(`/api/books/${flagged.id}`)).id, flagged.id);
    await request('/api/reports', { method: 'POST', body: { targetType: 'book', targetId: flagged.id, reason: 'spam' }, token: other.token }, 201);
    const removal = (await request('/api/reports', { token: owner.token })).reports.find((item) => item.targetId === flagged.id && item.targetType === 'book');
    await request(`/api/reports/${removal.id}`, { method: 'PATCH', body: { action: 'remove' }, token: owner.token });
    await request(`/api/books/${flagged.id}`, {}, 404);
    assert.deepEqual(await request(`/api/reviews/${flagged.id}`), []);
    const audit = (await request('/api/reports?status=removed', { token: owner.token })).reports.find((item) => item.id === removal.id);
    assert.equal(audit.moderatorId, owner.user.id);
    assert.ok(audit.resolvedAt);
  } else {
    await request(`/api/books/${flagged.id}`, { method: 'DELETE', token: other.token });
  }
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

test('catalog routes require login and catalog sources persist without unsafe links', async () => {
  await request('/api/books/catalog/search?q=Example', {}, 401);
  await request('/api/books/catalog/OL123W', {}, 401);
  const suffix = randomUUID();
  const account = { name: 'Catalog Reader', username: `catalog-${suffix.slice(0, 16)}`, email: `catalog-${suffix}@example.test`, password: 'integration-password' };
  await request('/api/users/register', { method: 'POST', body: account }, 201);
  const { token } = await request('/api/users/login', { method: 'POST', body: { username: account.username, password: account.password } });
  await request('/api/books/catalog/search?q=a', { token }, 400);
  await request('/api/books/catalog/invalid', { token }, 400);
  const catalogId = `OL${String(Date.now()).slice(-10)}W`;
  const input = { title: `Catalog fixture ${suffix}`, author: 'Fixture Author', synopsis: 'An edited catalog synopsis.', catalogId };
  await request('/api/books', { method: 'POST', body: { ...input, sourceUrl: 'javascript:alert(1)' }, token }, 400);
  const { book } = await request('/api/books', { method: 'POST', body: input, token }, 201);
  const stored = await request(`/api/books/${book.id}`);
  assert.equal(stored.catalogId, catalogId);
  assert.equal(stored.sourceUrl, `https://openlibrary.org/works/${catalogId}`);
  assert.equal(stored.synopsis, input.synopsis);
  await request('/api/books', { method: 'POST', body: { ...input, title: `Alternate title ${suffix}`, author: 'Alternate Author' }, token }, 400);
  await request(`/api/books/${book.id}`, { method: 'DELETE', token });
});

test('book covers persist, do not leak in JSON, and remain subject to book ownership', async () => {
  const suffix = randomUUID();
  const password = 'cover-integration-password';
  const account = { name: 'Cover Reader', username: `cover-${suffix.slice(0,16)}`, email: `cover-${suffix}@example.test`, password };
  await request('/api/users/register', { method: 'POST', body: account }, 201);
  const owner = await request('/api/users/login', { method: 'POST', body: account });
  const data = await sharp({ create: { width: 120, height: 180, channels: 3, background: '#087f80' } }).png().toBuffer();
  const input = { title: `Cover fixture ${suffix}`, author: 'Cover author', cover: `data:image/png;base64,${data.toString('base64')}` };
  const { book } = await request('/api/books', { method: 'POST', body: input, token: owner.token }, 201);
  assert.match(book.coverVersion, /^[a-f0-9]{64}$/); assert.equal(book.coverData, undefined);
  const stored = await request(`/api/books/${book.id}`); assert.equal(stored.coverData, undefined);
  assert.equal((await request('/api/books')).find((item) => item.id === book.id).coverData, undefined);
  const cover = await fetch(`${origin}/api/books/${book.id}/cover`);
  assert.equal(cover.status, 200); assert.equal(cover.headers.get('content-type'), 'image/jpeg');
  const metadata = await sharp(Buffer.from(await cover.arrayBuffer())).metadata();
  assert.equal(metadata.width, 120); assert.equal(metadata.height, 180);
  await request(`/api/books/${book.id}`, { method: 'DELETE' }, 401);
  await request('/api/books', { method: 'POST', body: { ...input, title: 'Invalid cover', cover: 'data:image/jpeg;base64,AAAA' }, token: owner.token }, 400);
  await request('/api/books', { method: 'POST', body: { ...input, title: 'Oversized cover', cover: 'x'.repeat(800000) }, token: owner.token }, 413);
  await request(`/api/books/${book.id}`, { method: 'DELETE', token: owner.token });
  await request(`/api/books/${book.id}/cover`, {}, 404);
  // Retain a covered fixture for the disposable stack's database restart check.
  await request('/api/books', { method: 'POST', body: { ...input, title: `Persistent cover ${suffix}` }, token: owner.token }, 201);
});
