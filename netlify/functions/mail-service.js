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

function normalizeAttachments(input) {
  if (!Array.isArray(input) || input.length === 0) return [];

  return input
    .map((a) => {
      const filename = String(a?.filename ?? "").trim();
      const contentBase64 = String(a?.contentBase64 ?? "").trim();
      const contentType = String(a?.contentType ?? "application/octet-stream").trim();

      if (!filename || !contentBase64) return null;

      try {
        return {
          filename,
          content: Buffer.from(contentBase64, "base64"),
          contentType,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  const expected = (process.env.MAIL_SERVICE_TOKEN ?? "").trim();
  const received = (
    event.headers?.["x-service-token"] ||
    event.headers?.["X-Service-Token"] ||
    ""
  ).trim();

  if (!expected) return json(500, { ok: false, error: "MAIL_SERVICE_TOKEN missing" });
  if (!received || received !== expected) return json(401, { ok: false, error: "Unauthorized" });

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
  const attachments = normalizeAttachments(body?.attachments);

  if (!looksLikeEmail(to)) return json(400, { ok: false, error: "Invalid recipient email" });
  if (!subject || !content) return json(400, { ok: false, error: "Missing subject or content" });

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
      ...(attachments.length ? { attachments } : {}),
    });

    return json(200, {
      ok: true,
      messageId: info.messageId,
      attachmentsCount: attachments.length,
    });
  } catch (err) {
    console.error("SMTP error name:", err?.name);
    console.error("SMTP error code:", err?.code);
    console.error("SMTP error message:", err?.message);
    console.error("SMTP meta:", {
        to,
        subject,
        attachmentsCount: attachments.length,
        attachments: attachments.map(a => ({
          filename: a.filename,
          size: a.content?.length ?? 0,
          contentType: a.contentType,
        })),
      });
    return json(502, { ok: false, error: "SMTP failed" });
  }
}