// Built by Foxdusk
// Foxdusk order form (Foxdusk AIOS, Hookdusk AIOS or the bundle): shows the prices and bank details from aios.json,
// shrinks large receipt photos, and sends the order to /api/order.
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const MAX = 3 * 1024 * 1024;
  const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  let config = null;
  let receipt = null; // { name, type, data }
  // The bundle is chosen by default; a link or button can pick another.
  let product = 'bundle';
  let prices = { foxdusk: 0, hookdusk: 0, bundle: 0, upgrade_hookdusk: 0, upgrade_foxdusk: 0 };
  let salesOpen = false;

  const money = (n) => `RM ${Number(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const setText = (sel, text) => document.querySelectorAll(sel).forEach((el) => { el.textContent = text; });

  // Price, bank details and the bot-check key come from admin > Settings
  // (/api/order). aios.json is the fallback, e.g. when previewing offline.
  const loadSettings = () => fetch('/api/order', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((s) => (typeof s.price_rm === 'number' ? s : Promise.reject()))
    .catch(() => fetch('aios.json', { cache: 'no-store' }).then((r) => r.json()).then((c) => ({ ...c, open: Number(c.price_rm) > 0 })));

  loadSettings()
    .then((c) => {
      config = c;
      prices = { foxdusk: Number(c.price_rm) || 0, hookdusk: 0, bundle: 0, ...Object.fromEntries(Object.entries(c.prices || {}).map(([k, v]) => [k, Number(v) || 0])) };
      // Upgrade = bundle minus the app already owned (the server works it out the same way).
      for (const [up, owned] of [['upgrade_hookdusk', 'foxdusk'], ['upgrade_foxdusk', 'hookdusk']]) {
        if (!(up in prices)) prices[up] = prices.bundle > prices[owned] && prices[owned] > 0 ? prices.bundle - prices[owned] : 0;
      }
      salesOpen = c.open !== false;
      const open = salesOpen && Number(c.price_rm) > 0;
      const short = (n) => `RM ${Number(n).toLocaleString('en-MY', { maximumFractionDigits: 2 })}`;
      document.querySelectorAll('[data-product-price]').forEach((el) => { const n = prices[el.dataset.productPrice]; el.textContent = salesOpen && n > 0 ? short(n) : 'Coming soon'; });
      const save = prices.foxdusk + prices.hookdusk - prices.bundle;
      const deal = salesOpen && prices.bundle > 0 && save > 0;
      setText('[data-bundle-save]', deal ? `Save ${short(save)} on the two apps` : '');
      setText('[data-bundle-save-short]', deal ? `Save ${short(save)}` : '');
      setText('[data-bundle-was]', deal ? short(prices.foxdusk + prices.hookdusk) : '');
      document.querySelectorAll('[data-plan]').forEach((el) => { el.hidden = !(prices[el.dataset.plan] > 0); });
      // Only offer what has a price; hide the choice when only one is on sale.
      const onSale = NEW.filter((k) => prices[k] > 0);
      const upgrades = UPGRADES.filter((k) => prices[k] > 0);
      canUpgrade = salesOpen && upgrades.length > 0;
      setText('[data-upgrade-from]', canUpgrade ? short(Math.min(...upgrades.map((k) => prices[k]))) : '');
      document.querySelectorAll('[data-upgrade-line]').forEach((el) => { el.hidden = !canUpgrade; });
      document.querySelectorAll('[data-product]').forEach((b) => { b.hidden = !(prices[b.dataset.product] > 0); });
      newChoices = onSale.length;
      document.querySelectorAll('[data-buy]').forEach((a) => { a.hidden = !(salesOpen && prices[a.dataset.buy] > 0); });
      if (!(prices[product] > 0)) product = onSale[0] || upgrades[0] || product;
      setText('[data-price-tag]', open ? money(c.price_rm) : '');
      setText('[data-price-short]', open ? `RM ${Number(c.price_rm).toLocaleString('en-MY', { maximumFractionDigits: 2 })}` : 'Price coming soon');
      const tag = document.querySelector('[data-price-tag]');
      if (open && tag) tag.insertAdjacentHTML('beforeend', ' <small>one-time</small>');
      setText('[data-bank-name]', c.bank?.name || '');
      setText('[data-account-name]', c.bank?.account_name || '');
      setText('[data-account-no]', c.bank?.account_no || '');
      if (c.duitnow_qr) { $('[data-qr]').src = c.duitnow_qr; $('[data-qr-wrap]').hidden = false; }
      setProduct(product);
      // The site key comes from TURNSTILE_SITE_KEY in Vercel (or aios.json).
      if (salesOpen && onSale.length && c.turnstile_site_key) startTurnstile(c.turnstile_site_key);
      // WhatsApp number and contact email from admin > Settings > Contact.
      if ('whatsapp' in c) {
        const href = c.whatsapp
          ? `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(c.whatsapp_message || 'Hi Foxdusk, I have a question about Foxdusk AIOS:')}`
          : `mailto:${c.contact_email || 'admin@foxdusk.com'}`;
        document.querySelectorAll('#whatsappLink, #waFloat, a[href^="https://wa.me/"]').forEach((a) => { a.href = href; });
        const label = document.querySelector('#whatsappLink .btn-label');
        if (label) label.textContent = c.whatsapp ? 'Message us on WhatsApp' : 'Email us';
      }
      if (c.contact_email) {
        const mail = $('#emailLink');
        if (mail) { mail.textContent = c.contact_email; mail.href = `mailto:${c.contact_email}`; }
      }
      // Card / FPX through Stripe, when switched on in admin > Settings.
      if (salesOpen && onSale.length && c.card) { $('#payMethod').hidden = false; setMethod('card'); }
      // Keep the price search engines read in step with admin > Settings.
      try {
        const ld = document.getElementById('ld');
        const data = JSON.parse(ld.textContent);
        const app = data['@graph'].find((x) => x['@type'] === 'SoftwareApplication' && x.name === 'Foxdusk AIOS');
        app.offers.price = Number(c.price_rm).toFixed(2);
        app.offers.availability = open ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder';
        ld.textContent = JSON.stringify(data);
      } catch {}
    })
    .catch(() => setText('[data-price]', 'See below'));

  // ---------- what to buy: Foxdusk AIOS, Hookdusk AIOS or both ----------
  const NEW = ['bundle', 'foxdusk', 'hookdusk'];
  const UPGRADES = ['upgrade_hookdusk', 'upgrade_foxdusk'];
  let newChoices = 3;
  let canUpgrade = false;
  // New licence or "add the other app to my key": only one of the two shows.
  function showMode(upgrade) {
    $('#productPick').hidden = upgrade || newChoices < 2;
    $('#upgradeBox').hidden = !upgrade;
    $('#upgradeOpen').hidden = upgrade || !canUpgrade;
    if (upgrade) $('#upsell').hidden = true;
  }
  function setProduct(next) {
    if (!(next in prices)) return;
    product = next;
    showMode(UPGRADES.includes(next));
    document.querySelectorAll('[data-product]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.product === next)));
    const price = prices[next];
    const open = salesOpen && price > 0;
    // Chose one app? Show what the other adds and how little it costs.
    const other = { foxdusk: 'hookdusk', hookdusk: 'foxdusk' }[next];
    const diff = prices.bundle - price;
    const upsell = $('#upsell');
    if (other && salesOpen && prices.bundle > 0 && diff > 0) {
      upsell.querySelector('[data-upsell-app]').textContent = other === 'hookdusk' ? 'Hookdusk AIOS' : 'Foxdusk AIOS';
      upsell.querySelector('[data-upsell-diff]').textContent = `RM ${diff.toLocaleString('en-MY', { maximumFractionDigits: 2 })}`;
      upsell.querySelector('[data-upsell-why]').textContent = other === 'hookdusk'
        ? 'Know what to post: topics, hooks and scripts ready to film.'
        : 'Turn what you film into a finished, captioned video.';
      upsell.hidden = false;
    } else upsell.hidden = true;
    setText('[data-price]', open ? money(price) : 'Coming soon');
    const button = $('#submit');
    if (!button.dataset.busy) {
      button.disabled = !open;
      button.textContent = open ? TEXT[method].button : 'Sales open soon';
    }
    hideError();
  }
  document.querySelectorAll('[data-product]').forEach((b) => b.addEventListener('click', () => setProduct(b.dataset.product)));
  document.querySelectorAll('[data-buy]').forEach((a) => a.addEventListener('click', () => setProduct(a.dataset.buy)));
  document.querySelectorAll('[data-product-to]').forEach((b) => b.addEventListener('click', () => setProduct(b.dataset.productTo)));
  $('#upgradeOpen').addEventListener('click', () => { setProduct(UPGRADES.find((k) => prices[k] > 0) || 'upgrade_hookdusk'); $('#upgradeKey').focus(); });
  $('#upgradeClose').addEventListener('click', () => setProduct(NEW.find((k) => prices[k] > 0) || 'bundle'));
  const wanted = new URLSearchParams(location.search).get('product');
  if (wanted && wanted in prices) product = wanted;

  // ---------- how to pay: card / FPX (Stripe) or bank transfer ----------
  let method = 'bank';
  const TEXT = {
    card: { title: '2. Your details', lede: 'We send your licence key and download link to this email as soon as the payment goes through.', button: 'Continue to secure payment' },
    bank: { title: '2. Send your receipt', lede: 'We email your download link and licence key once the payment is confirmed, usually within one working day.', button: 'Send order' },
  };
  function setMethod(next) {
    method = next;
    document.querySelectorAll('[data-method]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.method === next)));
    $('[data-card-info]').hidden = next !== 'card';
    $('[data-bank-info]').hidden = next === 'card';
    $('#receiptField').hidden = next === 'card';
    $('#formTitle').textContent = TEXT[next].title;
    $('#formLede').textContent = TEXT[next].lede;
    if (!$('#submit').disabled) $('#submit').textContent = TEXT[next].button;
    hideError();
  }
  document.querySelectorAll('[data-method]').forEach((b) => b.addEventListener('click', () => setMethod(b.dataset.method)));

  // Coming back from Stripe.
  const back = new URLSearchParams(location.search);
  if (back.get('paid')) {
    $('#paidNo').textContent = back.get('paid').slice(0, 40);
    $('#orderForm').hidden = true;
    $('#paidDone').hidden = false;
    history.replaceState(null, '', `${location.pathname}#order`);
  } else if (back.get('cancelled')) {
    history.replaceState(null, '', `${location.pathname}#order`);
    setTimeout(() => showError('Payment cancelled. Nothing was charged. You can try again, or pay by bank transfer.'), 0);
  }

  // ---------- bot check (Cloudflare Turnstile) ----------
  // Only when aios.json has a site key. Cloudflare's script loads on this page alone.
  let turnstileOn = false;
  let turnstileToken = '';
  let turnstileWidget = null;
  function startTurnstile(siteKey) {
    turnstileOn = true;
    const box = $('#turnstile');
    box.hidden = false;
    window.foxduskTurnstileReady = () => {
      turnstileWidget = window.turnstile.render(box, {
        sitekey: siteKey,
        theme: 'light',
        action: 'aios-order',
        callback: (token) => { turnstileToken = token; hideError(); },
        'expired-callback': () => { turnstileToken = ''; },
        'error-callback': () => { turnstileToken = ''; showError('The security check could not load. Check your connection, then reload this page.'); },
      });
    };
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=foxduskTurnstileReady';
    script.async = true;
    script.defer = true;
    document.head.append(script);
  }
  function resetTurnstile() {
    turnstileToken = '';
    if (turnstileWidget !== null && window.turnstile) window.turnstile.reset(turnstileWidget);
  }

  document.querySelector('[data-copy="account"]').addEventListener('click', async (e) => {
    const no = config?.bank?.account_no || '';
    try { await navigator.clipboard.writeText(no.replace(/\s/g, '')); e.target.textContent = 'Copied'; setTimeout(() => { e.target.textContent = 'Copy'; }, 1500); } catch {}
  });

  // ---------- receipt ----------
  const input = $('#receipt');
  const drop = $('#drop');
  const label = $('[data-file-label]');

  const readAsDataUrl = (blob) => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fail; r.readAsDataURL(blob); });

  // Phone photos are often over 3 MB; redraw them as a smaller JPEG.
  async function shrinkImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
      for (const side of [2000, 1600, 1200]) {
        const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82));
        if (blob && blob.size <= MAX) return blob;
      }
      return null;
    } finally { URL.revokeObjectURL(url); }
  }

  async function takeFile(file) {
    hideError();
    receipt = null;
    if (!file) return;
    if (!TYPES.includes(file.type)) return showError('Please choose a JPG, PNG, WEBP, or PDF file.');
    let blob = file;
    let type = file.type;
    if (file.size > MAX) {
      if (type === 'application/pdf') return showError('This PDF is larger than 3 MB. Please send a screenshot of the receipt instead.');
      label.innerHTML = '<b>Making the photo smaller…</b>';
      blob = await shrinkImage(file).catch(() => null);
      if (!blob) return showError('This image is too large. Please send a screenshot of the receipt instead.');
      type = 'image/jpeg';
    }
    const dataUrl = await readAsDataUrl(blob);
    receipt = { name: file.name.slice(0, 120), type, data: String(dataUrl).split(',')[1] };
    const safeName = file.name.replace(/[&<>"']/g, '');
    label.innerHTML = type.startsWith('image/')
      ? `<img src="${dataUrl}" alt="Your receipt"><span><b>${safeName}</b> · change</span>`
      : `<b>${safeName}</b><small>PDF · change</small>`;
  }

  input.addEventListener('change', () => takeFile(input.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', (e) => takeFile(e.dataTransfer.files[0]));

  // ---------- submit ----------
  const form = $('#orderForm');
  const errBox = $('#formError');
  function showError(msg) { errBox.textContent = msg; errBox.hidden = false; }
  function hideError() { errBox.hidden = true; }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();
    const name = $('#name').value.trim();
    const email = $('#email').value.trim();
    const phone = $('#phone').value.trim();
    if (name.length < 2) return showError('Please enter your full name.'), $('#name').focus();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showError('Please enter a valid email address.'), $('#email').focus();
    if (!/^[+\d][\d\s-]{6,}$/.test(phone)) return showError('Please enter a valid phone number.'), $('#phone').focus();
    const upgrade_key = UPGRADES.includes(product) ? $('#upgradeKey').value.trim() : undefined;
    if (upgrade_key !== undefined && !/^FXD[A-Z2-9]{20}$/.test(upgrade_key.toUpperCase().replace(/[^A-Z0-9]/g, ''))) return showError('Enter your licence key. It looks like FXD-XXXXX-XXXXX-XXXXX-XXXXX.'), $('#upgradeKey').focus();
    if (method === 'bank' && !receipt) return showError('Please attach your payment receipt.');
    if (!$('#agree').checked) return showError('Please accept the licence and purchase terms.');
    if (turnstileOn && !turnstileToken) return showError('Please complete the security check above the Send button.');

    const button = $('#submit');
    if (method === 'card') {
      button.disabled = true;
      button.textContent = 'Opening secure payment…';
      try {
        const r = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone, product, upgrade_key, agree: true, website: $('#website').value, turnstile: turnstileToken }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.url) throw new Error(data.error || 'Card payment could not start. Please try again, or pay by bank transfer.');
        location.href = data.url;
      } catch (err) {
        showError(err.message === 'Failed to fetch' ? 'No connection. Check your internet and try again.' : err.message);
        if (turnstileOn) resetTurnstile();
        button.disabled = false;
        button.textContent = TEXT.card.button;
      }
      return;
    }
    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      const r = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, product, upgrade_key, receipt, agree: true, website: $('#website').value, turnstile: turnstileToken }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'We could not send your order. Please try again.');
      $('#orderNo').textContent = data.order_no;
      $('#doneEmail').textContent = email;
      form.hidden = true;
      $('#done').hidden = false;
      $('#done').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      showError(err.message === 'Failed to fetch' ? 'No connection. Check your internet and try again.' : err.message);
      // A Turnstile token works once; get a fresh one before the next try.
      if (turnstileOn) resetTurnstile();
      button.disabled = false;
      button.textContent = 'Send order';
    }
  });
})();
