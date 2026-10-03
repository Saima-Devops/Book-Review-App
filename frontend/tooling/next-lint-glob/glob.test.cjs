const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { getRootDirs } = require("@next/eslint-plugin-next/dist/utils/get-root-dirs");
const { ESLint } = require("eslint");

test("Next root directory matching preserves exact paths, arrays and brace patterns", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reading-room-lint-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = path.join(root, "app-one");
  const second = path.join(root, "app-two");
  fs.mkdirSync(path.join(first, "nested"), { recursive: true });
  fs.mkdirSync(second);
  const lookup = (rootDir) => getRootDirs({ cwd: root, settings: { next: { rootDir } } })
    .map((dir) => path.resolve(dir)).sort();
  assert.deepEqual(lookup(undefined), [root]);
  assert.deepEqual(lookup(first), [first]);
  assert.deepEqual(lookup([first, second]), [first, second]);
  assert.deepEqual(lookup(path.join(root, "{app-one,app-two}")), [first, second]);
  assert.deepEqual(lookup(path.join(root, "app-*")), [first, second]);
  const pluginRequire = createRequire(require.resolve("@next/eslint-plugin-next"));
  assert.equal(pluginRequire("fast-glob/package.json").name, "@reading-room/next-lint-glob");
});

test("Next-specific lint rules remain active", async () => {
  const eslint = new ESLint({ cwd: path.resolve(__dirname, "../..") });
  const [result] = await eslint.lintText(
    'export default function Page() { return <img src="/cover.png" alt="Book" />; }',
    { filePath: "src/app/lint-fixture.js" },
  );
  assert.ok(result.messages.some((message) => message.ruleId === "@next/next/no-img-element"));
});
