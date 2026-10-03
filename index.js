#!/usr/bin/env node
'use strict';
/**
 * netkit.js - Fing-style network toolkit. Node >= 18, zero deps, Windows + Linux.
 * Usage: node netkit.js <health|ping|trace|dnslookup|dnsbench|speed|dhcp|wifi|scan|ports|cameras|router|insights> [args]
 * Only scan networks/devices you own or are authorized to test.
 */
const { spawn, execFile } = require('node:child_process');
const dnsAll = require('node:dns');
const dns = dnsAll.promises;
const net = require('node:net');
const dgram = require('node:dgram');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';


/* ---------------- infra ---------------- */
// spawn with arg array, no shell => no command injection
function run(cmd, args = [], { timeout = 30000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let out = '', err = '';
    const t = setTimeout(() => p.kill('SIGKILL'), timeout);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out, err: e.message }); }); // ENOENT etc.
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
}
async function pool(items, n, fn) {
  const res = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; res[k] = await fn(items[k]); }
  }));
  return res;
}
const isPrivate = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(ip);
function assertHost(h) {
  if (!(net.isIP(h) || /^[a-z0-9][a-z0-9.-]{0,252}$/i.test(h || ''))) throw new Error('invalid host: ' + h);
}
function assertPrivate(ip) {
  if (!net.isIPv4(ip) || !isPrivate(ip)) throw new Error('refusing non-private target: ' + ip);
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

/* ---------------- ping / traceroute ---------------- */
async function ping(host, count = 4, waitMs = 2000) {
  assertHost(host);
  const args = IS_WIN
    ? ['-n', String(count), '-w', String(waitMs), host]
    : IS_MAC
      ? ['-c', String(count), '-W', String(waitMs), host] // macOS: -W is milliseconds
      : ['-c', String(count), '-W', String(Math.max(1, Math.ceil(waitMs / 1000))), host]; // Linux: seconds
  const r = await run('ping', args, { timeout: count * (waitMs + 1000) + 3000 });
  if (r.code === -1) throw new Error('ping binary not available: ' + r.err);
  const t = [...r.out.matchAll(/time[=<]\s*([\d.]+)\s*ms/gi)].map((m) => +m[1]); // works for win + linux
  const ttl = +((r.out.match(/ttl=(\d+)/i) || [])[1]) || null;
  const avg = t.length ? t.reduce((a, b) => a + b, 0) / t.length : null;
  const jitter = t.length > 1 ? t.slice(1).reduce((a, x, i) => a + Math.abs(x - t[i]), 0) / (t.length - 1) : 0;
  return {
    host, sent: count, received: t.length,
    loss: +((100 * (count - t.length)) / count).toFixed(1),
    min: t.length ? Math.min(...t) : null, avg: avg === null ? null : +avg.toFixed(2),
    max: t.length ? Math.max(...t) : null, jitter: +jitter.toFixed(2), ttl,
  };
}

async function trace(host) {
  assertHost(host);
  let r = IS_WIN
    ? await run('tracert', ['-d', '-h', '30', '-w', '2000', host], { timeout: 180000 })
    : await run('traceroute', ['-n', '-m', '30', '-w', '2', host], { timeout: 180000 });
  if (!IS_WIN && r.code === -1) r = await run('tracepath', ['-n', host], { timeout: 180000 });
  const hops = r.out.split(/\r?\n/).map((l) => l.match(/^\s*(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({
    hop: +m[1],
    ips: [...new Set(m[2].match(/\d+\.\d+\.\d+\.\d+/g) || [])],
    rtts: [...m[2].matchAll(/(\d+(?:\.\d+)?)\s*ms/g)].map((x) => +x[1]),
    timeout: m[2].includes('*'),
  }));
  return { host, hops };
}

/* ---------------- network info ---------------- */
async function gateway() {
  if (IS_WIN) {
    const r = await run('powershell', ['-NoProfile', '-Command',
      '(Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Sort-Object RouteMetric | Select-Object -First 1).NextHop']);
    return r.out.trim() || null;
  }
  if (IS_MAC) {
    const r = await run('route', ['-n', 'get', 'default']);
    return (r.out.match(/gateway:\s*(\S+)/) || [])[1] || null;
  }
  const r = await run('ip', ['route', 'show', 'default']);
  return (r.out.match(/default via (\S+)/) || [])[1] || null;
}

function arpTable() {
  return new Promise((resolve, reject) => {
    execFile('arp', ['-a'], (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }

      console.log(stdout);
      resolve(stdout);
    });
  });
}
async function localNet() {
    let l = await arpTable();
  for (const [iface, list] of Object.entries(os.networkInterfaces()))
    for (const a of list)
      if (a.family === 'IPv4' && !a.internal && isPrivate(a.address))
        return { iface, ip: a.address, mask: a.netmask, mac: a.mac };
  return null;
}
function hosts(ip, mask) {
  const toI = (s) => s.split('.').reduce((a, b) => ((a << 8) | +b) >>> 0, 0);
  const fromI = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
  let m = toI(mask);
  if (m < 0xfffffc00) m = 0xffffff00; // cap sweep at /22, fall back to /24
  const base = (toI(ip) & m) >>> 0, size = (~m >>> 0) - 1;
  const out = [];
  for (let i = 1; i <= size; i++) { const h = fromI(base + i); if (h !== ip) out.push(h); }
  return out;
}
async function arpTable() {
  let r = IS_WIN ? await run('arp', ['-a']) : IS_MAC ? await run('arp', ['-an']) : await run('ip', ['neigh']);
  if (!IS_WIN && !IS_MAC && r.code !== 0) r = await run('arp', ['-an']);
  const out = [];
  for (const l of r.out.split(/\r?\n/)) {
    const m = l.match(/(\d+\.\d+\.\d+\.\d+)\D.*?([0-9a-f]{1,2}(?:[:-][0-9a-f]{1,2}){5})/i); // macOS prints a:b:c:d:e:f (no zero padding)
    if (!m) continue;
    const mac = m[2].toLowerCase().split(/[:-]/).map((o) => o.padStart(2, '0')).join(':');
    if (mac === 'ff:ff:ff:ff:ff:ff' || /^(22[4-9]|23\d|255)\./.test(m[1]) || m[1].endsWith('.255')) continue;
    out.push({ ip: m[1], mac });
  }
  return out;
}

/* ---------------- vendor lookup (IEEE oui.txt next to this file) ---------------- */
let OUI = null;
function vendor(mac) {
  if (parseInt(mac.slice(0, 2), 16) & 2) return 'Private (randomized) MAC';
  if (!OUI) {
    OUI = new Map();
    try {
      for (const l of fs.readFileSync(path.join(__dirname, 'oui.txt'), 'utf8').split(/\r?\n/)) {
        const m = l.match(/^([0-9A-F]{2})-([0-9A-F]{2})-([0-9A-F]{2})\s+\(hex\)\s+(.+)$/i);
        if (m) OUI.set((m[1] + m[2] + m[3]).toLowerCase(), m[4].trim());
      }
    } catch { /* oui.txt missing -> Unknown */ }
  }
  return OUI.get(mac.slice(0, 8).replace(/:/g, '')) || 'Unknown';
}
const osGuess = (ttl) => (ttl == null ? null : ttl <= 64 ? 'Linux/Android/iOS/macOS' : ttl <= 128 ? 'Windows' : 'Network device');
const rdns = (ip) => Promise.race([dns.reverse(ip).then((a) => a[0]).catch(() => null), new Promise((r) => setTimeout(() => r(null), 1500))]);

/* ---------------- device discovery (Fing "Devices") ---------------- */
async function discover() {
  const n = await localNet();
  if (!n) throw new Error('no private IPv4 interface found');
  const targets = hosts(n.ip, n.mask);
  const gw = await gateway();
  const ttl = new Map();
  await pool(targets, 64, async (ip) => { const p = await ping(ip, 1, 700); if (p.received) ttl.set(ip, p.ttl); });
  const inSubnet = new Set(targets);
  const arp = (await arpTable()).filter((e) => inSubnet.has(e.ip));
  const devices = await pool(arp, 16, async (e) => ({
    ip: e.ip, mac: e.mac, vendor: vendor(e.mac), hostname: await rdns(e.ip),
    alive: ttl.has(e.ip), ttl: ttl.get(e.ip) ?? null, osGuess: osGuess(ttl.get(e.ip)),
    role: e.ip === gw ? 'Networking' : 'Personal',
  }));
  devices.push({ ip: n.ip, mac: n.mac, vendor: vendor(n.mac), hostname: os.hostname(), alive: true, ttl: null, osGuess: process.platform, role: 'Personal', self: true });
  return { net: n, gateway: gw, devices };
}

/* ---------------- notifications (snapshot diff) + insights ---------------- */
const DIR = path.join(os.homedir(), '.netkit');
async function scan() {
  const { gateway: gw, devices } = await discover();
  const gwMac = (devices.find((d) => d.ip === gw) || {}).mac || 'unknown';
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `net-${gwMac.replace(/:/g, '')}.json`);
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first scan */ }
  const events = [];
  if (!prev) events.push({ type: 'new_network', gatewayMac: gwMac });
  else {
    const before = new Set(prev.devices.map((d) => d.mac)), now = new Set(devices.map((d) => d.mac));
    devices.filter((d) => !before.has(d.mac)).forEach((d) => events.push({ type: 'new_device', ...d }));
    prev.devices.filter((d) => !now.has(d.mac)).forEach((d) => events.push({ type: 'device_gone', ip: d.ip, mac: d.mac }));
  }
  fs.writeFileSync(file, JSON.stringify({ ts: new Date().toISOString(), devices }, null, 2));
  return { count: devices.length, events, devices, insights: insights(devices) };
}
function insights(devices) {
  const group = (f) => devices.reduce((m, d) => { const k = f(d); m[k] = (m[k] || 0) + 1; return m; }, {});
  return {
    byProfile: group((d) => d.role),
    byVendor: group((d) => d.vendor),
    byOS: group((d) => d.osGuess || 'unknown'),
    recognition: group((d) => (d.vendor === 'Unknown' ? 'none' : /randomized/.test(d.vendor) ? 'partial' : 'full')),
  };
}
async function insightsCmd() {
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.json')) : [];
  return files.map((f) => {
    const s = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    return { network: f, ts: s.ts, ...insights(s.devices) };
  });
}

