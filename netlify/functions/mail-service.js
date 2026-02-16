import nodemailer from "nodemailer";

function json(statusCode, data) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(data),
  };
}

function looksLikeEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ""));
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  // 🔐 Token check
  const expected = (process.env.MAIL_SERVICE_TOKEN ?? "").trim();
  const received = (
    event.headers?.["x-service-token"] ||
    event.headers?.["X-Service-Token"] ||
    ""
  ).trim();

  if (!expected) return json(500, { ok: false, error: "MAIL_SERVICE_TOKEN missing" });
  if (!received || received !== expected) return json(401, { ok: false, error: "Unauthorized" });

  // 📦 Parse body
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const to = String(body?.to ?? "").trim();
  const subject = String(body?.subject ?? "").trim();
  const content = String(body?.content ?? "").trim();
  const isHtml = body?.isHtml ?? true;

  if (!looksLikeEmail(to)) return json(400, { ok: false, error: "Invalid recipient email" });
  if (!subject || !content) return json(400, { ok: false, error: "Missing subject or content" });

  // 📬 SMTP config
  const host = (process.env.SMTP_HOST ?? "").trim();
  const port = Number(process.env.SMTP_PORT ?? "");
  const secure = (process.env.SMTP_SECURE ?? "").trim() === "true";
  const user = (process.env.SMTP_USER ?? "").trim();
  const pass = (process.env.SMTP_PASS ?? "").trim();
  const from = (process.env.SMTP_FROM ?? "").trim();

  if (!host || !port || !user || !pass || !from) {
    return json(500, { ok: false, error: "SMTP config missing" });
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      ...(isHtml ? { html: content } : { text: content }),
    });

    return json(200, { ok: true, messageId: info.messageId });
  } catch (err) {
    console.error("SMTP error:", err);
    return json(502, { ok: false, error: "SMTP failed" });
  }
}
