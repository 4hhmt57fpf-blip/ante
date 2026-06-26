import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRequireUser, makeRequireChargeSecret } from '../auth.js';

function res() {
  return { code: 0, body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; } };
}
const fakeClient = {
  auth: {
    async getUser(token) {
      return token === 'good'
        ? { data: { user: { id: 'u1', email: 'a@b.com' } } }
        : { error: { message: 'bad jwt' } };
    },
  },
};

test('requireUser rejects missing header', async () => {
  const r = res(); let nexted = false;
  await makeRequireUser(fakeClient)({ headers: {} }, r, () => { nexted = true; });
  assert.equal(r.code, 401); assert.equal(nexted, false);
});

test('requireUser rejects bad token', async () => {
  const r = res(); let nexted = false;
  await makeRequireUser(fakeClient)({ headers: { authorization: 'Bearer nope' } }, r, () => { nexted = true; });
  assert.equal(r.code, 401); assert.equal(nexted, false);
});

test('requireUser accepts good token and attaches user', async () => {
  const r = res(); const req = { headers: { authorization: 'Bearer good' } }; let nexted = false;
  await makeRequireUser(fakeClient)(req, r, () => { nexted = true; });
  assert.equal(nexted, true); assert.equal(req.userId, 'u1'); assert.equal(req.userEmail, 'a@b.com');
});

test('requireChargeSecret 503 when unset, 401 on mismatch, next on match', () => {
  let r = res(); makeRequireChargeSecret('')({ headers: {} }, r, () => {}); assert.equal(r.code, 503);
  r = res(); makeRequireChargeSecret('s')({ headers: { authorization: 'Bearer x' } }, r, () => {}); assert.equal(r.code, 401);
  r = res(); let ok = false; makeRequireChargeSecret('s')({ headers: { authorization: 'Bearer s' } }, r, () => { ok = true; }); assert.equal(ok, true);
});
