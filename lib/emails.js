// Built by Foxdusk
// Email templates for Foxdusk AIOS, Hookdusk AIOS and Fox Studio orders, in English.
'use strict';

const { esc, env, config, APPS, PRODUCTS, productOf, productName, appsOf } = require('./shared');

const site = () => env('SITE_URL', { optional: true }) || 'https://www.foxdusk.com';

function layout(title, inner, label = 'Foxdusk AIOS') {
  return `<!doctype html><html><body style="margin:0;background:#f3ede4;padding:24px 12px;font-family:Poppins,'Helvetica Neue',Arial,sans-serif;color:#292521">
<div style="max-width:560px;margin:0 auto;background:#faf7f2;border-radius:12px;padding:32px 24px">
<p style="margin:0 0 16px;font-size:12px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#a94b0b">${esc(label)}</p>
<h1 style="margin:0 0 16px;font-size:24px;font-weight:600;line-height:1.25">${title}</h1>
${inner}
<p style="margin:28px 0 0;font-size:12px;color:#6f665e">Foxdusk, a division of Trulab Production Sdn. Bhd. · <a href="${site()}" style="color:#6f665e">foxdusk.com</a> · admin@foxdusk.com</p>
</div></body></html>`;
}
const p = (t) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${t}</p>`;
const box = (t) => `<div style="margin:16px 0;padding:16px;border-radius:8px;background:#f3ede4;font-size:15px;line-height:1.6">${t}</div>`;

const button = (href, label) => `<p style="margin:20px 0"><a href="${href}" style="display:inline-block;background:#fb8424;color:#292521;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px">${label}</a></p>`;
const money = (n) => `RM ${Number(n).toFixed(2)}`;
// Fox Studio has no download link: the team sends the installer after payment.
const byTeam = (order) => PRODUCTS[productOf(order)].apps.every((a) => APPS[a].delivery === 'team');
const nextStep = (order) => (byTeam(order)
  ? 'your licence key, and our team will contact you to send the installer for your Mac'
  : 'your licence key and download link');

function orderReceived(order) {
  const subject = `Order received: ${order.order_no}`;
  const html = layout('We have your order', `
${p(`Hi ${esc(order.name)}, thank you for buying ${esc(productName(order))}. We are now checking your payment.`)}
${box(`Order no.: <b>${esc(order.order_no)}</b><br>Product: <b>${esc(productName(order))}</b><br>Amount: <b>${money(order.amount_rm)}</b>`)}
${p(`Once the payment is confirmed, you will get a separate email with ${nextStep(order)}. This usually takes less than one working day.`)}`, productName(order));
  const text = `Hi ${order.name}, thank you for buying ${productName(order)}.\n\nOrder no.: ${order.order_no}\nProduct: ${productName(order)}\nAmount: ${money(order.amount_rm)}\n\nWe are checking your payment. Once it is confirmed, you will get a separate email with ${nextStep(order)}, usually within one working day.`;
  return { subject, html, text };
}

// Download link and start steps for one app. Each buyer has their own link,
// and it works while their licence is active.
function appSteps(a, license) {
  const app = APPS[a];
  if (app.delivery === 'team') {
    const html = `
${box(`<b>Next: your installer</b><br>Our team will contact you within one working day, by email or WhatsApp, to send the ${esc(app.name)} installer. Reply to this email to tell us whether your Mac has an <b>Apple chip</b> (M1 or newer) or an <b>Intel</b> chip. You can see it in Apple menu → About This Mac.`)}
${p(`When you have it: install ${esc(app.name)}, open it, and paste the licence key above. Everything it needs is already inside the app. Activation needs the internet once.`)}`;
    const text = `${app.name}\nOur team will contact you within one working day, by email or WhatsApp, to send the installer. Reply to this email to tell us whether your Mac has an Apple chip (M1 or newer) or an Intel chip. You can see it in Apple menu → About This Mac.\n\nWhen you have it: install ${app.name}, open it, and paste your licence key. Activation needs the internet once.`;
    return { html, text };
  }
  const link = `${site()}/api/download?t=${encodeURIComponent(license.download_token)}${a === 'foxdusk' ? '' : `&p=${a}`}`;
  const html = `
${button(esc(link), `Download ${app.name}`)}
${p(`<b>Windows</b>`)}
<ol style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.7">
<li>Right-click <b>${app.file}</b> &gt; <b>Properties</b>, tick <b>Unblock</b> at the bottom, click OK.</li>
<li>Right-click the zip &gt; <b>Extract All</b> &gt; <b>Extract</b>.</li>
<li>Open the <b>${app.folder}</b> folder and double-click <b>1. ${app.start} (Windows)</b>.</li>
</ol>
${p('<b>Mac</b>')}
<ol style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.7">
<li>Double-click <b>${app.file}</b>.</li>
<li>Open the <b>${app.folder}</b> folder and double-click <b>1. ${app.start} (Mac)</b>.</li>
</ol>
${p(`${app.studio} opens in your browser. Paste the licence key above, then click ${app.setup} once.`)}`;
  const text = `${app.name}\nDownload: ${link}\n\nWindows\n1. Right-click ${app.file} > Properties > tick Unblock > OK.\n2. Right-click the zip > Extract All > Extract.\n3. Open the ${app.folder} folder and double-click "1. ${app.start} (Windows)".\n\nMac\n1. Double-click ${app.file}.\n2. Open the ${app.folder} folder and double-click "1. ${app.start} (Mac)".\n\n${app.studio} opens in your browser. Paste your licence key, then click ${app.setupText} once.`;
  return { html, text };
}

function orderApproved(order, license, offer) {
  const apps = appsOf(license);
  const upgrade = PRODUCTS[productOf(order)].upgradeFrom ? APPS[PRODUCTS[productOf(order)].apps[0]] : null;
  const offerHtml = offer ? `<div style="margin:24px 0;padding:18px;border-radius:10px;background:#fff3e6;border:1px dashed #fb8424">
