import nodemailer from "nodemailer";

function json(statusCode, data) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  };
}

export async function handler(event) {
  if (event.httpMethod !== "POST")
    return json(405, { ok: false, error: "Method not allowed" });

  
const expectedRaw = process.env.MAIL_SERVICE_TOKEN;
const expected = (expectedRaw ?? "").trim();

const receivedRaw =
  event.headers["x-service-token"] ||
  event.headers["X-Service-Token"] ||
  event.headers["x-service-token".toLowerCase()];

const received = (receivedRaw ?? "").trim();

console.log("DEBUG expected_set:", !!expectedRaw, "expected_len:", expected.length);
console.log("DEBUG received_set:", !!receivedRaw, "received_len:", received.length);

if (!expected) return json(500, { ok: false, error: "MAIL_SERVICE_TOKEN missing" });
if (!received) return json(401, { ok: false, error: "Missing token header" });

if (received !== expected) {
  return json(401, {
    ok: false,
    error: "Unauthorized",
    debug: { expected_len: expected.length, received_len: received.length },
  });
}


  if (!expected || received !== expected)
    return json(401, { ok: false, error: "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const { to, subject, content, isHtml = true } = body;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      ...(isHtml ? { html: content } : { text: content }),
    });

    return json(200, { ok: true, messageId: info.messageId });
  } catch (err) {
    console.error(err);
    return json(502, { ok: false, error: "SMTP failed" });
  }
}
