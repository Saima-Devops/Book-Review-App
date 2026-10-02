const assert = require('node:assert/strict');
const { test } = require('node:test');
const jwt = require('jsonwebtoken');
const authenticate = require('../src/middleware/authMiddleware');

process.env.JWT_SECRET = 'unit-test-secret-not-for-production';

function invoke(token) {
  const req = { header: () => token };
  const res = {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let continued = false;
  authenticate(req, res, () => { continued = true; });
  return { req, res, continued };
}

test('missing credentials are rejected', () => {
  const result = invoke(undefined);
  assert.equal(result.res.code, 401);
  assert.equal(result.continued, false);
});

test('valid JWT exposes the authenticated user', () => {
  const token = jwt.sign({ userId: 42 }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const result = invoke(`Bearer ${token}`);
  assert.equal(result.req.user.userId, 42);
  assert.equal(result.continued, true);
});

for (const [name, token] of [
  ['malformed', 'not-a-jwt'],
  ['wrong signing key', jwt.sign({ userId: 42 }, 'other-secret')],
  ['expired', jwt.sign({ userId: 42 }, process.env.JWT_SECRET, { expiresIn: -1 })],
]) {
  test(`${name} JWT is rejected`, () => {
    const result = invoke(`Bearer ${token}`);
    assert.equal(result.res.code, 400);
    assert.equal(result.continued, false);
  });
}