/* ---------------- ports ---------------- */
const TOP = [21, 22, 23, 25, 53, 80, 110, 139, 443, 445, 554, 1883, 3389, 5555, 7547, 8000, 8080, 8291, 8443, 8554, 8899, 9000, 34567, 37777];
function tcp(ip, port, ms = 800) {
  return new Promise((res) => {
    const s = new net.Socket(); let done = false;
    const fin = (v) => { if (!done) { done = true; s.destroy(); res(v); } };
    s.setTimeout(ms);
    s.once('connect', () => fin(true)); s.once('timeout', () => fin(false)); s.once('error', () => fin(false));
    s.connect(port, ip);
  });
}
async function ports(ip, list = TOP) {
  assertPrivate(ip);
  const r = await pool(list, 200, async (p) => ((await tcp(ip, p)) ? p : null));
  return { ip, open: r.filter(Boolean) };
}

/* ---------------- UDP helper (SSDP / ONVIF) ---------------- */
function udpProbe(ip, port, payload, ms = 2500) {
  return new Promise((res) => {
    const s = dgram.createSocket('udp4'); const seen = new Set();
    s.on('message', (_m, r) => seen.add(r.address));
    s.on('error', () => {});
    s.bind(0, () => s.send(payload, port, ip, () => {}));
    setTimeout(() => { try { s.close(); } catch { /* already closed */ } res([...seen]); }, ms);
  });
}
const ONVIF_PROBE = Buffer.from(
  `<?xml version="1.0" encoding="UTF-8"?><e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl"><e:Header><w:MessageID>uuid:${randomUUID()}</w:MessageID><w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To><w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header><e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>`);
