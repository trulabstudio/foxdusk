// Built by Foxdusk
// POST /api/license: Foxdusk Studio or Hookdusk Studio activates or refreshes a licence on one computer.
//   { action: "activate", key, device_id, device_name, version, product }
//   product is "hookdusk" from Hookdusk Studio; Foxdusk Studio sends none (= "foxdusk").
//   A key only unlocks the apps in its licence's products list. Both apps on the
//   same computer share one device ID, so they use one computer slot.
//   { action: "deactivate", key, device_id }   frees this computer's slot
// A successful activation returns a token signed with LICENSE_PRIVATE_KEY. Studio
// checks it offline with the public key, so it keeps working for 14 days offline.
'use strict';

const S = require('../lib/shared');

module.exports = S.handler(async (req, res) => {
  if (req.method !== 'POST') throw S.httpError(405, 'Method not allowed.');
  const body = await S.readBody(req);
  const key = S.normalizeKey(body.key);
  const device = String(body.device_id || '').trim();
  if (!/^FXD(-[A-Z2-9]{5}){4}$/.test(key)) throw S.httpError(400, 'That licence key is not in the right format. It looks like FXD-XXXXX-XXXXX-XXXXX-XXXXX.', { code: 'invalid' });
  if (!/^[a-f0-9-]{20,64}$/i.test(device)) throw S.httpError(400, 'Invalid device.', { code: 'invalid' });

  const app = body.product === 'hookdusk' ? 'hookdusk' : 'foxdusk';
  const [lic] = await S.db(`licenses?key=eq.${encodeURIComponent(key)}&select=key,email,status,max_devices,products,activations(device_id)`);
  if (!lic) throw S.httpError(404, 'This licence key was not found. Check it against your email.', { code: 'invalid' });

  if (body.action === 'deactivate') {
    await S.db(`activations?license_key=eq.${encodeURIComponent(key)}&device_id=eq.${encodeURIComponent(device)}`, { method: 'DELETE' });
    return S.send(res, 200, { ok: true });
  }

  if (lic.status !== 'active') throw S.httpError(403, 'This licence has been cancelled. Contact admin@foxdusk.com.', { code: 'revoked' });
  if (!S.appsOf(lic).includes(app)) {
    const has = S.appsOf(lic).map((a) => S.APPS[a].name).join(' and ');
    throw S.httpError(403, `This key is for ${has}, not ${S.APPS[app].name}. Get ${S.APPS[app].name} at foxdusk.com, or contact admin@foxdusk.com.`, { code: 'invalid' });
  }

  const devices = lic.activations || [];
  const name = String(body.device_name || '').slice(0, 80);
  const version = String(body.version || '').slice(0, 20);
  const now = new Date().toISOString();
  if (devices.some((d) => d.device_id === device)) {
    await S.db(`activations?license_key=eq.${encodeURIComponent(key)}&device_id=eq.${encodeURIComponent(device)}`, { method: 'PATCH', body: { last_seen: now, device_name: name, app_version: version } });
  } else {
    if (devices.length >= lic.max_devices) {
      throw S.httpError(409, `This key is already used on ${lic.max_devices} computers. Deactivate one in ${S.APPS[app].studio}, or contact admin@foxdusk.com to reset.`, { code: 'limit' });
    }
    await S.db('activations', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: { license_key: key, device_id: device, device_name: name, app_version: version } });
  }

  S.send(res, 200, {
    ok: true,
    token: S.signToken({ key, device, email: lic.email }),
    email: S.maskEmail(lic.email),
    devices_used: devices.some((d) => d.device_id === device) ? devices.length : devices.length + 1,
    max_devices: lic.max_devices,
  });
});
