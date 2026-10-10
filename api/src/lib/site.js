// Website content settings: defaults + per-dealer overrides stored in site_settings.
import { imageUrl } from './util.js';

export const SITE_DEFAULTS = {
  site_title: 'M6 Motors | Used Cars, Ballinasloe, Co. Galway',
  site_description: 'M6 Motors stocks quality used cars, SUVs and commercials on the Athlone Road in Ballinasloe, Co. Galway. Every car photographed in detail, finance arranged, trade-ins welcome.',
  hero_kicker: 'Used cars \u00b7 Ballinasloe, Co. Galway',
  hero_title: 'Unbeatable quality, prices and service',
  hero_lede: 'A name you can trust.',
  hero_tag_label: 'On the forecourt',
  hero_tag_value: '2019 BMW X5 M Sport',
  hero_image_key: '',            // R2 key; empty = built-in /img/hero-x5.jpg
  trust: JSON.stringify([
    ['Seen before you travel', 'Twenty-plus photographs of every car, taken here, not stock images.'],
    ['Finance arranged', 'First Citizen, Bluestone and Alphera. Quick decisions, competitive rates.'],
    ['Trade-ins welcome', 'Bring the old car and we will price it honestly against the new one.'],
    ['Off the M6', 'Five minutes from the motorway at Ballinasloe. Easy run from Galway or Athlone.']
  ]),
  about_kicker: 'About M6 Motors',
  about_title: 'A Galway garage that shows you the whole car.',
  about_text: 'M6 Motors sells quality used cars from Dolan\u2019s Service Station on the Athlone Road in Ballinasloe. We keep a mixed range, mostly German and premium, and we photograph every one of them in detail before it goes up.',
  about_points: 'Premium and family stock, from hatchbacks to seven-seat SUVs\nFinance arranged through First Citizen, Bluestone and Alphera\nFair trade-in prices against anything on the forecourt\nSales, service and aftersales all on the one site',
  about_image_key: '',
  footer_blurb: 'Quality used cars on the Athlone Road in Ballinasloe, Co. Galway. Every car photographed in detail, finance arranged and trade-ins welcome.',
  analytics_id: '',           // e.g. G-4NWJPS42KT — GA4 tag, empty = off. Loaded only after cookie consent.
  watermark_on: '0',          // '1' = bake the logo into served car photos
  watermark_position: 'tl',   // tl | tc | tr | c | bl | bc | br
  watermark_scope: 'main',    // main = main photo only | all
  watermark_opacity: '0.9',
  watermark_key: '',          // R2 key of a custom watermark PNG; empty = built-in /img/watermark.png
  sold_stamp_on: '1',         // '1' = sold cars get the SOLD ribbon baked in
  photo_version: '1',         // bumped whenever branding changes so photo URLs change and caches refresh
  notify_on: '0',             // '1' = email the dealer when an enquiry comes in. OFF until switched on.
  notify_to: '',              // who gets them; comma separated. No address means nothing is sent.
  notify_from: '',            // verified sender, e.g. "MHL Motors <enquiries@mhlmotors.ie>". Empty = provider test sender.
  notify_types: ''            // comma separated enquiry types, empty = all of them
};

/** Settings the public site must never receive. */
export const PRIVATE_SITE_KEYS = ['hero_image_key', 'about_image_key', 'watermark_key', 'notify_on', 'notify_to', 'notify_from', 'notify_types'];
export const SITE_KEYS = Object.keys(SITE_DEFAULTS);

/** Merged settings for a dealer, with image URLs resolved. */
/** Just the photo version, for URL cache-busting (cheap, one row). */
export async function getPhotoVersion(env, dealerId) {
  return (await env.DB.prepare('SELECT value FROM site_settings WHERE dealer_id = ? AND key = ?').bind(dealerId, 'photo_version').first('value')) || '1';
}

export async function getSite(env, dealerId) {
  const { results } = await env.DB.prepare('SELECT key, value FROM site_settings WHERE dealer_id = ?').bind(dealerId).all();
  const s = { ...SITE_DEFAULTS };
  for (const r of results) if (r.key in s && r.value != null) s[r.key] = r.value;
  let trust; try { trust = JSON.parse(s.trust); } catch { trust = JSON.parse(SITE_DEFAULTS.trust); }
  return {
    ...s,
    trust,
    about_points: String(s.about_points || '').split('\n').map(x => x.trim()).filter(Boolean),
    watermark_image: s.watermark_key ? imageUrl(env, s.watermark_key) : '/img/watermark.png',
    hero_image: s.hero_image_key ? imageUrl(env, s.hero_image_key) : '/img/slide-1.jpg',
    about_image: s.about_image_key ? imageUrl(env, s.about_image_key) : '/img/about-gle.jpg'
  };
}

const BRANDING_KEYS = ['watermark_on', 'watermark_position', 'watermark_scope', 'watermark_opacity', 'watermark_key', 'sold_stamp_on'];
export async function saveSite(env, dealerId, patch) {
  const stmts = [];
  if (BRANDING_KEYS.some(k => k in patch)) {
    const cur = parseInt(await env.DB.prepare('SELECT value FROM site_settings WHERE dealer_id = ? AND key = ?').bind(dealerId, 'photo_version').first('value'), 10) || 1;
    patch = { ...patch, photo_version: String(cur + 1) };
  }
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