const SSDP = Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 1\r\nST: upnp:rootdevice\r\n\r\n');

/* ---------------- hidden camera heuristics ---------------- */
function rtsp(ip) {
  return new Promise((res) => {
    const s = net.connect({ host: ip, port: 554, timeout: 1500 }, () => s.write(`OPTIONS rtsp://${ip}:554/ RTSP/1.0\r\nCSeq: 1\r\n\r\n`));
    s.once('data', (d) => { res(/^RTSP\/1\.0/.test(d.toString())); s.destroy(); });
    s.once('error', () => res(false));
    s.once('timeout', () => { res(false); s.destroy(); });
  });
}
async function cameras() {
  const { devices } = await discover();
  const onvif = new Set(await udpProbe('239.255.255.250', 3702, ONVIF_PROBE));
  const CAM_PORTS = [554, 8554, 37777, 34567, 8899, 8000];
  const camVendor = /hikvision|dahua|reolink|amcrest|xiongmai|uniview|axis comm|foscam|ezviz|lorex|hanwha|vivotek|wyze/i;
  const res = await pool(devices.filter((d) => !d.self), 8, async (d) => {
    const open = (await ports(d.ip, CAM_PORTS)).open;
    const rt = open.includes(554) ? await rtsp(d.ip) : false;
    const why = [];
    let score = 0;
    if (rt) { score += 3; why.push('answers RTSP'); }
    if (onvif.has(d.ip)) { score += 3; why.push('answers ONVIF discovery'); }
    if (open.some((p) => p !== 554)) { score += 2; why.push('camera-typical ports ' + open.join(',')); }
    if (camVendor.test(d.vendor)) { score += 2; why.push('camera vendor OUI: ' + d.vendor); }
    return { ip: d.ip, mac: d.mac, vendor: d.vendor, score, why };
  });
  return res.filter((r) => r.score > 0).sort((a, b) => b.score - a.score); // heuristic only, not proof
}

