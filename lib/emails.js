// Built by Foxdusk
// Email templates for Foxdusk AIOS orders. Malay first, English below.
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

function orderReceived(order) {
  const subject = `Pesanan diterima / Order received: ${order.order_no}`;
  const html = layout('Pesanan anda diterima', `
${p(`Hai ${esc(order.name)}, terima kasih. Kami sedang menyemak bayaran anda. Selepas disahkan, anda akan menerima email berasingan dengan pautan muat turun dan license key.`)}
${box(`No. pesanan: <b>${esc(order.order_no)}</b><br>Jumlah: <b>RM ${Number(order.amount_rm).toFixed(2)}</b>`)}
${p('Semakan biasanya selesai dalam 1 hari bekerja.')}
<hr style="border:0;border-top:1px solid #ded6cc;margin:20px 0">
${p(`Hi ${esc(order.name)}, thank you. We are checking your payment. Once it is confirmed, you will get a separate email with the download link and your licence key, usually within one working day.`)}`);
  const text = `Pesanan ${order.order_no} diterima (RM ${Number(order.amount_rm).toFixed(2)}). Kami akan email pautan muat turun dan license key selepas bayaran disahkan.\n\nOrder ${order.order_no} received. We will email your download link and licence key once the payment is confirmed.`;
  return { subject, html, text };
}

function orderApproved(order, license) {
  // Each buyer has their own link. It works while their licence is active.
  const download = `${site()}/api/download?t=${encodeURIComponent(license.download_token)}`;
  const subject = `Foxdusk AIOS anda sedia / Your Foxdusk AIOS is ready: ${order.order_no}`;
  const html = layout('Bayaran disahkan. Selamat datang!', `
${p(`Hai ${esc(order.name)}, bayaran untuk pesanan <b>${esc(order.order_no)}</b> telah disahkan.`)}
${box(`<b>License key anda</b><br><span style="font-family:Menlo,Consolas,monospace;font-size:17px;letter-spacing:.04em">${esc(license.key)}</span><br><span style="font-size:13px;color:#6f665e">Boleh digunakan pada ${license.max_devices} komputer.</span>`)}
<p style="margin:20px 0"><a href="${esc(download)}" style="display:inline-block;background:#fb8424;color:#292521;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px">Muat turun Foxdusk AIOS</a></p>
${p('<b>Cara mula</b>')}
<ol style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.7">
<li>Muat turun dan unzip fail tersebut (contohnya ke Desktop).</li>
<li>Double-click <b>1. Start Foxdusk (Mac)</b> atau <b>1. Start Foxdusk (Windows)</b>.</li>
<li>Masukkan license key di atas apabila diminta.</li>
<li>Buka <b>Setup</b> dan klik <b>Install everything</b> sekali.</li>
</ol>
${p('Simpan email ini. Lesen ini untuk kegunaan anda sahaja dan tidak boleh dikongsi atau dijual semula.')}
<hr style="border:0;border-top:1px solid #ded6cc;margin:20px 0">
${p(`Your payment for order <b>${esc(order.order_no)}</b> is confirmed. Download the kit with the button above, unzip it, double-click <b>1. Start Foxdusk</b>, and enter your licence key when asked. It works on ${license.max_devices} computers. Please keep this email; the licence is for your use only.`)}`);
  const text = `Bayaran disahkan untuk ${order.order_no}.\n\nLicense key: ${license.key}\nMuat turun: ${download}\n\n1. Unzip fail.\n2. Double-click "1. Start Foxdusk".\n3. Masukkan license key.\n4. Setup > Install everything.\n\nPayment confirmed. Download: ${download}\nLicence key: ${license.key} (works on ${license.max_devices} computers).`;
  return { subject, html, text };
}

function orderRejected(order, reason) {
  const subject = `Pesanan belum dapat disahkan / Order not confirmed: ${order.order_no}`;
  const why = reason ? box(esc(reason)) : '';
  const html = layout('Pesanan belum dapat disahkan', `
${p(`Hai ${esc(order.name)}, kami belum dapat mengesahkan bayaran untuk pesanan <b>${esc(order.order_no)}</b>.`)}
${why}
${p('Sila balas email ini dengan resit yang betul, atau hubungi admin@foxdusk.com.')}
<hr style="border:0;border-top:1px solid #ded6cc;margin:20px 0">
${p(`We could not confirm the payment for order <b>${esc(order.order_no)}</b>. Please reply to this email with the correct receipt.`)}`);
  const text = `Kami belum dapat mengesahkan bayaran untuk ${order.order_no}.${reason ? `\n\n${reason}` : ''}\n\nSila balas email ini dengan resit yang betul.`;
  return { subject, html, text };
}

function adminNewOrder(order) {
  const subject = `Pesanan baru ${order.order_no}: RM ${Number(order.amount_rm).toFixed(2)} (${order.name})`;
  const html = layout('Pesanan baru menunggu semakan', `
${box(`<b>${esc(order.order_no)}</b><br>${esc(order.name)}<br>${esc(order.email)}<br>${esc(order.phone || '')}<br>RM ${Number(order.amount_rm).toFixed(2)}`)}
<p style="margin:20px 0"><a href="${site()}/admin" style="display:inline-block;background:#fb8424;color:#292521;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px">Buka admin</a></p>
${p('Semak bayaran dalam akaun bank dahulu, kemudian klik Sahkan.')}`);
  return { subject, html, text: `${order.order_no} ${order.name} ${order.email} RM ${order.amount_rm}\n${site()}/admin` };
}

function adminCardPaid(order) {
  const subject = `Dibayar dengan Stripe: ${order.order_no} · RM ${Number(order.amount_rm).toFixed(2)} (${order.name})`;
  const html = layout('Jualan baru melalui Stripe', `
${box(`<b>${esc(order.order_no)}</b><br>${esc(order.name)}<br>${esc(order.email)}<br>${esc(order.phone || '')}<br>RM ${Number(order.amount_rm).toFixed(2)}`)}
${p('Bayaran disahkan oleh Stripe. License key dan link muat turun telah dihantar kepada pembeli secara automatik. Tiada tindakan diperlukan.')}
<p style="margin:20px 0"><a href="${site()}/admin#orders" style="display:inline-block;background:#fb8424;color:#292521;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px">Buka admin</a></p>`);
  return { subject, html, text: `${order.order_no} ${order.name} ${order.email} RM ${order.amount_rm} dibayar melalui Stripe. Key dihantar automatik.\n${site()}/admin` };
}

module.exports = { adminCardPaid, orderReceived, orderApproved, orderRejected, adminNewOrder, product: config.product };
