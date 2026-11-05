// Built by Foxdusk
// Email templates for Foxdusk AIOS orders, in English.
'use strict';

const { esc, env, config } = require('./shared');

const site = () => env('SITE_URL', { optional: true }) || 'https://www.foxdusk.com';

function layout(title, inner) {
  return `<!doctype html><html><body style="margin:0;background:#f3ede4;padding:24px 12px;font-family:Poppins,'Helvetica Neue',Arial,sans-serif;color:#292521">
<div style="max-width:560px;margin:0 auto;background:#faf7f2;border-radius:12px;padding:32px 24px">
<p style="margin:0 0 16px;font-size:12px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#a94b0b">Foxdusk AIOS</p>
<h1 style="margin:0 0 16px;font-size:24px;font-weight:600;line-height:1.25">${title}</h1>
${inner}
<p style="margin:28px 0 0;font-size:12px;color:#6f665e">Foxdusk, a division of Trulab Production Sdn. Bhd. · <a href="${site()}" style="color:#6f665e">foxdusk.com</a> · admin@foxdusk.com</p>
</div></body></html>`;
}
const p = (t) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${t}</p>`;
const box = (t) => `<div style="margin:16px 0;padding:16px;border-radius:8px;background:#f3ede4;font-size:15px;line-height:1.6">${t}</div>`;

const button = (href, label) => `<p style="margin:20px 0"><a href="${href}" style="display:inline-block;background:#fb8424;color:#292521;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px">${label}</a></p>`;
const money = (n) => `RM ${Number(n).toFixed(2)}`;

function orderReceived(order) {
  const subject = `Order received: ${order.order_no}`;
  const html = layout('We have your order', `
${p(`Hi ${esc(order.name)}, thank you for buying Foxdusk AIOS. We are now checking your payment.`)}
${box(`Order no.: <b>${esc(order.order_no)}</b><br>Amount: <b>${money(order.amount_rm)}</b>`)}
${p('Once the payment is confirmed, you will get a separate email with your licence key and download link. This usually takes less than one working day.')}`);
  const text = `Hi ${order.name}, thank you for buying Foxdusk AIOS.\n\nOrder no.: ${order.order_no}\nAmount: ${money(order.amount_rm)}\n\nWe are checking your payment. Once it is confirmed, you will get a separate email with your licence key and download link, usually within one working day.`;
  return { subject, html, text };
}

function orderApproved(order, license) {
  // Each buyer has their own link. It works while their licence is active.
  const download = `${site()}/api/download?t=${encodeURIComponent(license.download_token)}`;
  const subject = `Your Foxdusk AIOS is ready: ${order.order_no}`;
  const html = layout('Payment confirmed. Welcome!', `
${p(`Hi ${esc(order.name)}, your payment for order <b>${esc(order.order_no)}</b> is confirmed.`)}
${box(`<b>Your licence key</b><br><span style="font-family:Menlo,Consolas,monospace;font-size:17px;letter-spacing:.04em">${esc(license.key)}</span><br><span style="font-size:13px;color:#6f665e">Works on ${license.max_devices} computers.</span>`)}
${button(esc(download), 'Download Foxdusk AIOS')}
${p('<b>Windows</b>')}
<ol style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.7">
<li>Right-click <b>Foxdusk-AIOS.zip</b> &gt; <b>Properties</b>, tick <b>Unblock</b> at the bottom, click OK.</li>
<li>Right-click the zip &gt; <b>Extract All</b> &gt; <b>Extract</b>.</li>
<li>Open the <b>Foxdusk-AIOS</b> folder and double-click <b>1. Start Foxdusk (Windows)</b>.</li>
</ol>
${p('<b>Mac</b>')}
<ol style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.7">
<li>Double-click <b>Foxdusk-AIOS.zip</b>.</li>
<li>Open the <b>Foxdusk-AIOS</b> folder and double-click <b>1. Start Foxdusk (Mac)</b>.</li>
</ol>
${p('Foxdusk Studio opens in your browser. Paste the licence key above, then click <b>Setup</b> &gt; <b>Install everything</b> once.')}
${p('Blocked by Windows or macOS? Open <b>0. How to start.txt</b> in the folder. It shows what to click for each message.')}
${p('Please keep this email. The licence is for your own use and may not be shared or resold.')}`);
  const text = `Hi ${order.name}, your payment for order ${order.order_no} is confirmed.\n\nLicence key: ${license.key} (works on ${license.max_devices} computers)\nDownload: ${download}\n\nWindows\n1. Right-click Foxdusk-AIOS.zip > Properties > tick Unblock > OK.\n2. Right-click the zip > Extract All > Extract.\n3. Open the Foxdusk-AIOS folder and double-click \"1. Start Foxdusk (Windows)\".\n\nMac\n1. Double-click Foxdusk-AIOS.zip.\n2. Open the Foxdusk-AIOS folder and double-click \"1. Start Foxdusk (Mac)\".\n\nFoxdusk Studio opens in your browser. Paste your licence key, then click Setup > Install everything once.\nBlocked by Windows or macOS? Open \"0. How to start.txt\" in the folder.\n\nPlease keep this email. The licence is for your own use and may not be shared or resold.`;
  return { subject, html, text };
}

function orderRejected(order, reason) {
  const subject = `We could not confirm your payment: ${order.order_no}`;
  const why = reason ? box(esc(reason)) : '';
  const html = layout('We could not confirm your payment', `
${p(`Hi ${esc(order.name)}, we could not confirm the payment for order <b>${esc(order.order_no)}</b>.`)}
${why}
${p('Please reply to this email with the correct receipt, or contact admin@foxdusk.com, and we will check it again.')}`);
  const text = `Hi ${order.name}, we could not confirm the payment for order ${order.order_no}.${reason ? `\n\n${reason}` : ''}\n\nPlease reply to this email with the correct receipt, or contact admin@foxdusk.com, and we will check it again.`;
  return { subject, html, text };
}

function adminNewOrder(order) {
  const subject = `New order ${order.order_no}: ${money(order.amount_rm)} (${order.name})`;
  const html = layout('New order to review', `
${box(`<b>${esc(order.order_no)}</b><br>${esc(order.name)}<br>${esc(order.email)}<br>${esc(order.phone || '')}<br>${money(order.amount_rm)}`)}
${button(`${site()}/admin#orders`, 'Open admin')}
${p('Check the payment in your bank account first, then click Confirm.')}`);
  return { subject, html, text: `New order to review\n${order.order_no} ${order.name} ${order.email} ${money(order.amount_rm)}\n${site()}/admin#orders` };
}

function adminCardPaid(order) {
  const subject = `Paid with Stripe: ${order.order_no} · ${money(order.amount_rm)} (${order.name})`;
  const html = layout('New sale through Stripe', `
${box(`<b>${esc(order.order_no)}</b><br>${esc(order.name)}<br>${esc(order.email)}<br>${esc(order.phone || '')}<br>${money(order.amount_rm)}`)}
${p('Stripe confirmed the payment. The licence key and download link were sent to the buyer automatically. No action needed.')}
${button(`${site()}/admin#orders`, 'Open admin')}`);
  return { subject, html, text: `${order.order_no} ${order.name} ${order.email} ${money(order.amount_rm)} paid through Stripe. The key was sent automatically.\n${site()}/admin#orders` };
}

module.exports = { adminCardPaid, orderReceived, orderApproved, orderRejected, adminNewOrder, product: config.product };