/* ---------------- router vulnerabilities (Fing tiles: UPnP Ports / UPnP Port Forwarding / NAT Port Mapping / Public Access) ---------------- */
const xmlTag = (x, n) => (x.match(new RegExp(`<(?:\\w+:)?${n}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${n}>`, 'i')) || [])[1];
const isCgnat = (ip) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip || '');

function udpRequest(ip, port, buf, ms = 1500) { // first datagram from ip:port, or null
  return new Promise((res) => {
    const s = dgram.createSocket('udp4'); let done = false;
    const fin = (v) => { if (!done) { done = true; try { s.close(); } catch { /* closed */ } res(v); } };
    s.on('message', (m, r) => { if (r.address === ip) fin(m); });
    s.on('error', () => fin(null));
    s.bind(0, () => s.send(buf, port, ip, () => {}));
    setTimeout(() => fin(null), ms);
  });
}
async function ssdpLocation(gw) {
  const m = await udpRequest(gw, 1900, SSDP, 2000);
  return m ? (m.toString().match(/^location:\s*(\S+)/im) || [])[1] || null : null;
}
async function soap(ctrl, type, action, args = '') {
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${type}">${args}</u:${action}></s:Body></s:Envelope>`;
  try {
    const r = await fetch(ctrl, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPAction: `"${type}#${action}"` }, body, signal: AbortSignal.timeout(3000) });
    return { ok: r.ok, text: await r.text() };
  } catch { return { ok: false, text: '' }; }
}
async function upnpProbe(gw) {
  const out = { ssdp: false, location: null, controlUrl: null, controlPort: null, externalIp: null, mappings: [], listable: null };
  const loc = await ssdpLocation(gw);
  if (!loc) return out;
  out.ssdp = true; out.location = loc;
  let u; try { u = new URL(loc); } catch { return out; }
  if (u.hostname !== gw) return out; // SSRF guard: only talk to the gateway itself
  let xml; try { xml = await (await fetch(loc, { signal: AbortSignal.timeout(3000) })).text(); } catch { return out; }
  const svc = [...xml.matchAll(/<service>([\s\S]*?)<\/service>/gi)].map((m) => ({ type: xmlTag(m[1], 'serviceType'), ctrl: xmlTag(m[1], 'controlURL') }))
    .find((s) => /WAN(IP|PPP)Connection/i.test(s.type || ''));
  if (!svc) return out;
  const ctrl = new URL(svc.ctrl, loc);
  if (ctrl.hostname !== gw) return out;
  out.controlUrl = ctrl.href; out.controlPort = +ctrl.port || 80;
  const ext = await soap(ctrl.href, svc.type, 'GetExternalIPAddress');
  out.externalIp = xmlTag(ext.text, 'NewExternalIPAddress') || null;
  for (let i = 0; i < 64; i++) { // enumerate existing forwards; 713 fault = end of list
    const r = await soap(ctrl.href, svc.type, 'GetGenericPortMappingEntry', `<NewPortMappingIndex>${i}</NewPortMappingIndex>`);
    if (!r.ok) { out.listable = i > 0 || /713|SpecifiedArrayIndexInvalid/.test(r.text); break; }
    out.listable = true;
    out.mappings.push({
      protocol: xmlTag(r.text, 'NewProtocol'), externalPort: +xmlTag(r.text, 'NewExternalPort'),
      internalClient: xmlTag(r.text, 'NewInternalClient'), internalPort: +xmlTag(r.text, 'NewInternalPort'),
      enabled: xmlTag(r.text, 'NewEnabled') === '1', description: xmlTag(r.text, 'NewPortMappingDescription') || '',
      leaseSec: +xmlTag(r.text, 'NewLeaseDuration') || 0,
    });
  }
  return out;
}
async function natMapping(gw, myIp) {
  const pmp = await udpRequest(gw, 5351, Buffer.from([0, 0])); // NAT-PMP: external address request
  const pcpReq = Buffer.alloc(24); pcpReq[0] = 2; pcpReq[1] = 0; // PCP ANNOUNCE
  pcpReq.fill(0xff, 18, 20); myIp.split('.').forEach((o, i) => (pcpReq[20 + i] = +o));
  const pcp = await udpRequest(gw, 5351, pcpReq);
  return {
    natPmp: !!pmp && pmp[0] === 0 && pmp[1] === 128,
    natPmpExternalIp: pmp && pmp.length >= 12 && pmp.readUInt16BE(2) === 0 ? [...pmp.subarray(8, 12)].join('.') : null,
    pcp: !!pcp && pcp[0] === 2 && (pcp[1] & 0x80) !== 0,
  };
}
async function router() {
  const gw = await gateway();
  const n = localNet();
  if (!gw || !n) throw new Error('no default gateway / private interface');
  assertPrivate(gw);
  const [{ open }, upnp, nat] = await Promise.all([
    ports(gw, [21, 22, 23, 53, 80, 443, 1900, 7547, 8080, 8443, 5555, 8291]),
    upnpProbe(gw),
    natMapping(gw, n.ip),
  ]);
  let publicIp = null;
  try { publicIp = (await (await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(4000) })).text()).trim(); } catch { /* offline */ }
  const wanIp = upnp.externalIp || nat.natPmpExternalIp;
  const cgnat = isCgnat(wanIp) || (!!wanIp && isPrivate(wanIp)) || (!!wanIp && !!publicIp && wanIp !== publicIp);
  const v6 = Object.values(os.networkInterfaces()).flat()
    .filter((a) => a.family === 'IPv6' && !a.internal && !/^(fe80|fc|fd)/i.test(a.address)).map((a) => a.address);

  // Public access: LAN-side hairpin probe of the public IP. Many routers block hairpin, so a "closed" result is NOT proof.
  const cand = [...new Set([...upnp.mappings.filter((m) => /tcp/i.test(m.protocol)).map((m) => m.externalPort), 21, 22, 23, 80, 443, 7547, 8080])];
  const hairpinOpen = publicIp && !cgnat ? (await pool(cand, 50, async (p) => ((await tcp(publicIp, p, 1500)) ? p : null))).filter(Boolean) : [];

  const tiles = {
    upnpPorts: upnp.ssdp || open.includes(1900)
      ? { status: 'warn', value: `UPnP enabled${upnp.controlPort ? ` (control :${upnp.controlPort})` : ''}`, fix: 'Disable UPnP in router admin unless an app needs it' }
      : { status: 'ok', value: 'UPnP not responding' },
    upnpPortForwarding: !upnp.controlUrl
      ? { status: 'n/a', value: 'IGD service not reachable' }
      : upnp.mappings.length
        ? { status: 'fail', value: `${upnp.mappings.length} active mapping(s)`, mappings: upnp.mappings, fix: 'Delete unknown mappings; find the LAN client that requested them' }
        : { status: 'ok', value: upnp.listable === false ? '0 (router hides list)' : '0 mappings' },
    natPortMapping: nat.natPmp || nat.pcp
      ? { status: 'warn', value: [nat.natPmp && 'NAT-PMP', nat.pcp && 'PCP'].filter(Boolean).join(' + ') + ' enabled', fix: 'Disable NAT-PMP/PCP in router admin' }
      : { status: 'ok', value: 'NAT-PMP/PCP not responding' },
    publicAccess: hairpinOpen.length
      ? { status: 'fail', value: 'Reachable via public IP: ' + hairpinOpen.join(','), fix: 'Close/forward-remove these ports on the router' }
      : cgnat
        ? { status: 'ok', value: 'IPv4 not directly reachable (CGNAT/double NAT)' }
        : { status: 'warn', value: 'No hairpin hit, but inconclusive: test from outside', fix: `nmap -Pn -p 21,22,23,80,443,7547,8080 ${publicIp}` },
  };
  const issues = [];
  if (open.includes(23)) issues.push('Telnet open: plaintext admin');
  if (open.includes(21)) issues.push('FTP open');
  if (open.includes(7547)) issues.push('TR-069 (7547) reachable on LAN: verify not exposed on WAN');
  if (open.includes(5555)) issues.push('ADB (5555) open');
  if (open.includes(80) && !open.includes(443)) issues.push('Admin UI over HTTP only');
  if (v6.length) issues.push('Global IPv6 addresses present: LAN devices may be inbound-reachable if the router IPv6 firewall is off. Test from outside: nmap -6 -Pn <v6-addr>');
  return { gateway: gw, publicIp, wanIp, cgnat, tiles, adminPortsOpen: open, upnp: { ...upnp, mappings: undefined }, nat, ipv6Global: v6, issues };
}

