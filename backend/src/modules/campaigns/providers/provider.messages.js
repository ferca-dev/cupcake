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

const unsubscribeUrl = (payload) => payload?.unsubscribeUrl ?? null;

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
  const unsubscribe = unsubscribeUrl(payload);
  const opening = greeting(payload);
  const branding = payload?.branding ?? {};
  const primaryColor = branding.primaryColor || '#2563eb';
  const appName = payload?.appName || 'the platform';
  const logoHtml = branding.logoUrl
    ? `<p><img src="${escapeHtml(
        branding.logoUrl,
      )}" alt="" style="max-height:48px;max-width:180px"></p>`
    : '';
  const footerHtml = branding.whiteLabel
    ? ''
    : `<p style="font-size:12px;color:#6b7280">Powered by ${escapeHtml(appName)}</p>`;

  const textParts = [
    `${opening},`,
    '',
    `Please take a moment to answer "${title}".`,
    '',
    `Open the survey: ${url}`,
    '',
    'Thank you!',
  ];
  if (unsubscribe) {
    textParts.push('', `Unsubscribe from future email surveys: ${unsubscribe}`);
  }
  const text = textParts.join('\n');

  const unsubscribeHtml = unsubscribe
    ? `<p style="font-size:12px;color:#6b7280">To stop future email survey invitations, <a href="${escapeHtml(
        unsubscribe,
      )}" style="color:#2563eb">unsubscribe here</a>.</p>`
    : '';

  const html = `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #1f2937;">
    ${logoHtml}
    <p>${escapeHtml(opening)},</p>
    <p>Please take a moment to answer <strong>${escapeHtml(title)}</strong>.</p>
    <p>
      <a href="${escapeHtml(url)}" style="background:${escapeHtml(primaryColor)};color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block">
        Open the survey
      </a>
    </p>
    <p style="font-size:12px;color:#6b7280">If the button does not work, copy and paste this link:<br>${escapeHtml(url)}</p>
    ${unsubscribeHtml}
    ${footerHtml}
  </body>
</html>`;

  return { text, html };
};
