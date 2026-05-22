/**
 * Helpers that turn the in-domain MessagePayload into the channel-specific
 * strings real providers send. Kept in a single place so SMS, WhatsApp, and
 * email all greet recipients consistently and never leak private survey
 * data — only the survey title, optional recipient name, and the per-recipient
 * public response URL.
 */

const truncate = (value, max) => {
  if (!value) return '';
  const text = String(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const greeting = (payload) => {
  const name = payload?.contact?.fullName;
  return name ? `Hi ${name}` : 'Hi there';
};

const surveyTitle = (payload) => payload?.survey?.title ?? 'our survey';

const ensureUrl = (payload) => payload?.publicUrl ?? '';

/**
 * Plain-text body used for SMS. Carriers reject lengthy messages, so the body
 * is capped well under 320 characters to fit in two GSM-7 segments.
 */
export const buildSmsBody = (payload) =>
  truncate(
    `${greeting(payload)}, please answer "${surveyTitle(payload)}": ${ensureUrl(payload)}`,
    300,
  );

/**
 * WhatsApp accepts longer messages but the same template still works and reads
 * naturally inside the chat client.
 */
export const buildWhatsAppBody = (payload) =>
  truncate(
    `${greeting(payload)}, we would love your feedback on "${surveyTitle(
      payload,
    )}". Open it here: ${ensureUrl(payload)}`,
    1000,
  );

export const buildEmailSubject = (payload) =>
  truncate(`Please answer: ${surveyTitle(payload)}`, 150);

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const buildEmailContent = (payload) => {
  const title = surveyTitle(payload);
  const url = ensureUrl(payload);
  const opening = greeting(payload);

  const text = [
    `${opening},`,
    '',
    `Please take a moment to answer "${title}".`,
    '',
    `Open the survey: ${url}`,
    '',
    'Thank you!',
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #1f2937;">
    <p>${escapeHtml(opening)},</p>
    <p>Please take a moment to answer <strong>${escapeHtml(title)}</strong>.</p>
    <p>
      <a href="${escapeHtml(url)}" style="background:#2563eb;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block">
        Open the survey
      </a>
    </p>
    <p style="font-size:12px;color:#6b7280">If the button does not work, copy and paste this link:<br>${escapeHtml(url)}</p>
  </body>
</html>`;

  return { text, html };
};