/* ---------------- DNS ---------------- */
async function dnsLookup(name) {
  assertHost(name);
  if (net.isIP(name)) return { ptr: await dns.reverse(name).catch((e) => e.code) };
  const q = async (fn) => dns[fn](name).catch((e) => e.code);
  return { A: await q('resolve4'), AAAA: await q('resolve6'), MX: await q('resolveMx'), NS: await q('resolveNs'), TXT: await q('resolveTxt'), CNAME: await q('resolveCname') };
}
async function dnsBench(rounds = 3) {
  const servers = { system: dnsAll.getServers(), cloudflare: ['1.1.1.1'], google: ['8.8.8.8'], quad9: ['9.9.9.9'], opendns: ['208.67.222.222'] };
  const names = ['google.com', 'amazon.com', 'wikipedia.org', 'github.com', 'cloudflare.com', 'netflix.com'];
  const out = [];
  for (const [label, list] of Object.entries(servers)) {
    const r = new dns.Resolver({ timeout: 2000, tries: 1 });
    r.setServers(list);
    const t = []; let fail = 0;
    for (let i = 0; i < rounds; i++) for (const n of names) {
      const s = performance.now();
      try { await r.resolve4(n); t.push(performance.now() - s); } catch { fail++; }
    }
    out.push({ label, servers: list, medianMs: t.length ? +median(t).toFixed(1) : null, p95Ms: t.length ? +[...t].sort((a, b) => a - b)[Math.floor(t.length * 0.95) - 1 || 0].toFixed(1) : null, failures: fail });
  }
  return out.sort((a, b) => (a.medianMs ?? 1e9) - (b.medianMs ?? 1e9));
}