<p style="margin:0 0 6px;font-size:16px;font-weight:600">Add ${esc(APPS[offer.app].name)} to this key for ${money(offer.price)}</p>
<p style="margin:0;font-size:14px;line-height:1.55">${offer.app === 'hookdusk' ? 'Know what to post before you film: topic ideas for your niche, hooks that stop the scroll, and scripts in BM or English.' : 'Turn what you film into a finished video: free transcription, dead air and retakes cut for you, and captions in your brand.'} Same key, no new licence to manage.</p>
${button(`${site()}/?product=${offer.product}#order`, `Add ${esc(APPS[offer.app].name)}`)}
<p style="margin:0;font-size:12px;color:#6f665e">On the order form, enter this licence key and the email you bought with.</p></div>` : '';
  const offerText = offer ? `\n\nAdd ${APPS[offer.app].name} to this key for ${money(offer.price)}: ${site()}/?product=${offer.product}#order (enter this licence key and the email you bought with).` : '';
  const names = apps.map((a) => APPS[a].name).join(' and ');
  const steps = apps.map((a) => appSteps(a, license));
  const subject = `Your ${names} ${apps.length > 1 ? 'are' : 'is'} ready: ${order.order_no}`;
  const many = apps.length > 1;
  const html = layout('Payment confirmed. Welcome!', `
${p(`Hi ${esc(order.name)}, your payment for order <b>${esc(order.order_no)}</b> is confirmed.${upgrade ? ` <b>${esc(upgrade.name)}</b> is now on your existing key. Everything you had keeps working.` : ''}`)}
${box(`<b>Your licence key</b><br><span style="font-family:Menlo,Consolas,monospace;font-size:17px;letter-spacing:.04em">${esc(license.key)}</span><br><span style="font-size:13px;color:#6f665e">${many ? `Unlocks ${esc(names)}. ` : ''}Works on ${license.max_devices} computers.</span>`)}
${steps.map((st, i) => (many ? `<h2 style="margin:28px 0 4px;font-size:18px;font-weight:600">${i + 1}. ${esc(APPS[apps[i]].name)}</h2>` : '') + st.html).join('\n')}
${apps.some((a) => APPS[a].file) ? p('Blocked by Windows or macOS? Open <b>0. How to start.txt</b> in the folder. It shows what to click for each message.') : ''}
${offerHtml}
${p('Please keep this email. The licence is for your own use and may not be shared or resold.')}`, many ? 'Foxdusk + Hookdusk' : APPS[apps[0]].name);
  const text = `Hi ${order.name}, your payment for order ${order.order_no} is confirmed.${upgrade ? ` ${upgrade.name} is now on your existing key.` : ''}\n\nLicence key: ${license.key} (${many ? `unlocks ${names}, ` : ''}works on ${license.max_devices} computers)\n\n${steps.map((st) => st.text).join('\n\n')}${apps.some((a) => APPS[a].file) ? '\n\nBlocked by Windows or macOS? Open "0. How to start.txt" in the folder.' : ''}${offerText}\n\nPlease keep this email. The licence is for your own use and may not be shared or resold.`;
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
  const subject = `New order ${order.order_no}: ${productName(order)} ${money(order.amount_rm)} (${order.name})`;
  const html = layout('New order to review', `
${box(`<b>${esc(order.order_no)}</b> · ${esc(productName(order))}<br>${esc(order.name)}<br>${esc(order.email)}<br>${esc(order.phone || '')}<br>${money(order.amount_rm)}`)}
${button(`${site()}/admin#orders`, 'Open admin')}
${p('Check the payment in your bank account first, then click Confirm.')}
${byTeam(order) ? p('<b>Fox Studio:</b> after you confirm, contact the buyer to send the Mac installer (Apple chip or Intel).') : ''}`);
  return { subject, html, text: `New order to review\n${order.order_no} ${productName(order)} ${order.name} ${order.email} ${money(order.amount_rm)}\n${site()}/admin#orders` };
}

function adminCardPaid(order) {
  const subject = `Paid with Stripe: ${order.order_no} · ${productName(order)} ${money(order.amount_rm)} (${order.name})`;
  const html = layout('New sale through Stripe', `
${box(`<b>${esc(order.order_no)}</b> · ${esc(productName(order))}<br>${esc(order.name)}<br>${esc(order.email)}<br>${esc(order.phone || '')}<br>${money(order.amount_rm)}`)}
${byTeam(order)
    ? p('Stripe confirmed the payment and the licence key was sent automatically. <b>Contact the buyer to send the Fox Studio installer for Mac (Apple chip or Intel).</b>')
    : p('Stripe confirmed the payment. The licence key and download link were sent to the buyer automatically. No action needed.')}
${button(`${site()}/admin#orders`, 'Open admin')}`);
  return { subject, html, text: `${order.order_no} ${productName(order)} ${order.name} ${order.email} ${money(order.amount_rm)} paid through Stripe. The key was sent automatically.${byTeam(order) ? ' Contact the buyer to send the Fox Studio installer.' : ''}\n${site()}/admin#orders` };
}

module.exports = { adminCardPaid, orderReceived, orderApproved, orderRejected, adminNewOrder, product: config.product };
