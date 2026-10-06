import assert from "node:assert/strict";
import { test } from "node:test";
import { proxyApi } from "../src/services/backendProxy.mjs";

const env = { BACKEND_API_ORIGIN: "https://backend.example.test" };
const context = (path = ["books"]) => ({ params: Promise.resolve({ path }) });

test("forwards API query and auth, without browser cookies or spoofed forwarding headers", async () => {
  const request = new Request("https://frontend.example.test/api/books?q=a%20book", {
    headers: { authorization: "Bearer test-token", cookie: "private=1", origin: "https://frontend.example.test", "x-forwarded-for": "spoofed" },
  });
  const response = await proxyApi(request, context(), env, async (url, options) => {
    assert.equal(url.href, "https://backend.example.test/api/books?q=a%20book");
    assert.equal(options.headers.get("authorization"), "Bearer test-token");
    for (const name of ["cookie", "origin", "x-forwarded-for"]) assert.equal(options.headers.has(name), false);
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "manual");
    return Response.json([{ id: 9 }]);
  });
  assert.deepEqual(await response.json(), [{ id: 9 }]);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  test(`${method} forwards the body and preserves backend errors`, async () => {
    const request = new Request("https://frontend.example.test/api/books", {
      method, headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "A book" }),
    });
    const response = await proxyApi(request, context(), env, async (url, options) => {
      assert.equal(options.method, method);
      assert.equal(options.headers.get("content-type"), "application/json");
      assert.deepEqual(await new Response(options.body).json(), { title: "A book" });
      return Response.json({ message: "Unauthorized" }, { status: 401 });
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: "Unauthorized" });
  });
}

test("HEAD and empty responses remain bodyless", async () => {
  const response = await proxyApi(new Request("https://frontend.example.test/api/books", { method: "HEAD" }), context(), env,
    async () => new Response(null, { status: 204 }));
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
});

test("rate limit retry header survives", async () => {
  const response = await proxyApi(new Request("https://frontend.example.test/api/books"), context(), env,
    async () => new Response("Try later", { status: 429, headers: { "retry-after": "60" } }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
});

test("missing, insecure or credential-bearing origins never contact upstream", async () => {
  for (const origin of [undefined, "http://backend.test", "https://user:secret@backend.test", "https://backend.test/api", "https://backend.test/?q=1", "https://backend.test/#fragment"]) {
    const response = await proxyApi(new Request("https://frontend.test/api/books"), context(), { BACKEND_API_ORIGIN: origin },
      async () => assert.fail("Unexpected network request"));
    assert.equal(response.status, 503);
  }
});

test("unsafe path segments cannot change the upstream target", async () => {
  for (const path of [[".."], ["."], ["//evil.test"], ["books\\other"], [""]]) {
    const response = await proxyApi(new Request("https://frontend.test/api/books"), context(path), env,
      async () => assert.fail("Unexpected network request"));
    assert.equal(response.status, 400);
  }
});

test("upstream redirects and failures return generic errors", async () => {
  for (const fetchBackend of [
    async () => new Response(null, { status: 302, headers: { location: "https://elsewhere.test" } }),
    async () => { throw new Error("sensitive host details"); },
  ]) {
    const response = await proxyApi(new Request("https://frontend.test/api/books"), context(), env, fetchBackend);
    assert.equal(response.status, 502);
    assert.equal((await response.text()).includes("sensitive"), false);
    assert.equal(response.headers.has("location"), false);
  }
});