/* ---------------- speed test (Cloudflare) ---------------- */
async function speed() {
  const lat = await ping('1.1.1.1', 5);
  const read = async (url, init) => { const r = await fetch(url, init); let b = 0; if (r.body) for await (const c of r.body) b += c.length; return b; };
  let t = performance.now();
  const bytes = (await Promise.all([0, 1, 2, 3].map(() => read('https://speed.cloudflare.com/__down?bytes=25000000')))).reduce((a, b) => a + b, 0);
  const down = (bytes * 8) / 1e6 / ((performance.now() - t) / 1000);
  const body = Buffer.alloc(10_000_000);
  t = performance.now();
  await Promise.all([0, 1, 2].map(() => fetch('https://speed.cloudflare.com/__up', { method: 'POST', body }).then((r) => r.arrayBuffer())));
  const up = (body.length * 3 * 8) / 1e6 / ((performance.now() - t) / 1000);
  return { latencyMs: lat.avg, jitterMs: lat.jitter, downMbps: +down.toFixed(1), upMbps: +up.toFixed(1) };
}

/* ---------------- DHCP ---------------- */
async function dhcp(active = false) {
  let lease;
  if (IS_WIN) {
    const r = await run('ipconfig', ['/all']);
    lease = r.out.split(/\r?\n/).filter((l) => /DHCP Server|DHCP Enabled|Lease (Obtained|Expires)|Default Gateway|DNS Servers/i.test(l)).map((l) => l.trim());
  } else if (IS_MAC) {
    const n = localNet();
    const r = await run('ipconfig', ['getpacket', n ? n.iface : 'en0']);
    lease = r.out.split(/\r?\n/).filter((l) => /server_identifier|lease_time|router|domain_name_server|yiaddr/i.test(l)).map((l) => l.trim());
  } else {
    const r = await run('nmcli', ['-t', '-f', 'DHCP4', 'device', 'show']);
    lease = r.out.split(/\r?\n/).filter(Boolean);
  }
  let probe = null; // active broadcast needs nmap + root/admin (+ Npcap on Windows)
  if (active) { const r = await run('nmap', ['--script', 'broadcast-dhcp-discover'], { timeout: 60000 }); probe = r.code === -1 ? 'nmap not installed' : r.out; }
  return { lease, probe };
}

