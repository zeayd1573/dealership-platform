// Website content settings: defaults + per-dealer overrides stored in site_settings.
import { imageUrl } from './util.js';

export const SITE_DEFAULTS = {
  site_title: 'MHL Motors | Used Cars for Sale in Kilbeggan, Moate & Co. Westmeath | Car Finance',
  site_description: 'MHL Motors stocks quality used cars, SUVs and vans in Kilbeggan, Co. Westmeath, near Moate and Tullamore. Used car finance arranged, trade-ins welcome. Browse our stock online or call in.',
  hero_kicker: 'Used cars · Kilbeggan, Co. Westmeath',
  hero_title: 'Honest cars, *straight* prices.',
  hero_lede: "Family-run car sales on the Moate Road. Every car is history-checked and NCT'd before it goes on the forecourt. Finance arranged, trade-ins welcome, and you'll always deal with the owner.",
  hero_tag_label: 'On the forecourt',
  hero_tag_value: '2017 Audi SQ7',
  hero_image_key: '',            // R2 key; empty = built-in /img/hero-forecourt.jpg
  trust: JSON.stringify([
    ['History checked', 'Every car is checked before it goes on sale.'],
    ['Finance arranged', 'Competitive rates, quick decisions, from 0% deposit.'],
    ['Trade-ins welcome', "Bring your old car and we'll give you a fair price."],
    ['Car sourcing', "Can't see it here? We'll find it in Ireland or the UK."]
  ]),
  about_kicker: 'About MHL Motors',
  about_title: 'A small garage that does things properly.',
  about_text: 'MHL Motors is run by Michael and a small team on the Moate Road in Kilbeggan. We keep a mixed range of quality cars, SUVs and vans, price them fairly and sell them straight, without the pressure.',
  about_points: 'Mixed stock from first cars to seven-seaters and commercials\nFinance arranged in-house with fast approval\nFair trade-in valuations and cash purchases\nCall, WhatsApp or drop in six days a week',
  about_image_key: '',
  analytics_id: '',           // e.g. G-4NWJPS42KT — GA4 tag, empty = off
  footer_blurb: 'Family-run used car sales in Kilbeggan, Co. Westmeath. Quality cars, honest prices, finance arranged and trade-ins welcome.'
};
export const SITE_KEYS = Object.keys(SITE_DEFAULTS);

/** Merged settings for a dealer, with image URLs resolved. */
export async function getSite(env, dealerId) {
  const { results } = await env.DB.prepare('SELECT key, value FROM site_settings WHERE dealer_id = ?').bind(dealerId).all();
  const s = { ...SITE_DEFAULTS };
  for (const r of results) if (r.key in s && r.value != null) s[r.key] = r.value;
  let trust; try { trust = JSON.parse(s.trust); } catch { trust = JSON.parse(SITE_DEFAULTS.trust); }
  return {
    ...s,
    trust,
    about_points: String(s.about_points || '').split('\n').map(x => x.trim()).filter(Boolean),
    hero_image: s.hero_image_key ? imageUrl(env, s.hero_image_key) : '/img/hero-forecourt.jpg',
    about_image: s.about_image_key ? imageUrl(env, s.about_image_key) : '/img/about-forecourt.jpg'
  };
}

export async function saveSite(env, dealerId, patch) {
  const stmts = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!SITE_KEYS.includes(k)) continue;
    let val = v;
    if (k === 'trust' && Array.isArray(v)) val = JSON.stringify(v);
    if (k === 'about_points' && Array.isArray(v)) val = v.join('\n');
    stmts.push(env.DB.prepare("INSERT INTO site_settings (dealer_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(dealer_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')").bind(dealerId, k, val == null ? null : String(val)));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

/** "Honest cars, *straight* prices." -> HTML with the starred word in <em>. */
export function markupTitle(t) {
  return escapeHtml(t).replace(/\*([^*]+)\*/g, '<em>$1</em>');
}
export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
