// Built by Foxdusk
// GET /api/download?t=<download token>: the link in each buyer's key email.
// Checks that the buyer's licence is still active, then sends the browser to
// a 10-minute Supabase link for the zip in the private "downloads" bucket.
// The email link itself never expires, so buyers can download again later.
'use strict';

const S = require('../lib/shared');

function page(res, status, title, text) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${S.esc(title)} | Foxdusk AIOS</title>
<style>body{display:grid;place-content:center;min-height:100dvh;margin:0;padding:24px 16px;background:#292521;color:#fff;font:400 16px/1.55 'Poppins','Helvetica Neue',Arial,sans-serif}h1{margin:0 0 8px;font-size:28px;font-weight:500}p{max-width:40ch;margin:0 0 24px;color:#cbc1b6}a{display:inline-flex;align-items:center;min-height:44px;padding:0 24px;border-radius:99px;background:#fb8424;color:#292521;font-weight:500;text-decoration:none}</style></head>
<body><main><h1>${S.esc(title)}</h1><p>${S.esc(text)}</p><a href="mailto:admin@foxdusk.com">Email admin@foxdusk.com</a></main></body></html>`);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return page(res, 405, 'Not allowed', 'Open the download link from your email.');
    const token = String(new URL(req.url, 'http://x').searchParams.get('t') || '');
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return page(res, 400, 'This download link is not complete', 'Open the link straight from your Foxdusk AIOS email, or copy the whole link into your browser.');
    const [lic] = await S.db(`licenses?download_token=eq.${encodeURIComponent(token)}&select=status`);
    if (!lic) return page(res, 404, 'This download link is not valid', 'Check that you used the link from your Foxdusk AIOS email. If it still does not work, email us your order number.');
    if (lic.status !== 'active') return page(res, 403, 'This licence has been cancelled', 'The download is no longer available for this licence. Email us if you think this is a mistake.');
    const url = await S.signedDownloadUrl();
    res.statusCode = 302;
    res.setHeader('Location', url);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.end();
  } catch (e) {
    if (!e.status || e.status >= 500) console.error(e);
    page(res, e.status === 404 ? 503 : 500, 'The download is not ready', e.status === 404 ? e.message : 'Something went wrong. Please try again in a moment.');
  }
};