/* ---------------- Wi-Fi scanner ---------------- */
async function wifi() {
  const rows = [];
  if (IS_WIN) {
    const r = await run('netsh', ['wlan', 'show', 'networks', 'mode=bssid']);
    let cur = null, b = null;
    for (const raw of r.out.split(/\r?\n/)) {
      const l = raw.trim(); let m;
      if ((m = l.match(/^SSID \d+\s*: (.*)$/))) { cur = { ssid: m[1], auth: '' }; b = null; }
      else if (cur && (m = l.match(/^Authentication\s*: (.+)$/))) cur.auth = m[1];
      else if (cur && (m = l.match(/^BSSID \d+\s*: (.+)$/))) { b = { ssid: cur.ssid, auth: cur.auth, bssid: m[1], signal: null, channel: null }; rows.push(b); }
      else if (b && (m = l.match(/^Signal\s*: (\d+)%/))) b.signal = +m[1];
      else if (b && (m = l.match(/^Channel\s*: (\d+)/))) b.channel = +m[1];
    }
  } else if (IS_MAC) {
    // best-effort: 'airport' CLI was removed in recent macOS; SSIDs may be <redacted> without Location permission for the terminal app
    const r = await run('system_profiler', ['SPAirPortDataType', '-json'], { timeout: 30000 });
    try {
      for (const itf of JSON.parse(r.out).SPAirPortDataType?.[0]?.spairport_airport_interfaces || []) {
        const cur = itf.spairport_current_network_information;
        for (const w of [...(cur ? [cur] : []), ...(itf.spairport_airport_other_local_wireless_networks || [])]) {
          const dbm = parseInt(w.spairport_signal_noise, 10);
          rows.push({ ssid: w._name, bssid: null, channel: parseInt(w.spairport_network_channel, 10) || null,
            signal: Number.isFinite(dbm) ? Math.max(0, Math.min(100, 2 * (dbm + 100))) : null, signalDbm: Number.isFinite(dbm) ? dbm : null, auth: w.spairport_security_mode || '' });
        }
      }
    } catch { /* unsupported output */ }
  } else {
    const r = await run('nmcli', ['-t', '-f', 'SSID,BSSID,CHAN,SIGNAL,SECURITY', 'dev', 'wifi', 'list', '--rescan', 'yes'], { timeout: 20000 });
    for (const l of r.out.split(/\r?\n/).filter(Boolean)) {
      const f = l.split(/(?<!\\):/).map((x) => x.replace(/\\:/g, ':'));
      rows.push({ ssid: f[0], bssid: f[1], channel: +f[2], signal: +f[3], auth: f[4] });
    }
  }
  const byCh = rows.reduce((m, x) => { m[x.channel] = (m[x.channel] || 0) + 1; return m; }, {});
  return { networks: rows.sort((a, b) => (b.signal || 0) - (a.signal || 0)), channelCongestion: byCh };
}

