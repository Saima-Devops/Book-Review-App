const assert = require("node:assert/strict");
const { test } = require("node:test");
const sharp = require("sharp");
const normalize = require("../src/services/bookCover");
const controller = require("../src/controllers/bookController");

const fixture = async (format = "png") => {
  const buffer = await sharp({ create: { width: 120, height: 180, channels: 4, background: "#087f8080" } }).toFormat(format).toBuffer();
  return `data:image/${format};base64,${buffer.toString("base64")}`;
};

test("cover is optional and does not change legacy book creation", async () => {
  assert.deepEqual(await normalize(undefined), {}); assert.deepEqual(await normalize(null), {});
});

for (const format of ["png", "jpeg", "webp"]) {
  test(`${format} is decoded, normalized to JPEG, and stripped of metadata`, async () => {
    const result = await normalize(await fixture(format));
    const metadata = await sharp(Buffer.from(result.coverData, "base64")).metadata();
    assert.equal(metadata.format, "jpeg"); assert.equal(metadata.width, 120); assert.equal(metadata.height, 180);
    assert.equal(metadata.hasAlpha, false); assert.equal(metadata.exif, undefined);
    assert.match(result.coverVersion, /^[a-f0-9]{64}$/);
  });
}

test("large dimensions are resized without enlarging small covers", async () => {
  const data = await sharp({ create: { width: 1200, height: 1800, channels: 3, background: "#087f80" } }).png().toBuffer();
  const result = await normalize(`data:image/png;base64,${data.toString("base64")}`);
  const metadata = await sharp(Buffer.from(result.coverData, "base64")).metadata();
  assert.equal(metadata.width, 900); assert.equal(metadata.height, 1350);
});

for (const input of [false, {}, "https://example.test/cover.jpg", "data:image/svg+xml;base64,PHN2Zy8+", "data:image/gif;base64,R0lGODlh", "data:image/jpeg;base64,AAAA", "data:image/png;base64,iVBORw0KGgo=", "x".repeat(710001)]) {
  test("invalid or unsupported covers are rejected", async () => {
    await assert.rejects(normalize(input), (error) => error.status === 400);
  });
}

test("forged MIME and excessive pixel counts are rejected", async () => {
  await assert.rejects(normalize((await fixture()).replace("image/png", "image/jpeg")), (error) => error.status === 400);
  const buffer = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: "#ffffff" } }).png().toBuffer();
  await assert.rejects(normalize(`data:image/png;base64,${buffer.toString("base64")}`), (error) => error.status === 400);
});

test("concurrent decoding is bounded", async () => {
  const data = await fixture();
  const result = await Promise.allSettled([normalize(data), normalize(data), normalize(data)]);
  assert.equal(result.filter((item) => item.status === "fulfilled").length, 2);
  assert.equal(result[2].reason.status, 429);
});

test("cover response serves only JPEG and missing covers return 404", async () => {
  const result = await normalize(await fixture());
  const Book = { findByPk: async () => result };
  const api = controller({ define: (name) => name === "Book" ? Book : {} });
  const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; }, set(headers) { this.headers = headers; }, send(body) { this.body = body; } };
  await api.getCover({ params: { id: "1" } }, res);
  assert.equal(res.headers["Content-Type"], "image/jpeg"); assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.ok(Buffer.isBuffer(res.body));
  Book.findByPk = async () => null;
  await api.getCover({ params: { id: "1" } }, res); assert.equal(res.code, 404);
});
