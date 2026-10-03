const { test, mock } = require("node:test");
const assert = require("node:assert/strict");
const nodemailer = require("nodemailer");
const mailer = require("../src/services/passwordMail");

test("mail delivery requires verified TLS and keeps reset tokens in URL fragments", async () => {
  const keys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "PUBLIC_URL"];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const sendMail = mock.fn(async () => {});
  const transport = mock.method(nodemailer, "createTransport", () => ({ sendMail }));
  Object.assign(process.env, { SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_USER: "test-user", SMTP_PASSWORD: "test-app-password", SMTP_FROM: "sender@example.test", PUBLIC_URL: "https://reading.example.test" });
  try {
    await mailer()("reader@example.test", "a".repeat(64));
    const config = transport.mock.calls[0].arguments[0];
    assert.equal(config.requireTLS, true);
    assert.equal(config.secure, false);
    assert.equal(config.disableFileAccess, true);
    assert.equal(config.disableUrlAccess, true);
    const message = sendMail.mock.calls[0].arguments[0];
    assert.ok(message.text.includes(`/reset-password#token=${"a".repeat(64)}`));
    assert.equal(message.to, "reader@example.test");
    process.env.SMTP_PORT = "465";
    mailer();
    assert.equal(transport.mock.calls[1].arguments[0].secure, true);
    process.env.PUBLIC_URL = "http://reading.example.test";
    assert.throws(mailer, /HTTPS/);
    process.env.PUBLIC_URL = "https://reading.example.test";
    process.env.SMTP_PORT = "25";
    assert.throws(mailer, /SMTP_PORT/);
  } finally {
    transport.mock.restore();
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
});