/* ---------------- health check ---------------- */
async function health() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, status: ok === true ? 'ok' : ok === 'warn' ? 'warn' : 'fail', detail });
  const n = localNet(); add(`interface has private IPv4 (${n?.ip || 'unknown'})`);
  const gw = await gateway(); add(`default gateway present (${gw})`, !!gw, gw);
  if (gw) { const p = await ping(gw, 4); add(`gateway reachable (${gw})`, p.loss === 0 ? (p.avg > 20 ? 'warn' : true) : p.loss < 50 ? 'warn' : false, p); }
  const p2 = await ping('1.1.1.1', 4);
  add(`internet reachable (ICMP) (1.1.1.1)`, p2.loss === 0 ? (p2.avg > 100 || p2.jitter > 30 ? 'warn' : true) : p2.loss < 50 ? 'warn' : false, p2);
  try { const s = performance.now(); const a = await dns.lookup('example.com'); const ms = +(performance.now() - s).toFixed(0); add('system DNS resolves', ms > 300 ? 'warn' : true, { ...a, ms }); }
  catch (e) { add('system DNS resolves', false, e.code); }
  try {
    const r = await fetch('http://connectivitycheck.gstatic.com/generate_204', { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    add('HTTP internet / captive portal', r.status === 204 ? true : 'warn', { status: r.status });
  } catch (e) { add('HTTP internet / captive portal', false, e.name); }
  const rank = { ok: 0, warn: 1, fail: 2 };
  const overall = checks.reduce((w, c) => (rank[c.status] > rank[w] ? c.status : w), 'ok');
  return { overall, checks };
}

module.exports = { ping, trace, health, speed, dnsLookup, dnsBench, dhcp, wifi, discover, scan, insights: insightsCmd, ports, cameras, router };

/* ---------------- CLI ---------------- */
if (require.main === module) {
  const [cmd, ...a] = process.argv.slice(2);
  const map = {
    health, speed, dnsbench: dnsBench, wifi, scan, cameras, router, insights: insightsCmd,
    ping: () => ping(a[0], +a[1] || 4),
    trace: () => trace(a[0]),
    dnslookup: () => dnsLookup(a[0]),
    // dhcp: () => dhcp(a.includes('--active')),
    ports: () => ports(a[0], a[1] ? a[1].split(',').map(Number) : TOP),
  };
  if (!map[cmd]) { console.error('commands: ' + Object.keys(map).join(' | ')); process.exit(2); }
  Promise.resolve(map[cmd]()).then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error('error:', e.message); process.exit(1); });
}