const assert = require("node:assert/strict");
const { test, mock } = require("node:test");
const { createCatalogService } = require("../src/services/bookCatalog");
const catalogController = require("../src/controllers/catalogController");
const books = require("../src/controllers/bookController");
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const document = { key: "/works/OL123W", title: "The Example Book", author_name: ["Example Author"], first_publish_year: 2001 };
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test("search normalizes safe results, rejects malformed records and requests only bounded fields", async () => {
  const fetchImpl = mock.fn(async () => json({ docs: [document, document, { ...document, key: "https://evil.test" }, { ...document, key: "OL456W", author_name: [] }] }));
  const service = createCatalogService({ fetchImpl, intervalMs: 0 });
  const found = await service.search("  Example  ");
  assert.deepEqual(found, [{ catalogId: "OL123W", title: document.title, author: "Example Author", year: 2001, sourceUrl: "https://openlibrary.org/works/OL123W" }]);
  const [url, options] = fetchImpl.mock.calls[0].arguments;
  assert.equal(new URL(url).origin, "https://openlibrary.org");
  assert.equal(new URL(url).searchParams.get("title"), "Example");
  assert.equal(new URL(url).searchParams.get("limit"), "8");
  assert.equal(options.redirect, "error");
  assert.ok(options.signal);
});

test("concurrent and repeated searches share the cached provider response", async () => {
  const fetchImpl = mock.fn(async () => json({ docs: [document] }));
  const service = createCatalogService({ fetchImpl, intervalMs: 0 });
  const [first, second] = await Promise.all([service.search("Example"), service.search("example")]);
  assert.deepEqual(first, second);
  await service.search("Example");
  assert.equal(fetchImpl.mock.callCount(), 1);
});

test("cache expiry and request spacing respect provider limits", async () => {
  let clock = 1000;
  const starts = [];
  const fetchImpl = async () => { starts.push(clock); return json({ docs: [] }); };
  const service = createCatalogService({ fetchImpl, now: () => clock, wait: async (ms) => { clock += ms; } });
  await service.search("First"); await service.search("Second");
  assert.equal(starts[1] - starts[0], 1000);
  clock += 10 * 60 * 1000 + 1;
  await service.search("First");
  assert.equal(starts.length, 3);
});

for (const query of ["a", "x".repeat(121), ["Book"], null]) {
  test("invalid search input never reaches the provider", async () => {
    const fetchImpl = mock.fn(); const service = createCatalogService({ fetchImpl });
    await assert.rejects(service.search(query), { status: 400 });
    assert.equal(fetchImpl.mock.callCount(), 0);
  });
}

for (const description of ["A real catalog description.", { value: "A real catalog description." }, undefined]) {
  test("details return available descriptions without inventing missing summaries", async () => {
    const service = createCatalogService({ intervalMs: 0, fetchImpl: async () => json({ key: document.key, description }) });
    const details = await service.details("OL123W");
    assert.equal(details.synopsis, description ? "A real catalog description." : "");
    assert.equal(details.sourceUrl, "https://openlibrary.org/works/OL123W");
  });
}

test("long descriptions fit the existing editable synopsis limit", async () => {
  const service = createCatalogService({ intervalMs: 0, fetchImpl: async () => json({ key: document.key, description: "A summary sentence. ".repeat(200) }) });
  const details = await service.details("OL123W");
  assert.ok(details.synopsis.length <= 2000);
  assert.ok(details.synopsis.endsWith("..."));
});

test("catalog identifier validation prevents arbitrary outbound URLs", async () => {
  const fetchImpl = mock.fn(); const service = createCatalogService({ fetchImpl });
  for (const id of ["https://evil.test", "../../admin", "OL123W?next=evil", "OL123M"]) {
    await assert.rejects(service.details(id), { status: 400 });
  }
  assert.equal(fetchImpl.mock.callCount(), 0);
});

test("provider errors preserve manual entry and do not expose internal errors", async () => {
  const service = createCatalogService({ fetchImpl: async () => { throw new Error("Private upstream diagnostic"); }, intervalMs: 0 });
  const res = response();
  await catalogController(service).search({ query: { q: "Example" } }, res);
  assert.equal(res.code, 503);
  assert.match(res.body.message, /manually/);
  assert.ok(!res.body.message.includes("Private"));
});

test("missing and mismatched provider records are rejected", async () => {
  const missing = createCatalogService({ fetchImpl: async () => json({}, 404), intervalMs: 0 });
  await assert.rejects(missing.details("OL123W"), { status: 404 });
  const mismatch = createCatalogService({ fetchImpl: async () => json({ key: "/works/OL999W" }), intervalMs: 0 });
  await assert.rejects(mismatch.details("OL123W"), { status: 503 });
});

test("catalog upload stores a canonical source and retains ownership", async () => {
  const Book = { findOne: async () => null, create: mock.fn(async (values) => values) };
  const sequelize = { define: () => Book }; const res = response();
  await books(sequelize).addBook({ user: { userId: 7 }, body: { title: "Example", author: "Author", synopsis: "Edited summary", catalogId: "OL123W", uploadedBy: 99 } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.book.uploadedBy, 7);
  assert.equal(res.body.book.sourceUrl, "https://openlibrary.org/works/OL123W");
  assert.equal(res.body.book.synopsis, "Edited summary");
});

test("unsafe or mismatched source links cannot be stored", async () => {
  const Book = { findOne: mock.fn(), create: mock.fn() }; const api = books({ define: () => Book });
  for (const extra of [{ sourceUrl: "javascript:alert(1)" }, { catalogId: "OL123W", sourceUrl: "https://evil.test" }, { catalogId: "invalid" }]) {
    const res = response();
    await api.addBook({ user: { userId: 7 }, body: { title: "Book", author: "Author", ...extra } }, res);
    assert.equal(res.code, 400);
  }
  assert.equal(Book.create.mock.callCount(), 0);
});

test("duplicate catalog entries cannot be uploaded with changed spelling", async () => {
  const Book = { findOne: async () => ({ catalogId: "OL123W" }), create: mock.fn() }; const res = response();
  await books({ define: () => Book }).addBook({ user: { userId: 7 }, body: { title: "Different title", author: "Author", catalogId: "OL123W" } }, res);
  assert.equal(res.code, 400); assert.equal(Book.create.mock.callCount(), 0);
});
