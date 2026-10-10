// Outgoing email. One provider (Resend), one entry point, and it never throws into a request.
//
// Setup, once:
//   1. Add the sending domain in Resend and set its DNS records (or use their test sender).
//   2. npx wrangler secret put RESEND_API_KEY
//   3. Turn notifications on in the admin and set the recipient.
//
// Notifications are OFF until a dealer switches them on and names a recipient, so a fresh
// install cannot email anybody by accident.

import { escapeHtml } from './site.js';

const ENDPOINT = 'https://api.resend.com/emails';

/** Resend allows this sender without a verified domain, but only to your own account address. */
const FALLBACK_FROM = 'onboarding@resend.dev';

const TYPE_LABEL = {
  enquiry: 'Car enquiry',
  finance: 'Finance enquiry',
  valuation: 'Valuation request',
  sourcing: 'Car sourcing request',
  contact: 'Contact form',
  review: 'Review submitted'
};

/** Split a comma or semicolon separated list into clean addresses. */
export function recipients(value) {
  return String(value || '').split(/[,;]/).map(s => s.trim()).filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

/**
 * Send one email. Returns { ok } or { ok: false, error } — it never throws, because
 * an enquiry must still be saved when the mail provider is down.
 */
export async function sendMail(env, { to, subject, html, text, replyTo, from }) {
  const list = Array.isArray(to) ? to : recipients(to);
  if (!list.length) return { ok: false, error: 'No valid recipient address' };
  if (!env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY is not set on the Worker' };
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: from || FALLBACK_FROM,
        to: list,
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {})
      })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body?.message || body?.error?.message || `Mail provider returned ${res.status}` };
    return { ok: true, id: body.id };
  } catch (err) {
    return { ok: false, error: err.message || 'Mail request failed' };
  }
}

/** Build the notification for one enquiry. `extra` is the parsed payload JSON, may be null. */
export function enquiryEmail({ enquiry, extra, dealer, vehicle, adminUrl }) {
  const label = TYPE_LABEL[enquiry.type] || 'Website enquiry';
  const car = vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') : null;
  const subject = `${label}${car ? ` — ${car}` : ''} — ${enquiry.name}`;

  const rows = [
    ['Name', enquiry.name],
    ['Phone', enquiry.phone],
    ['Email', enquiry.email],
    car ? ['Car', `${car}${vehicle.reg ? ` (${vehicle.reg})` : ''}`] : null,
    ...Object.entries(extra || {})
      .filter(([, v]) => v !== null && v !== '' && v !== undefined)
      .map(([k, v]) => [k.replace(/_/g, ' ').replace(/^./, s => s.toUpperCase()), String(v)])
  ].filter(Boolean);

  const text = [
    `${label} from the website`, '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    enquiry.message ? `\nMessage:\n${enquiry.message}` : '',
    '', `Reply to this email to answer ${enquiry.name} directly.`,
    adminUrl ? `All enquiries: ${adminUrl}` : ''
  ].filter(Boolean).join('\n');

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f4f5f7;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#141414">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e3e5e9;border-radius:10px">
    <tr><td style="padding:20px 24px;border-bottom:3px solid #1d3fbf">
      <div style="font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:#5b5b5b">${escapeHtml(dealer?.name || 'Website')}</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px">${escapeHtml(label)}</div>
    </td></tr>
    <tr><td style="padding:16px 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.5">
        ${rows.map(([k, v]) => `<tr>
          <td style="padding:7px 0;color:#5b5b5b;width:34%;vertical-align:top">${escapeHtml(k)}</td>
          <td style="padding:7px 0;font-weight:600">${escapeHtml(v)}</td></tr>`).join('')}
      </table>
      ${enquiry.message ? `<div style="margin-top:16px;padding:14px 16px;background:#f7f8fa;border-radius:8px;font-size:15px;line-height:1.55;white-space:pre-wrap">${escapeHtml(enquiry.message)}</div>` : ''}
      ${enquiry.email ? `<p style="margin:18px 0 0;font-size:14px;color:#5b5b5b">Reply to this email and it goes straight to ${escapeHtml(enquiry.name)}.</p>` : ''}
      ${adminUrl ? `<p style="margin:14px 0 0"><a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#1d3fbf;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 18px;border-radius:8px">Open the inbox</a></p>` : ''}
    </td></tr>
  </table></body></html>`;

  return { subject, html, text };
}
