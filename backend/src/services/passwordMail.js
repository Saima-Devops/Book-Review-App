const nodemailer = require("nodemailer");

module.exports = () => {
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, PUBLIC_URL } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM || !PUBLIC_URL) return null;
  const origin = new URL(PUBLIC_URL);
  if (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) {
    throw new Error("Password recovery requires HTTPS.");
  }
  const port = Number(process.env.SMTP_PORT || 587);
  if (![465, 587].includes(port)) throw new Error("SMTP_PORT must be 465 or 587.");
  const transport = nodemailer.createTransport({
    host: SMTP_HOST, port, secure: port === 465, requireTLS: port === 587,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  return async (email, token) => {
    const link = new URL("/reset-password", origin);
    // URL fragments are not sent to web servers or recorded in proxy request logs.
    link.hash = new URLSearchParams({ token }).toString();
    await transport.sendMail({
      from: SMTP_FROM, to: email, subject: "Reset your Reading Room password",
      text: `A password reset was requested for your Reading Room account.\n\n${link.href}\n\nThis link expires in 30 minutes and can be used once. If you did not request this, ignore this email.`,
    });
  };
};
