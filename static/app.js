/* Network Pulse — frontend (vanilla JS + Chart.js) */
'use strict';

const C = {
  ok: '#39D6A0', warn: '#EFB65B', crit: '#F0526E', primary: '#41D8EF', violet: '#A78BFA',
  text: '#DCE7F5', muted: '#71849E', border: '#1C2E4A', surface: '#0C1729',
};
const TARGET_COLORS = ['#41D8EF', '#A78BFA', '#DCE7F5', '#F9A8D4', '#7DD3FC', '#FCD34D'];
const POLL_MS = 2000;
const BUFFER_SEC = 3600;

const ICONS = {
  overview: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20h5v-6h3v6h5V9.5"/>',
  live: '<path d="M2 12h4l3-7 4 14 3-9 2 2h4"/>',
  tools: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12.5 15H17"/>',
  topology: '<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M11 7 6 16M13 7l5 9M7.2 18h9.6"/>',
  history: '<path d="M5 20v-8M9.5 20V6M14 20v-9M18.5 20V9"/>',
  events: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  compare: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  security: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 8v5M12 16.5h.01"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5M12 2.5V6"/>',
  jitter: '<path d="M2 12h3.5l2-5 3 10 3-12 2.5 9 1.5-2H22"/>',
  loss: '<path d="m12 3 9 4.5-9 4.5-9-4.5L12 3z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  trend: '<path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  shrink: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  list: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h1M7 13h1M7 17h1M11 9h6M11 13h6M11 17h6"/>',
  route: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
  router: '<rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 16.5h.01M10.5 16.5h.01M8 13V9.5M16 13V9.5M5.5 7.2a9 9 0 0 1 13 0"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5H7z"/>',
  down: '<path d="M12 4v15M6 13l6 6 6-6"/>',
  up: '<path d="M12 20V5M6 11l6-6 6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  prompt: '<path d="m4 7 5 5-5 5M12 17h8"/>',
  nodes: '<circle cx="12" cy="4.5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="12" cy="19.5" r="2"/><path d="M10.5 6 6.5 10.5M13.5 6l4 4.5M6.5 13.5l4 4.5M17.5 13.5l-4 4.5"/>',
  traffic: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
  speed: '<path d="M3.5 18a9 9 0 1 1 17 0"/><path d="m12 14.5 4.5-5.5"/><circle cx="12" cy="14.5" r="1.3"/>',
  report: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12.5h7M9 16.5h5"/>',
  device: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/>',
  filedown: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M12 11v6.5M9.2 14.8 12 17.5l2.8-2.7"/>',
  wifi: '<path d="M2.5 8.8a14 14 0 0 1 19 0M5.8 12.3a9 9 0 0 1 12.4 0M9.2 15.7a4.2 4.2 0 0 1 5.6 0"/><circle cx="12" cy="19" r="1.1"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/>',
};
const icon = (id, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ''}</svg>`;

const NAV = [
  { id: 'overview', num: '01', label: 'Overview', crumb: 'ภาพรวมเครือข่าย' },
  { id: 'live', num: '02', label: 'Live Monitor', crumb: 'กราฟ latency แบบสด' },
  { id: 'tools', num: '03', label: 'Network Tools', crumb: 'Ping · Traceroute · DNS · IP' },
  { id: 'speed', num: '04', label: 'Speed Test', crumb: 'วัดความเร็วดาวน์โหลด / อัปโหลดจริง' },
  { id: 'topology', num: '05', label: 'Topology', crumb: 'เส้นทางถึงอินเทอร์เน็ต · อุปกรณ์ในวง LAN' },
  { id: 'history', num: '06', label: 'History & Logs', crumb: 'ข้อมูลย้อนหลัง' },
  { id: 'events', num: '07', label: 'Events & Alerts', crumb: 'บันทึกเหตุการณ์และการแจ้งเตือน', badge: true },
  { id: 'compare', num: '08', label: 'Compare', crumb: 'เทียบช่วงเวลา' },
  { id: 'report', num: '09', label: 'Reports', crumb: 'รายงานคุณภาพอินเทอร์เน็ต สำหรับแจ้ง ISP' },
  { id: 'security', num: '10', label: 'Security', crumb: 'การเข้าสู่ระบบและอุปกรณ์' },
  { id: 'settings', num: '11', label: 'Settings', crumb: 'ตั้งค่าการวัดและการแจ้งเตือน', sep: true },
];

const KIND = {
  down: { label: 'หลุด', title: 'การเชื่อมต่อหลุด', color: C.crit, dot: 'dot-crit' },
  up: { label: 'กลับมา', title: 'เชื่อมต่อกลับมาแล้ว', color: C.ok, dot: 'dot-ok' },
  high_latency: { label: 'Latency สูง', title: 'Latency สูง', color: C.warn, dot: 'dot-warn' },
  latency_ok: { label: 'Latency ปกติ', title: 'Latency กลับเป็นปกติ', color: C.ok, dot: 'dot-ok' },
  gap: { label: 'ไม่มีข้อมูล', title: 'ช่วงที่ไม่มีข้อมูล', color: C.ok, dot: 'dot-ok' },
  auth: { label: 'เข้าสู่ระบบ', title: 'มีการเข้าสู่ระบบ', color: C.primary, dot: 'dot-info' },
  auth_lock: { label: 'ล็อก login', title: 'ใส่รหัสผิดหลายครั้ง', color: C.crit, dot: 'dot-crit' },
  settings: { label: 'ตั้งค่า', title: 'แก้การตั้งค่า', color: C.text, dot: 'dot-info' },
  speedtest: { label: 'Speed test', title: 'Speed test เสร็จแล้ว', color: C.primary, dot: 'dot-info' },
  new_device: { label: 'อุปกรณ์ใหม่', title: 'พบอุปกรณ์ใหม่ในวง LAN', color: C.warn, dot: 'dot-warn' },
  lan_scan: { label: 'สแกน LAN', title: 'สแกนอุปกรณ์ในวง LAN', color: C.primary, dot: 'dot-info' },
  error: { label: 'ผิดพลาด', title: 'ทำไม่สำเร็จ', color: C.crit, dot: 'dot-crit' },
  wifi: { label: 'Wi-Fi', title: 'Wi-Fi เปลี่ยนสถานะ', color: C.warn, dot: 'dot-warn' },
  dns_down: { label: 'DNS ไม่ตอบ', title: 'DNS ของเครื่องไม่ตอบ', color: C.crit, dot: 'dot-crit' },
  dns_ok: { label: 'DNS ปกติ', title: 'DNS กลับมาตอบแล้ว', color: C.ok, dot: 'dot-ok' },
};
const QUIET_KINDS = new Set(['gap', 'auth', 'settings', 'speedtest', 'lan_scan']);  // แสดงเป็น toast เท่านั้น ไม่ส่ง Browser Notification
const ALERT_KINDS = new Set(['down', 'high_latency', 'auth_lock', 'new_device', 'dns_down']);  // นับเป็น "ยังไม่ได้อ่าน" ที่กระดิ่ง
const STATUS_TEXT = { online: 'Online', degraded: 'Degraded', offline: 'Offline', unknown: 'Unknown' };
const STATUS_TH = { online: 'ออนไลน์', degraded: 'ไม่เสถียร', offline: 'ออฟไลน์', unknown: 'ไม่ทราบสถานะ' };

/* ---------- state ---------- */
const S = {
  cfg: null,
  ids: [],
  rounds: [],          // [ts, lat0, lat1, ...]  (null = ไม่ตอบ, "x" = ไม่ได้วัด)
  status: null,
  traffic: null,
  diag: null,          // Wi-Fi + DNS ล่าสุด
  overview: null,      // ผล /api/overview (สถิติ 24 ชม.)
  recentEvents: [],
  lastTs: 0,
  lastEventId: null,
  connected: false,
  serverNow: Math.floor(Date.now() / 1000),
};
let page = null;

/* ---------- utils ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const nowSec = () => Math.floor(Date.now() / 1000);
function fmtClock(ts) { const d = new Date(ts * 1000); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function fmtDT(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' ' + fmtClock(ts);
}
function fmtMs(v) {
  if (v === null || v === undefined || v === 'x') return '—';
  if (v < 1) return '<1';
  return v < 10 ? v.toFixed(1) : Math.round(v).toString();
}
function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  if (d) return `${d} วัน ${h} ชม.`;
  if (h) return `${h} ชม. ${m} นาที`;
  if (m) return `${m} นาที`;
  return `${sec} วินาที`;
}
function fmtBytes(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
function fmtRate(bps) {
  if (bps === null || bps === undefined) return ['—', ''];
  if (bps >= 1e9) return [(bps / 1e9).toFixed(2), 'Gbps'];
  if (bps >= 1e6) return [(bps / 1e6).toFixed(bps >= 1e8 ? 0 : 1), 'Mbps'];
  return [(bps / 1e3).toFixed(bps >= 1e5 ? 0 : 1), 'Kbps'];
}
const thr = () => S.cfg?.latency_threshold_ms ?? 200;
const msClass = (v) => v === null ? 'crit' : v > thr() ? 'warn' : '';
const targetName = (id) => S.cfg?.targets.find((t) => t.id === id)?.name ?? id;
const targetColor = (i) => TARGET_COLORS[i % TARGET_COLORS.length];
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } },
};

function toLogin() { location.replace('/login'); }

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (r.status === 401) { toLogin(); throw new Error('unauthorized'); }
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function postJSON(url, body = {}) {
  const r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { toLogin(); throw new Error('unauthorized'); }
  if (!r.ok) throw new Error(d.error || `${r.status}`);
  return d;
}

function statsOf(values) {
  // values: ตัวเลข หรือ null (ไม่ตอบ)
  let n = 0, ok = 0, sum = 0, min = null, max = null;
  for (const v of values) {
    n++;
    if (v === null) continue;
    ok++; sum += v;
    if (min === null || v < min) min = v;
    if (max === null || v > max) max = v;
  }
  return { n, ok, avg: ok ? sum / ok : null, min, max, loss: n ? 100 * (n - ok) / n : null };
}
function windowValues(i, startTs) {
  const out = [];
  for (const r of S.rounds) {
    if (r[0] < startTs) continue;
    const v = r[1 + i];
    if (v !== 'x') out.push(v);
  }
  return out;
}
/** index ของเป้าหมายภายนอก (ไม่ใช่ gateway) และของ gateway */
const extIdx = () => (S.status?.targets ?? []).map((t, i) => (t.kind !== 'gateway' ? i : -1)).filter((i) => i >= 0);
const gwIdx = () => (S.status?.targets ?? []).findIndex((t) => t.kind === 'gateway');

/** สถิติจาก rounds แบ่งเป็นช่อง ๆ ละ step วินาที เริ่มที่ start จำนวน count ช่อง (วนข้อมูลรอบเดียว) */
function bucketStats(start, step, count) {
  const ext = new Set(extIdx()), gw = gwIdx();
  const cells = Array.from({ length: count }, () => ({ sum: 0, n: 0, fail: 0, total: 0, jsum: 0, jn: 0, gsum: 0, gn: 0 }));
  const prev = {};
  for (const r of S.rounds) {
    const k = Math.floor((r[0] - start) / step);
    if (k < 0 || k >= count) continue;
    const c = cells[k];
    S.ids.forEach((_, i) => {
      const v = r[1 + i];
      if (v === 'x') return;
      c.total++;
      if (v === null) { c.fail++; prev[i] = null; return; }
      if (ext.has(i)) {
        c.sum += v; c.n++;
        if (prev[i] !== undefined && prev[i] !== null) { c.jsum += Math.abs(v - prev[i]); c.jn++; }
      }
      if (i === gw) { c.gsum += v; c.gn++; }
      prev[i] = v;
    });
  }
  return cells.map((c) => ({
    avg: c.n ? c.sum / c.n : null, jitter: c.jn ? c.jsum / c.jn : null,
    loss: c.total ? 100 * c.fail / c.total : null, gw: c.gn ? c.gsum / c.gn : null,
  }));
}

/* ---------- charts ---------- */
const chartReady = () => typeof window.Chart !== 'undefined';
if (chartReady()) {
  Chart.defaults.color = '#9FB0C6';
  Chart.defaults.borderColor = 'rgba(28,46,74,.6)';
  Chart.defaults.font.family = 'Inter, "Noto Sans Thai", sans-serif';
  Chart.defaults.font.size = 12;
}

const thresholdPlugin = {
  id: 'threshold',
  afterDatasetsDraw(chart) {
    const y = chart.scales.y;
    const t = thr();
    if (!y || t > y.max || t < y.min) return;
    const { ctx, chartArea: a } = chart;
    const py = y.getPixelForValue(t);
    ctx.save();
    ctx.strokeStyle = 'rgba(239,182,91,.7)';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.stroke();
    ctx.fillStyle = C.warn;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`${t} ms`, a.right - 44, py - 4);
    ctx.restore();
  },
};
/** เส้นเรืองแสงตามสีของเส้น */
const glowPlugin = {
  id: 'glow',
  beforeDatasetDraw(chart, args) {
    const ds = chart.data.datasets[args.index];
    if (ds.isFail || ds.yAxisID === 'y1') return;
    chart.ctx.save();
    chart.ctx.shadowColor = ds.borderColor;
    chart.ctx.shadowBlur = 8;
  },
  afterDatasetDraw(chart, args) {
    const ds = chart.data.datasets[args.index];
    if (ds.isFail || ds.yAxisID === 'y1') return;
    chart.ctx.restore();
  },
};
/** หน้าเว็บใช้ CSS zoom (75% บนจอคอม) ซึ่ง Chart.js คำนวณตำแหน่งเมาส์ผิด
 *  จึงคำนวณใหม่จาก clientX/Y เทียบกับขนาดจริงของ canvas บนจอ (ถูกทั้งตอนมีและไม่มี zoom) */
const zoomFixPlugin = {
  id: 'zoomFix',
  beforeEvent(chart, args) {
    const e = args.event, n = e.native;
    if (args.replay || !n || n.clientX === undefined) return;
    const r = chart.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    e.x = (n.clientX - r.left) * chart.width / r.width;
    e.y = (n.clientY - r.top) * chart.height / r.height;
    const a = chart.chartArea;
    args.inChartArea = e.x >= a.left && e.x <= a.right && e.y >= a.top && e.y <= a.bottom;
  },
};
/** พื้นไล่สีใต้เส้น */
function areaFill(color) {
  return (ctx) => {
    const a = ctx.chart.chartArea;
    if (!a) return color + '00';
    const g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
    g.addColorStop(0, color + '30');
    g.addColorStop(1, color + '00');
    return g;
  };
}

function makeChart(canvas, { lossAxis = false, tooltipFmt = 'd MMM HH:mm:ss', legend = true } = {}) {
  if (!chartReady()) {
    canvas.insertAdjacentHTML('afterend', '<div class="chart-msg">โหลด Chart.js ไม่ได้<br>ลองกด Ctrl+F5</div>');
    return null;
  }
  const grid = { color: 'rgba(28,46,74,.55)' };
  const scales = {
    x: {
      type: 'time',
      time: { tooltipFormat: tooltipFmt, displayFormats: { second: 'HH:mm:ss', minute: 'HH:mm', hour: 'HH:mm', day: 'd MMM' } },
      ticks: { maxRotation: 0, autoSkipPadding: 28 },
      grid, border: { display: false },
    },
    y: {
      beginAtZero: true,
      grace: '10%',
      ticks: { callback: (v) => `${v} ms`, maxTicksLimit: 7 },
      grid, border: { display: false },
    },
  };
  if (lossAxis) {
    scales.y1 = {
      position: 'right', min: 0, max: 100,
      ticks: { callback: (v) => `${v}%`, stepSize: 25 },
      grid: { display: false }, border: { display: false },
      title: { display: true, text: 'loss', color: C.muted },
    };
  }
  return new Chart(canvas, {
    type: 'line',
    data: { datasets: [] },
    plugins: [zoomFixPlugin, thresholdPlugin, glowPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      normalized: true,
      spanGaps: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      elements: { point: { radius: 0, hoverRadius: 3 }, line: { borderWidth: 1.8, tension: 0.3 } },
      scales,
      plugins: {
        legend: {
          display: legend,
          position: 'top', align: 'end',
          labels: { boxWidth: 9, boxHeight: 9, usePointStyle: true, pointStyle: 'circle', font: { size: 12.5 } },
        },
        tooltip: {
          backgroundColor: '#10203A', borderColor: '#2A4570', borderWidth: 1,
          titleColor: C.text, bodyColor: C.text, padding: 10,
          callbacks: {
            label(ctx) {
              const ds = ctx.dataset;
              if (ds.isFail) return `${ds.label}`;
              if (ds.yAxisID === 'y1') return `${ds.label}: ${ctx.parsed.y}%`;
              return `${ds.label}: ${fmtMs(ctx.parsed.y)} ms`;
            },
          },
        },
      },
    },
  });
}

function sparkline(canvas, values, color) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  if (values.length < 2) return;
  const nums = values.filter((v) => v !== null);
  const max = Math.max(20, ...nums) * 1.15;
  const step = w / (values.length - 1);
  const yOf = (v) => h - 3 - (v / max) * (h - 6);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + '40');
  grad.addColorStop(1, color + '00');
  // พื้นและเส้น (ขาดเป็นช่วงเมื่อไม่ตอบ)
  let seg = [];
  const flush = () => {
    if (seg.length > 1) {
      ctx.beginPath();
      seg.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.lineTo(seg[seg.length - 1][0], h); ctx.lineTo(seg[0][0], h); ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
    }
    seg = [];
  };
  values.forEach((v, k) => {
    if (v === null) {
      flush();
      ctx.fillStyle = C.crit;
      ctx.fillRect(k * step - 1, h - 6, 2, 6);
    } else seg.push([k * step, yOf(v)]);
  });
  flush();
}

/** sparkline แบบเส้นโค้งเรืองแสง ปรับสเกลตามช่วงค่าจริง (null = ข้าม) */
function miniSpark(canvas, values, color, { minSpan = 1, fill = true, floor = null } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const pts = values.map((v, k) => [k, v]).filter(([, v]) => v !== null && v !== undefined);
  if (pts.length < 2) return;
  let lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
  if (floor !== null) lo = Math.min(lo, floor);
  if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  const step = w / Math.max(1, values.length - 1);
  const xy = pts.map(([k, v]) => [k * step, h - 3 - ((v - lo) / (hi - lo)) * (h - 8)]);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(xy[0][0], xy[0][1]);
    for (let i = 1; i < xy.length; i++) {
      const [x0, y0] = xy[i - 1], [x1, y1] = xy[i];
      const mx = (x0 + x1) / 2;
      ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1);
    }
  };
  if (fill) {
    path();
    ctx.lineTo(xy[xy.length - 1][0], h); ctx.lineTo(xy[0][0], h); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00');
    ctx.fillStyle = g; ctx.fill();
  }
  path();
  ctx.strokeStyle = color; ctx.lineWidth = 1.6;
  ctx.shadowColor = color; ctx.shadowBlur = 6;
  ctx.stroke();
}

/** แปลง rounds ในช่วงเวลา เป็น datasets ของ Chart.js (เว้นช่องเมื่อขาดข้อมูล) */
function liveDatasets(startTs, { fill = false, fails = true } = {}) {
  const gapSec = Math.max(3 * (S.cfg?.interval_sec ?? 2), 6);
  const sets = [];
  const failPts = [];
  S.ids.forEach((id, i) => {
    const data = [];
    let prev = null;
    for (const r of S.rounds) {
      if (r[0] < startTs) continue;
      const v = r[1 + i];
      if (v === 'x') continue;
      if (prev !== null && r[0] - prev > gapSec) data.push({ x: (prev + 1) * 1000, y: null });
      data.push({ x: r[0] * 1000, y: v });
      if (v === null) failPts.push({ x: r[0] * 1000, y: 0 });
      prev = r[0];
    }
    const col = targetColor(i);
    sets.push({ label: targetName(id), data, borderColor: col, backgroundColor: fill ? areaFill(col) : col, fill: fill ? 'origin' : false });
  });
  if (fails) {
    sets.push({
      label: 'ไม่ตอบ', isFail: true, data: failPts, showLine: false,
      pointStyle: 'crossRot', pointRadius: 5, pointHoverRadius: 6, borderWidth: 2,
      borderColor: C.crit, backgroundColor: C.crit,
    });
  }
  return sets;
}

/* ---------- notifications, toasts & bell ---------- */
function toast(ev) {
  const k = KIND[ev.kind] || KIND.gap;
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.setProperty('--c', k.color);
  el.innerHTML = `<b>${esc(k.title)}</b><span>${esc(ev.message)}</span>`;
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), 9000);
}

const seenId = () => Number(store.get('np_seen_event') || 0);
function unreadAlerts() { return S.recentEvents.filter((e) => e.id > seenId() && ALERT_KINDS.has(e.kind)).length; }
function markSeen() {
  const max = S.recentEvents.reduce((m, e) => Math.max(m, e.id), 0);
  if (max > seenId()) store.set('np_seen_event', String(max));
  renderBadges();
}
function renderBadges() {
  const n = unreadAlerts();
  $('#bell-dot').hidden = n === 0;
  const b = $('#nav-badge-events');
  if (b) { b.hidden = n === 0; b.textContent = n > 99 ? '99+' : String(n); }
  if (!$('#bell-pop').hidden) renderBellList();
}
function renderBellList() {
  const seen = seenId();
  const list = S.recentEvents.slice(0, 8);
  $('#bell-list').innerHTML = list.length
    ? list.map((e) => eventItem(e, e.id > seen && ALERT_KINDS.has(e.kind))).join('')
    : '<div class="empty">ยังไม่มีเหตุการณ์</div>';
}
async function loadRecentEvents() {
  try {
    const d = await getJSON('/api/events?limit=30');
    S.recentEvents = d.events;
    renderBadges();
    page?.onRecent?.();
  } catch (_) { /* ลองใหม่รอบหน้า */ }
}

function onEvents(events) {
  events.forEach(toast);
  const notify = events.filter((e) => !QUIET_KINDS.has(e.kind));
  if (notify.length && 'Notification' in window && Notification.permission === 'granted') {
    try {
      if (notify.length === 1) {
        const e = notify[0];
        new Notification(`Network Pulse — ${KIND[e.kind]?.title ?? e.kind}`, { body: e.message, tag: `np-${e.id}`, icon: '/static/favicon.svg' });
      } else {
        new Notification(`Network Pulse — ${notify.length} เหตุการณ์ใหม่`, { body: notify.map((e) => e.message).join('\n'), icon: '/static/favicon.svg' });
      }
    } catch (_) { /* บางเบราว์เซอร์ (มือถือ) ไม่รองรับ new Notification */ }
  }
  const known = new Set(S.recentEvents.map((e) => e.id));
  S.recentEvents = [...events.filter((e) => !known.has(e.id)).reverse(), ...S.recentEvents].slice(0, 30);
  if (currentId === 'events') markSeen(); else renderBadges();
  page?.onEvents?.(events);
  page?.onRecent?.();
}

function renderNotifButton() {
  const btn = $('#notif-btn');
  if (!('Notification' in window) || !window.isSecureContext) {
    btn.textContent = 'แจ้งเตือนเฉพาะในหน้า';
    btn.disabled = true;
    btn.title = window.isSecureContext
      ? 'เบราว์เซอร์นี้ไม่รองรับ Browser Notification'
      : 'เบราว์เซอร์อนุญาต Notification เฉพาะเมื่อเปิดผ่าน localhost — บนอุปกรณ์นี้จะเห็นเป็นป๊อปอัปในหน้าเว็บแทน';
    return;
  }
  const p = Notification.permission;
  btn.classList.toggle('on', p === 'granted');
  btn.classList.toggle('blocked', p === 'denied');
  btn.textContent = p === 'granted' ? 'Browser Notification: เปิด' : p === 'denied' ? 'Notification ถูกบล็อก' : 'เปิด Browser Notification';
  btn.title = p === 'denied' ? 'อนุญาตการแจ้งเตือนให้เว็บนี้ได้ที่ไอคอนแม่กุญแจในแถบที่อยู่' : '';
}

/* ---------- polling ---------- */
async function poll() {
  const q = new URLSearchParams({ since: S.lastTs || nowSec() - BUFFER_SEC });
  if (S.lastEventId !== null) q.set('after_event', S.lastEventId);
  try {
    const d = await getJSON('/api/live?' + q);
    S.ids = d.targets;
    S.status = d.status;
    S.serverNow = d.now;
    S.traffic = d.traffic;
    S.diag = d.diag;
    for (const r of d.rounds) {
      if (r[0] > S.lastTs) { S.rounds.push(r); S.lastTs = r[0]; }
    }
    const cut = d.now - BUFFER_SEC;
    let i = 0;
    while (i < S.rounds.length && S.rounds[i][0] < cut) i++;
    if (i) S.rounds.splice(0, i);
    if (S.lastEventId !== null && d.events.length) onEvents(d.events);
    S.lastEventId = d.last_event_id;
    S.connected = true;
  } catch (e) {
    S.connected = false;
  }
  renderChrome();
  try { page?.update?.(); } catch (e) { console.error(e); }
  setTimeout(poll, POLL_MS);
}

async function loadConfig() {
  try {
    S.cfg = await getJSON('/api/config');
    $('#side-ver').textContent = `v${S.cfg.version}`;
    $('#logout-btn').hidden = !S.cfg.auth_enabled;
    const lan = S.cfg.lan;
    $('#side-lan').textContent = lan.bound ? `มือถือ: ${lan.ip}:${S.cfg.listen.split(':').pop()}` : '';
    $('.side-foot').title = `วัดทุก ${S.cfg.interval_sec} วินาที · เตือนเมื่อ > ${S.cfg.latency_threshold_ms} ms\nDB ${fmtBytes(S.cfg.db_bytes)} · ${S.cfg.listen}`;
  } catch (_) { /* จะลองใหม่รอบถัดไป */ }
}

async function loadOverview() {
  try {
    S.overview = await getJSON('/api/overview');
    page?.onOverview?.();
  } catch (_) { /* ลองใหม่รอบหน้า */ }
}

function overallState() {
  return S.connected ? (S.status?.overall?.status ?? 'unknown') : 'unknown';
}

function renderChrome() {
  const st = overallState();
  const pill = $('#overall-pill');
  pill.className = `chip chip-status st-${st}`;
  pill.querySelector('.dot').classList.toggle('pulse', st === 'online');
  $('#overall-text').textContent = S.connected ? STATUS_TEXT[st] : 'ไม่เชื่อมต่อ';

  const beat = S.status?.last_beat;
  const alive = S.connected && beat && S.serverNow - beat <= 3 * (S.cfg?.interval_sec ?? 2) + 3;
  $('#agent-dot').className = `dot ${alive ? 'dot-ok pulse' : 'dot-crit'}`;
  $('#agent-text').textContent = !S.connected ? 'ติดต่อโปรแกรมไม่ได้' : alive ? 'Local Agent Active' : 'ตัววัดไม่ทำงาน';
}

function tickClock() {
  const now = new Date();
  $('#clock').textContent = fmtClock(nowSec());
  $('#date').textContent = now.toLocaleDateString('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ---------- shared fragments ---------- */
function eventItem(e, unread = false) {
  const k = KIND[e.kind] || KIND.gap;
  const when = e.kind === 'gap' && e.ts_end ? `${fmtDT(e.ts)} – ${fmtClock(e.ts_end)}` : fmtDT(e.ts);
  return `<li class="${unread ? 'unread' : ''}"><span class="dot ${k.dot}"></span>
    <div><div class="ev-msg" title="${esc(e.message)}">${esc(e.message)}</div><div class="ev-time">${when}</div></div></li>`;
}
function statePill(t) {
  if (t.state === 'down') return '<span class="pill pill-offline"><span class="dot"></span>Offline</span>';
  if (t.state === 'unknown') return '<span class="pill pill-unknown"><span class="dot"></span>Unknown</span>';
  if (t.high) return '<span class="pill pill-degraded"><span class="dot"></span>High latency</span>';
  if (t.fail_streak > 0) return '<span class="pill pill-degraded"><span class="dot"></span>Packet loss</span>';
  return '<span class="pill pill-online"><span class="dot pulse"></span>Online</span>';
}
/** สถานะของเป้าหมาย: 'ok' | 'warn' | 'down' | 'unknown' */
function tState(t) {
  if (!t || t.state === 'unknown') return 'unknown';
  if (t.state === 'down') return 'down';
  if (t.high || t.fail_streak > 0) return 'warn';
  return 'ok';
}
const freshMs = (t) => (t && t.ts && S.serverNow - t.ts < 10 ? t.ms : undefined);

function targetCards(container, windowSec, labelTh) {
  const ts = S.status?.targets ?? [];
  container.innerHTML = ts.map((t, i) => `
    <div class="card tcard" style="--c:${targetColor(i)}" data-i="${i}">
      <div class="card-head" style="margin-bottom:0">
        <div><div class="t-name">${esc(t.name)}</div><div class="t-host">${esc(t.host)}</div></div>
        <div class="js-pill"></div>
      </div>
      <div class="t-ms js-ms">—</div>
      <div class="t-stats js-stats"></div>
      <canvas class="spark"></canvas>
    </div>`).join('');
  return () => {
    const start = S.serverNow - windowSec;
    (S.status?.targets ?? []).forEach((t, i) => {
      const card = container.querySelector(`[data-i="${i}"]`);
      if (!card) return;
      card.querySelector('.js-pill').innerHTML = statePill(t);
      const ms = card.querySelector('.js-ms');
      const fresh = t.ts && S.serverNow - t.ts < 10;
      ms.className = `t-ms js-ms ${fresh ? msClass(t.ms) : ''}`;
      ms.innerHTML = !fresh ? '—' : t.ms === null ? 'timeout' : `${fmtMs(t.ms)}<small>ms</small>`;
      const vals = windowValues(i, start);
      const s = statsOf(vals);
      card.querySelector('.js-stats').innerHTML =
        `<span>min <b>${fmtMs(s.min)}</b></span><span>avg <b>${fmtMs(s.avg)}</b></span><span>max <b>${fmtMs(s.max)}</b></span>`
        + `<span>loss <b class="${s.loss ? 'c-crit' : ''}">${s.loss === null ? '—' : s.loss.toFixed(s.loss && s.loss < 10 ? 1 : 0) + '%'}</b></span>`;
      card.querySelector('.js-stats').title = `สถิติ ${labelTh}`;
      sparkline(card.querySelector('.spark'), vals, targetColor(i));
    });
  };
}

/** ข้อมูลน้อยหรือเป็นจุดเดี่ยว ๆ (เส้นขาด) → แสดงจุดด้วย ไม่งั้นมองไม่เห็น */
function dotsIfSparse(data) {
  const n = data.filter((p) => p.y !== null).length;
  return n < 60 ? 2.5 : 0;
}

/** แปลงผล /api/history เป็น datasets: เส้น latency เฉลี่ย + พื้นที่ packet loss */
function historyDatasets(h, { loss = true, fill = false } = {}) {
  const sets = [];
  const lossByBucket = new Map();
  h.targets.forEach((id, i) => {
    const data = [];
    let prev = null;
    for (const [bk, avg, , ls] of h.series[id]) {
      if (prev !== null && bk - prev > h.bucket * 1.5) data.push({ x: (prev + h.bucket) * 1000, y: null });
      data.push({ x: bk * 1000, y: avg });
      lossByBucket.set(bk, Math.max(lossByBucket.get(bk) ?? 0, ls ?? 0));
      prev = bk;
    }
    const col = targetColor(i);
    sets.push({ label: targetName(id), data, borderColor: col, backgroundColor: fill ? areaFill(col) : col, fill: fill ? 'origin' : false, pointRadius: dotsIfSparse(data) });
  });
  if (!loss) return sets;
  const lossData = [];
  let prev = null;
  for (const bk of [...lossByBucket.keys()].sort((a, b) => a - b)) {
    if (prev !== null && bk - prev > h.bucket * 1.5) lossData.push({ x: (prev + h.bucket) * 1000, y: null });
    lossData.push({ x: bk * 1000, y: lossByBucket.get(bk) });
    prev = bk;
  }
  sets.push({
    label: 'Packet loss', yAxisID: 'y1', data: lossData, stepped: true, tension: 0,
    borderColor: 'rgba(240,82,110,.8)', backgroundColor: 'rgba(240,82,110,.18)', fill: 'origin', borderWidth: 1,
  });
  return sets;
}

function summaryTotals(h) {
  let n = 0, ok = 0, sumLat = 0, okLat = 0, max = null, outages = 0;
  for (const id of h.targets) {
    const s = h.summary[id];
    n += s.samples;
    const okN = s.samples * (1 - (s.loss_pct ?? 0) / 100);
    ok += okN;
    if (s.avg_ms !== null) { sumLat += s.avg_ms * okN; okLat += okN; }
    if (s.max_ms !== null && (max === null || s.max_ms > max)) max = s.max_ms;
    outages += s.outages;
  }
  return { n, health: n ? 100 * ok / n : null, avg: okLat ? sumLat / okLat : null, max, outages };
}

/** การ์ดหัวข้อพร้อมไอคอน */
/* นับตัวเลขขึ้น/ลงแบบนุ่มๆ (ไม่ใช้ requestAnimationFrame ตอนแท็บซ่อน/ลดการเคลื่อนไหว) */
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
function tweenNum(el, to, fmt, ms = 700) {
  if (!el) return;
  cancelAnimationFrame(el._raf);
  if (to === null || to === undefined) { el.textContent = '—'; el._v = null; return; }
  const from = el._v;
  el._v = to;
  if (REDUCED_MOTION || document.hidden || from === null || from === undefined || from === to) {
    if (from === undefined || from === null) {  // ครั้งแรก: นับจาก 0
      if (REDUCED_MOTION || document.hidden) { el.textContent = fmt(to); return; }
      return tweenFrom(el, 0, to, fmt, ms * 1.4);
    }
    el.textContent = fmt(to);
    return;
  }
  tweenFrom(el, from, to, fmt, ms);
}
function tweenFrom(el, from, to, fmt, ms) {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
  el.textContent = fmt(from);
  // กันค้าง: ถ้าเฟรมไม่วิ่ง (เช่นแท็บถูกพักไว้) ให้แสดงค่าจริงเมื่อครบเวลา
  clearTimeout(el._tmo);
  el._tmo = setTimeout(() => { if (el._v === to) { cancelAnimationFrame(el._raf); el.textContent = fmt(to); } }, ms + 150);
}

const cardTitle = (ic, html) => `<div class="card-title">${icon(ic, 'ct-ico')}<span>${html}</span></div>`;

/* ---------- pages ---------- */
const PAGES = {};

/* ---------- 01 Overview ---------- */
PAGES.overview = () => {
  let chart = null, range = 60, hist24 = null, timers = [], expanded = false;
  const KWIN = 600;        // เทียบ 10 นาทีล่าสุดกับ 10 นาทีก่อนหน้า
  const SPARK_STEP = 120;  // sparkline: ช่องละ 2 นาที ย้อนหลัง 1 ชม.

  const deltaHtml = (cur, prev, { unit = 'ms', pp = false, lowerIsBetter = true, digits = 1 } = {}) => {
    if (cur === null || prev === null || cur === undefined || prev === undefined) return '&nbsp;';
    const diff = cur - prev;
    if (Math.abs(diff) < (pp ? 0.005 : 0.05)) return '= ไม่เปลี่ยนแปลง';
    const arrow = diff < 0 ? '▼' : '▲';
    const cls = (diff < 0) === lowerIsBetter ? 'good' : 'bad';
    const sign = diff > 0 ? '+' : '';
    const txt = pp ? `${sign}${diff.toFixed(2)}%` : `${sign}${diff.toFixed(digits)} ${unit}` + (prev ? ` (${sign}${(diff / prev * 100).toFixed(1)}%)` : '');
    return `<span class="${cls}">${arrow} ${txt}</span>`;
  };

  const kpiCard = (key, ic, label) => `
    <div class="card kcard" id="k-${key}">
      <div class="kcard-top">
        <div class="kico">${icon(ic)}</div>
        <div style="min-width:0"><div class="klabel">${label}</div><div class="kval js-v">—</div><div class="kdelta js-d">&nbsp;</div></div>
      </div>
      <canvas class="kspark"></canvas>
    </div>`;
  const setKpi = (key, valHtml, deltaH, spark, sparkOpts = {}, cls = '') => {
    const card = $(`#k-${key}`);
    if (!card) return;
    const v = card.querySelector('.js-v');
    const changed = v.innerHTML !== valHtml && v.textContent !== '—';
    v.innerHTML = valHtml;
    v.className = `kval js-v ${cls}`;
    if (changed) { void v.offsetWidth; v.classList.add('tick'); }
    const d = card.querySelector('.js-d');
    d.innerHTML = deltaH;
    d.className = `kdelta js-d ${deltaH.includes('class="good"') ? 'good' : deltaH.includes('class="bad"') ? 'bad' : ''}`;
    miniSpark(card.querySelector('.kspark'), spark, C.primary, sparkOpts);
  };

  function renderKpis() {
    const end = S.serverNow;
    const [prev, cur] = bucketStats(end - 2 * KWIN, KWIN, 2);
    const sp = bucketStats(end - 3600, SPARK_STEP, 3600 / SPARK_STEP);
    setKpi('lat', cur.avg === null ? '—' : `${fmtMs(cur.avg)}<small>ms</small>`, deltaHtml(cur.avg, prev.avg),
      sp.map((c) => c.avg), {}, cur.avg !== null && cur.avg > thr() ? 'warn' : '');
    setKpi('jit', cur.jitter === null ? '—' : `${cur.jitter.toFixed(1)}<small>ms</small>`, deltaHtml(cur.jitter, prev.jitter),
      sp.map((c) => c.jitter), { minSpan: 0.5 });
    const lossTxt = cur.loss === null ? '—' : `${cur.loss.toFixed(2)}<small>%</small>`;
    const lossDelta = cur.loss === null ? '&nbsp;' : cur.loss === 0 && (prev.loss ?? 0) === 0 ? '= ไม่มีการสูญหาย'
      : deltaHtml(cur.loss, prev.loss ?? 0, { pp: true });
    setKpi('loss', lossTxt, lossDelta, sp.map((c) => c.loss), { minSpan: 2, floor: 0 }, cur.loss > 0 ? 'crit' : '');
    const gi = gwIdx();
    const gt = S.status?.targets?.[gi];
    const gms = freshMs(gt);
    let fastest = gt, fms = gms;
    if (gi < 0) {  // ไม่มี gateway: ใช้ตัวที่เร็วสุด
      (S.status?.targets ?? []).forEach((t) => { const m = freshMs(t); if (m !== undefined && m !== null && (fms === undefined || fms === null || m < fms)) { fastest = t; fms = m; } });
    }
    setKpi('resp', fms === undefined ? '—' : fms === null ? 'timeout' : `${fmtMs(fms)}<small>ms</small>`,
      `<span style="color:#C9D5E6">${esc(gi >= 0 ? 'Default Gateway' : fastest?.name ?? '')}</span>`,
      sp.map((c) => c.gw), {}, fms === null ? 'crit' : '');
    renderUptime();
  }

  function renderUptime() {
    const o = S.overview;
    if (!o) return;
    setKpi('up', o.uptime_24h === null ? '—' : `${o.uptime_24h.toFixed(2)}<small>%</small>`,
      deltaHtml(o.uptime_24h, o.uptime_prev_24h, { pp: true, lowerIsBetter: false }),
      // เริ่มจากชั่วโมงแรกที่มีข้อมูล ไม่งั้นช่วงที่ยังไม่ได้เปิดโปรแกรมจะเป็นที่ว่าง
      (() => { const v = o.uptime_series.map((p) => p[1]); const f = v.findIndex((x) => x !== null); return f < 0 ? [] : v.slice(Math.min(f, v.length - 2)); })(),
      { minSpan: 0.5 }, o.uptime_24h !== null && o.uptime_24h < 99 ? 'warn' : '');
    const h = o.health_24h;
    tweenNum($('#ov-health'), h, (x) => `${x.toFixed(2)}%`);
    $('#ov-health-bar').style.width = `${h ?? 0}%`;
    $('#ov-health-bar').style.background = h === null || h >= 99 ? '' : h >= 95 ? C.warn : C.crit;
    $('#ov-health-wrap').title = `สัดส่วนรอบที่ทุกเป้าหมายตอบและ latency ไม่เกิน ${thr()} ms\nนับเฉพาะเวลาที่โปรแกรมทำงาน (${fmtDur(o.monitored_sec_24h)} ใน 24 ชม.)`;
  }

  function renderHero() {
    const st = overallState();
    const map = {
      online: ['', 'check', 'เครือข่ายทำงานปกติ', 'การเชื่อมต่อมีความเสถียร และอยู่ในเกณฑ์ที่ดี'],
      degraded: ['warn', 'alert', 'เครือข่ายไม่เสถียร', S.status?.overall?.detail],
      offline: ['crit', 'alert', 'อินเทอร์เน็ตหลุด', S.status?.overall?.detail],
      unknown: ['unknown', 'clock', 'กำลังเริ่มวัด…', S.status?.overall?.detail],
    };
    let [cls, ic, title, detail] = map[st] || map.unknown;
    if (!S.connected) { cls = 'crit'; ic = 'alert'; title = 'ติดต่อโปรแกรมไม่ได้'; detail = 'ตรวจว่า Network Pulse ยังทำงานอยู่'; }
    $('#ov-ico').className = `hero-ico ${cls}`;
    // วาดไอคอนใหม่เฉพาะตอนสถานะเปลี่ยน ไอคอนจะได้เด้งครั้งเดียว ไม่เด้งทุกรอบ poll
    if ($('#ov-ico').dataset.ic !== ic) { $('#ov-ico').dataset.ic = ic; $('#ov-ico').innerHTML = icon(ic); }
    $('#ov-status').textContent = title;
    $('#ov-status').className = `hero-big ${cls}`;
    $('#ov-detail').textContent = detail || '';
  }

  function renderChart() {
    if (!chart) return;
    const end = S.serverNow;
    if (range === 86400) {
      if (!hist24) return;
      chart.data.datasets = historyDatasets(hist24, { loss: false, fill: true });
      chart.options.scales.x.min = (end - 86400) * 1000;
    } else {
      chart.data.datasets = liveDatasets(end - range, { fill: true });
      chart.options.scales.x.min = (end - range) * 1000;
    }
    chart.options.scales.x.max = end * 1000;
    chart.options.scales.x.time.tooltipFormat = range >= 3600 ? 'd MMM HH:mm' : 'HH:mm:ss';
    chart.update('none');
  }
  async function load24() {
    try {
      const end = nowSec();
      hist24 = await getJSON(`/api/history?start=${end - 86400}&end=${end}`);
      if (range === 86400) renderChart();
    } catch (_) { }
  }

  function renderLegend() {
    $('#ov-legend').innerHTML = (S.status?.targets ?? []).map((t, i) =>
      `<span><i style="background:${targetColor(i)};box-shadow:0 0 6px ${targetColor(i)}"></i>${esc(t.name)} (${esc(t.host)})</span>`).join('');
  }

  function renderGauge() {
    const ts = S.status?.targets ?? [];
    const ext = extIdx().map((i) => freshMs(ts[i])).filter((v) => v !== undefined && v !== null);
    const avg = ext.length ? ext.reduce((a, b) => a + b, 0) / ext.length : null;
    tweenNum($('#g-val'), avg, fmtMs);
    // วงเต็ม = เร็ว; หดลงเมื่อเข้าใกล้เกณฑ์เตือน
    const frac = avg === null ? 0 : Math.max(0.06, Math.min(1, 1 - avg / thr()));
    const circ = 2 * Math.PI * 64;
    const arc = $('#g-arc');
    arc.style.strokeDasharray = `${frac * circ} ${circ}`;  // ผ่าน style เพื่อให้ CSS transition ทำงาน
    arc.setAttribute('stroke', avg !== null && avg > thr() ? C.warn : 'url(#g-grad)');
    $('#g-list').innerHTML = ts.map((t, i) => {
      const m = freshMs(t);
      const cls = m === null ? 'crit' : m !== undefined && m > thr() ? 'warn' : '';
      return `<div class="g-item"><div class="g-name"><i style="background:${targetColor(i)}"></i>${esc(t.name)}</div>
        <div class="g-ms ${cls}">${m === undefined ? '—' : m === null ? 'timeout' : fmtMs(m) + ' ms'}</div></div>`;
    }).join('');
  }

  function renderEvents() {
    const list = S.recentEvents.slice(0, 5);
    $('#ov-events').innerHTML = list.length ? list.map((e) => eventItem(e)).join('') : '<div class="empty">ยังไม่มีเหตุการณ์ — ทุกอย่างปกติ</div>';
  }

  const wifiSub = () => {
    const w = S.diag?.wifi;
    if (!w) return '';
    return w.connected ? `Wi-Fi ${w.signal ?? '—'}% · ${w.band || ''}` : 'Wi-Fi หลุด';
  };
  const wifiWeak = () => { const w = S.diag?.wifi; return !!w && (!w.connected || (w.signal ?? 100) < 35); };

  function renderPath() {
    const ts = S.status?.targets ?? [];
    const gi = gwIdx();
    const gw = ts[gi];
    const ext = extIdx().map((i) => ts[i]);
    const extUp = ext.filter((t) => t.state === 'up');
    const best = extUp.map(freshMs).filter((v) => v !== undefined && v !== null);
    const internet = !S.connected || !ext.length ? 'unknown' : ext.every((t) => t.state === 'down') ? 'down'
      : ext.some((t) => tState(t) !== 'ok') ? 'warn' : ext.every((t) => t.state === 'unknown') ? 'unknown' : 'ok';
    const first = ext[0];
    const msTxt = (t) => { const m = freshMs(t); return m === undefined ? '—' : m === null ? 'ไม่ตอบ' : `${fmtMs(m)} ms`; };
    const beat = S.status?.last_beat;
    const alive = S.connected && beat && S.serverNow - beat <= 3 * (S.cfg?.interval_sec ?? 2) + 3;
    const nodes = [
      { ic: 'monitor', name: 'Local PC', sub: wifiSub() || S.overview?.local_ip || S.overview?.hostname || 'เครื่องนี้', val: alive ? 'Online' : 'ไม่ทำงาน', st: alive ? (wifiWeak() ? 'warn' : 'ok') : 'down' },
      { ic: 'router', name: 'Gateway', sub: gw?.host ?? 'ไม่ได้วัด', val: gw ? msTxt(gw) : '—', st: gw ? tState(gw) : 'unknown' },
      { ic: 'globe', name: 'Internet', sub: 'ISP / Public', val: best.length ? `${fmtMs(Math.min(...best))} ms` : internet === 'down' ? 'หลุด' : '—', st: internet },
      { ic: 'cloud', name: 'Target', sub: first?.host ?? '—', val: first ? msTxt(first) : '—', st: first ? tState(first) : 'unknown' },
    ];
    const cls = (s) => (s === 'down' ? 'down' : s === 'warn' ? 'warn' : '');
    $('#ov-path').innerHTML = nodes.map((n) => `
      <div class="path-node ${cls(n.st)}">
        <div class="pn-ico">${icon(n.ic)}</div>
        <div class="pn-name">${n.name}</div><div class="pn-sub" title="${esc(n.sub)}">${esc(n.sub)}</div>
        <div class="pn-val">${esc(n.val)}</div>
      </div>`).join('')
      + nodes.slice(1).map((n, k) => `<span class="path-link ${cls(n.st)}" style="left:${25 * (k + 1)}%"></span>`).join('');
    const st = overallState();
    const tag = $('#ov-path-tag');
    const tmap = { online: ['ok', 'Healthy'], degraded: ['warn', 'Degraded'], offline: ['crit', 'Offline'], unknown: ['unknown', 'Unknown'] };
    const [tc, tt] = tmap[S.connected ? st : 'unknown'];
    tag.className = `health-tag ${tc}`;
    tag.innerHTML = `<span class="dot"></span>${tt}`;
  }

  function renderTraffic() {
    const t = S.traffic;
    const series = t?.series ?? [];
    const last = series[series.length - 1];
    const fresh = last && S.serverNow - last[0] < 10;
    const [dv, du] = fmtRate(fresh ? last[1] : null);
    const [uv, uu] = fmtRate(fresh ? last[2] : null);
    $('#tr-down').innerHTML = `${dv}<small>${du}</small>`;
    $('#tr-up').innerHTML = `${uv}<small>${uu}</small>`;
    miniSpark($('#tr-down-spark'), series.map((p) => p[1]), C.primary, { minSpan: 1e5, floor: 0 });
    miniSpark($('#tr-up-spark'), series.map((p) => p[2]), C.violet, { minSpan: 1e5, floor: 0 });
    const [lv, lu] = fmtRate(t?.speed_bps);
    $('#tr-foot').textContent = !t ? 'ไม่มีข้อมูล' : !t.available ? 'ใช้ได้บน Windows เท่านั้น'
      : t.interface ? `${t.interface}${t.speed_bps ? ` · ลิงก์ ${lv} ${lu}` : ''}` : 'กำลังหาการ์ดเครือข่าย…';
    $('#tr-foot').title = $('#tr-foot').textContent + '\nปริมาณรวมของทั้งเครื่อง (ทุกโปรแกรม) ผ่านการ์ดที่ใช้ออกอินเทอร์เน็ต';
  }

  function setExpanded(on) {
    expanded = on;
    const card = $('#lm-card');
    card.classList.toggle('expanded', on);
    $('#lm-expand').innerHTML = icon(on ? 'shrink' : 'expand');
    $('#lm-expand').setAttribute('aria-label', on ? 'ย่อกราฟ' : 'ขยายกราฟ');
    let bd = $('#lm-backdrop');
    if (on && !bd) {
      bd = document.createElement('div');
      bd.id = 'lm-backdrop'; bd.className = 'backdrop';
      bd.addEventListener('click', () => setExpanded(false));
      document.body.appendChild(bd);
    } else if (!on && bd) bd.remove();
    chart?.resize();
  }
  const onKey = (e) => { if (e.key === 'Escape' && expanded) setExpanded(false); };

  return {
    mount(el) {
      el.innerHTML = `<div class="ov">
        <div class="card hero">
          <div class="hero-globe"></div>
          <div class="hero-status">
            <div class="hero-ico" id="ov-ico">${icon('check')}</div>
            <div><div class="hero-big" id="ov-status">—</div><div class="hero-detail" id="ov-detail">กำลังโหลด…</div></div>
          </div>
          <div class="hero-div"></div>
          <div class="health" id="ov-health-wrap">
            <div class="health-top">
              <div><div class="health-label">Network Health (24 ชม.)</div><div class="health-val" id="ov-health">—</div></div>
              <svg class="health-ico" viewBox="0 0 52 36" aria-hidden="true"><path pathLength="100" d="M2 20h12l5-12 7 22 6-16 4 6h14"/></svg>
            </div>
            <div class="health-bar"><div id="ov-health-bar" style="width:0"></div></div>
          </div>
        </div>
        <div class="grid kpi5">
          ${kpiCard('lat', 'timer', 'Latency เฉลี่ย')}
          ${kpiCard('jit', 'jitter', 'Jitter')}
          ${kpiCard('loss', 'loss', 'Packet Loss')}
          ${kpiCard('up', 'clock', 'Uptime (24 ชม.)')}
          ${kpiCard('resp', 'bolt', 'Response (เร็วสุด)')}
        </div>
        <div class="grid row-mid">
          <div class="card" id="lm-card">
            <div class="card-head">
              <div>${cardTitle('trend', 'Latency Monitor (Real-time)')}<div class="card-sub" style="margin:2px 0 0 34px">เปรียบเทียบความหน่วงของแต่ละปลายทาง</div></div>
              <div class="head-tools">
                <div class="seg-pill" id="lm-range">
                  <button data-r="60" class="active">1m</button><button data-r="300">5m</button><button data-r="900">15m</button><button data-r="3600">1h</button><button data-r="86400">24h</button>
                </div>
                <button class="sq-btn" id="lm-expand" type="button" aria-label="ขยายกราฟ">${icon('expand')}</button>
              </div>
            </div>
            <div class="lm-chart"><canvas id="ov-chart"></canvas></div>
            <div class="legend-row" id="ov-legend"></div>
          </div>
          <div class="card">
            <div class="card-head">${cardTitle('trend', 'Latency ปัจจุบัน')}</div>
            <div class="gauge-wrap">
              <div class="gauge" title="วงเต็ม = เร็ว · วงสั้นลงเมื่อ latency เข้าใกล้เกณฑ์เตือน">
                <svg viewBox="0 0 150 150" aria-hidden="true">
                  <defs><linearGradient id="g-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#39D6A0"/><stop offset=".45" stop-color="#41D8EF"/><stop offset="1" stop-color="#A78BFA"/></linearGradient></defs>
                  <circle cx="75" cy="75" r="64" fill="none" stroke="rgba(28,46,74,.9)" stroke-width="10"/>
                  <circle id="g-arc" cx="75" cy="75" r="64" fill="none" stroke="url(#g-grad)" stroke-width="10" stroke-linecap="round" stroke-dasharray="0 999" style="filter:drop-shadow(0 0 6px rgba(65,216,239,.6))"/>
                </svg>
                <div class="gauge-in"><div class="gauge-val" id="g-val">—</div><div class="gauge-unit">ms</div><div class="gauge-sub">Average</div></div>
              </div>
              <div class="g-list" id="g-list"></div>
            </div>
          </div>
          <div class="card">
            <div class="card-head">${cardTitle('list', 'เหตุการณ์ล่าสุด')}<a href="#/events" class="card-sub">ดูทั้งหมด →</a></div>
            <ul class="ev-list one-line" id="ov-events"><div class="empty">กำลังโหลด…</div></ul>
          </div>
        </div>
        <div class="grid row-bot">
          <div class="card">
            <div class="card-head">
              <div>${cardTitle('route', 'Connection Path')}<div class="card-sub" style="margin:2px 0 0 34px">เส้นทางการเชื่อมต่อจากเครื่องของคุณสู่อินเทอร์เน็ต</div></div>
              <span class="health-tag unknown" id="ov-path-tag"></span>
            </div>
            <div class="path" id="ov-path"></div>
          </div>
          <div class="card">
            <div class="card-head">${cardTitle('nodes', 'Network Tools <span class="light">(Quick Access)</span>')}</div>
            <div class="qtools">
              <a class="qtool" href="#/tools/ping">${icon('prompt')}Ping</a>
              <a class="qtool" href="#/tools/trace">${icon('topology')}Traceroute</a>
              <a class="qtool" href="#/tools/dns">${icon('globe')}DNS Lookup</a>
              <a class="qtool" href="#/tools/info">${icon('info')}IP Info</a>
            </div>
          </div>
          <div class="card">
            <div class="card-head">${cardTitle('traffic', 'การใช้งานเครือข่าย <span class="light">(Realtime)</span>')}</div>
            <div class="traffic-row">
              <div><div class="tr-label">Download</div><div class="tr-val"><span class="tr-arrow">${icon('down').replace('stroke="currentColor"', `stroke="${C.primary}"`)}</span><span class="tr-num" id="tr-down">—</span></div></div>
              <canvas class="tr-spark" id="tr-down-spark"></canvas>
            </div>
            <div class="traffic-row">
              <div><div class="tr-label">Upload</div><div class="tr-val"><span class="tr-arrow">${icon('up').replace('stroke="currentColor"', `stroke="${C.violet}"`)}</span><span class="tr-num" id="tr-up">—</span></div></div>
              <canvas class="tr-spark" id="tr-up-spark"></canvas>
            </div>
            <div class="tr-foot" id="tr-foot"></div>
          </div>
        </div>
      </div>`;
      $('#lm-range').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        range = +b.dataset.r;
        [...$('#lm-range').children].forEach((x) => x.classList.toggle('active', x === b));
        if (range === 86400 && !hist24) load24();
        renderChart();
      });
      $('#lm-expand').addEventListener('click', () => setExpanded(!expanded));
      document.addEventListener('keydown', onKey);
      chart = makeChart($('#ov-chart'), { legend: false });
      if (chart) chart.options.scales.y.ticks.maxTicksLimit = 6;
      timers.push(setInterval(loadOverview, 60000), setInterval(() => { if (range === 86400) load24(); }, 60000));
      loadOverview();
      this.update();
      this.onRecent();
    },
    update() {
      renderHero();
      renderKpis();
      renderChart();
      renderLegend();
      renderGauge();
      renderPath();
      renderTraffic();
    },
    onOverview() { renderUptime(); renderPath(); },
    onRecent() { renderEvents(); },
    unmount() {
      timers.forEach(clearInterval);
      document.removeEventListener('keydown', onKey);
      if (expanded) setExpanded(false);
      chart?.destroy();
    },
  };
};

PAGES.live = () => {
  let chart = null, updCards = null, win = 300;
  const diag = diagPanel();
  return {
    mount(el) {
      el.innerHTML = `
        <div class="grid targets" id="lv-targets"></div>
        <div class="card mt">
          <div class="card-head">
            <div><div class="card-title">Live Latency</div><div class="card-sub">อัปเดตทุก ${S.cfg?.interval_sec ?? 2} วินาที · ✕ = ping ไม่ตอบ · เส้นประ = เกณฑ์เตือน</div></div>
            <div class="seg" id="lv-win">
              <button data-w="300" class="active">5 นาที</button><button data-w="900">15 นาที</button><button data-w="3600">1 ชม.</button>
            </div>
          </div>
          <div class="chart-box tall"><canvas id="lv-chart"></canvas></div>
        </div>
        ${diag.html}
        <div class="card mt">
          <div class="card-head"><div class="card-title">Ping log</div><div class="card-sub">15 รอบล่าสุด</div></div>
          <div class="tbl-wrap"><table class="tbl" id="lv-log"></table></div>
        </div>`;
      $('#lv-win').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        win = +b.dataset.w;
        [...$('#lv-win').children].forEach((x) => x.classList.toggle('active', x === b));
        updCards = targetCards($('#lv-targets'), win, `ช่วง ${b.textContent}`);
        this.update();
      });
      updCards = targetCards($('#lv-targets'), win, 'ช่วง 5 นาที');
      chart = makeChart($('#lv-chart'), { tooltipFmt: 'HH:mm:ss' });
      diag.mount();
      this.update();
    },
    update() {
      diag.update();
      if (!$('#lv-targets').children.length && S.status) updCards = targetCards($('#lv-targets'), win, 'ช่วงที่เลือก');
      updCards?.();
      const end = S.serverNow;
      if (chart) {
        chart.data.datasets = liveDatasets(end - win);
        chart.options.scales.x.min = (end - win) * 1000;
        chart.options.scales.x.max = end * 1000;
        chart.update('none');
      }
      const rows = S.rounds.slice(-15).reverse();
      $('#lv-log').innerHTML = `<thead><tr><th>เวลา</th>${S.ids.map((id, i) => `<th class="num"><span class="swatch" style="background:${targetColor(i)}"></span>${esc(targetName(id))}</th>`).join('')}</tr></thead>
        <tbody>${rows.length ? rows.map((r) => `<tr><td class="mono">${fmtClock(r[0])}</td>${S.ids.map((_, i) => {
          const v = r[1 + i];
          if (v === 'x') return '<td class="num c-muted">—</td>';
          if (v === null) return '<td class="num c-crit">timeout</td>';
          return `<td class="num ${v > thr() ? 'c-warn' : ''}">${fmtMs(v)} ms</td>`;
        }).join('')}</tr>`).join('') : `<tr><td colspan="${S.ids.length + 1}" class="empty">ยังไม่มีข้อมูล</td></tr>`}</tbody>`;
    },
    unmount() { chart?.destroy(); diag.unmount(); },
  };
};

/* ---------- Wi-Fi + DNS (อยู่ในหน้า Live Monitor) ---------- */
const sigClass = (v) => (v === null || v === undefined ? '' : v >= 60 ? 'c-ok' : v >= 35 ? 'c-warn' : 'c-crit');
const sigLabel = (v) => (v === null || v === undefined ? '' : v >= 80 ? 'ดีมาก' : v >= 60 ? 'ดี' : v >= 35 ? 'พอใช้' : 'อ่อน');
const DNS_COLORS = { system: [C.primary, '#7DD3FC'], public: [C.violet, '#F9A8D4'] };
const dnsLabel = (v) => (v.kind === 'system' ? v.name : `${v.name} DNS`);

function diagPanel() {
  let range = 3600, wChart = null, dChart = null, timer = 0, data = null;

  const html = `
    <div class="grid two-col-eq mt">
      <div class="card">
        <div class="card-head">
          <div>${cardTitle('wifi', 'Wi-Fi')}<div class="card-sub" id="wf-sub" style="margin:2px 0 0 34px">กำลังโหลด…</div></div>
          <div class="seg" id="dg-range"><button data-r="3600" class="active">1 ชม.</button><button data-r="21600">6 ชม.</button><button data-r="86400">24 ชม.</button></div>
        </div>
        <div class="wf-now" id="wf-now"></div>
        <div class="chart-box short"><canvas id="wf-chart"></canvas><div class="chart-msg" id="wf-empty" hidden></div></div>
      </div>
      <div class="card">
        <div class="card-head">
          <div>${cardTitle('globe', 'DNS')}<div class="card-sub" style="margin:2px 0 0 34px">เวลาที่ใช้แปลงชื่อเว็บเป็น IP — ถ้าช้า เว็บจะเปิดช้าแม้ ping ปกติ</div></div>
        </div>
        <div class="dns-now" id="dns-now"></div>
        <div class="chart-box short"><canvas id="dns-chart"></canvas><div class="chart-msg" id="dns-empty" hidden></div></div>
      </div>
    </div>`;

  function renderNow() {
    const d = S.diag;
    if (!$('#wf-sub')) return;
    if (!d) { $('#wf-sub').textContent = 'ไม่มีข้อมูล'; return; }
    const w = d.wifi;
    if (d.wifi_available === false) {
      $('#wf-sub').textContent = 'เครื่องนี้ไม่ได้ใช้ Wi-Fi (ต่อสาย LAN) หรือไม่มีการ์ด Wi-Fi';
      $('#wf-now').innerHTML = '';
    } else if (w) {
      $('#wf-sub').innerHTML = w.connected
        ? `<b>${esc(w.ssid || '—')}</b> · ${esc(w.band || '')} ช่อง ${w.channel ?? '—'} · ${esc(w.radio || '')}`
        : '<span class="c-crit">ไม่ได้เชื่อมต่อ Wi-Fi</span>';
      const lvl = Math.max(0, Math.min(4, Math.ceil((w.signal ?? 0) / 25)));
      $('#wf-now').innerHTML = w.connected ? `
        <div class="wf-sig"><div class="wf-bars s${lvl} ${sigClass(w.signal)}"><i></i><i></i><i></i><i></i></div>
          <div><div class="sp-val ${sigClass(w.signal)}">${w.signal ?? '—'}<small>%</small></div>
          <div class="kdelta">${sigLabel(w.signal)}${w.rssi !== null && w.rssi !== undefined ? ` · ${w.rssi} dBm` : ''}</div></div></div>
        <div class="wf-kv"><span>ความเร็วลิงก์ รับ / ส่ง</span><b>${w.rx_mbps ?? '—'} / ${w.tx_mbps ?? '—'} Mbps</b></div>
        <div class="wf-kv"><span>ย่าน · ช่อง</span><b>${esc(w.band || '—')} · ${w.channel ?? '—'}</b></div>` : '';
    }
    const servers = Object.entries(d.dns || {});
    const blocked = servers.some(([, v]) => v.kind === 'public' && v.ms === null) && servers.some(([, v]) => v.kind === 'system' && v.ms !== null);
    $('#dns-now').innerHTML = servers.length ? servers.map(([ip, v]) => `
      <div class="dns-item"><div class="g-name"><i style="background:${DNS_COLORS[v.kind][0]}"></i>${esc(dnsLabel(v))}</div>
        <div class="mono c-muted dns-ip">${esc(ip)}</div>
        <div class="g-ms ${v.ms === null ? 'crit' : v.ms > 100 ? 'warn' : ''}">${v.ms === null ? 'ไม่ตอบ' : fmtMs(v.ms) + ' ms'}</div></div>`).join('')
      + (blocked ? '<div class="card-sub dns-note">DNS สาธารณะไม่ตอบ แต่ DNS ของเครื่องตอบ — เครือข่ายนี้อาจบล็อกการใช้ DNS ภายนอก (พบบ่อยในที่ทำงาน/มหาวิทยาลัย)</div>' : '')
      : '<div class="empty">รอผลรอบแรก (วัดทุก 30 วินาที)</div>';
  }

  function renderCharts() {
    if (!data) return;
    const xr = { min: data.start * 1000, max: data.now * 1000 };
    if (wChart) {
      const pts = data.wifi;
      wChart.data.datasets = [
        { label: 'สัญญาณ (%)', data: pts.map((p) => ({ x: p[0] * 1000, y: p[1] })), borderColor: C.ok, backgroundColor: areaFill(C.ok), fill: true, tension: .3, pointRadius: 0, borderWidth: 2 },
        { label: 'Wi-Fi หลุด', data: pts.filter((p) => p[3] > 0).map((p) => ({ x: p[0] * 1000, y: 3 })), borderColor: C.crit, backgroundColor: C.crit, showLine: false, pointStyle: 'crossRot', pointRadius: 6, isFail: true },
      ];
      Object.assign(wChart.options.scales.x, xr);
      wChart.options.scales.y.max = 100;
      wChart.update('none');
      $('#wf-empty').hidden = pts.length > 0;
      $('#wf-empty').textContent = S.diag?.wifi_available === false ? 'ไม่ได้ใช้ Wi-Fi' : 'ยังไม่มีข้อมูล';
    }
    if (dChart) {
      const used = { system: 0, public: 0 };
      dChart.data.datasets = Object.entries(data.dns).map(([ip, v]) => {
        const info = data.snapshot?.dns?.[ip] ?? S.diag?.dns?.[ip] ?? { name: ip, kind: v.kind };
        const color = DNS_COLORS[v.kind][used[v.kind]++ % 2];
        return { label: info.name === ip ? ip : `${dnsLabel(info)} (${ip})`, data: v.points.map((p) => ({ x: p[0] * 1000, y: p[1] })), borderColor: color, backgroundColor: color, tension: .3, pointRadius: 0, borderWidth: 2 };
      });
      Object.assign(dChart.options.scales.x, xr);
      dChart.update('none');
      $('#dns-empty').hidden = Object.keys(data.dns).length > 0;
      $('#dns-empty').textContent = 'ยังไม่มีข้อมูล';
    }
  }

  async function load() {
    clearTimeout(timer);
    try { data = await getJSON(`/api/diag?range=${range}`); } catch (_) { data = null; }
    if (!$('#wf-chart')) return;
    renderCharts();
    timer = setTimeout(load, 30000);
  }

  return {
    html,
    mount() {
      const unit = () => (range > 6 * 3600 ? 'hour' : 'minute');
      wChart = makeLineChart($('#wf-chart'), { yTitle: '%', tooltipFmt: 'HH:mm', unit: unit() });
      dChart = makeLineChart($('#dns-chart'), { yTitle: 'ms', tooltipFmt: 'HH:mm', unit: unit() });
      if (wChart) wChart.options.plugins.legend.display = false;
      $('#dg-range').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        range = +b.dataset.r;
        [...$('#dg-range').children].forEach((x) => x.classList.toggle('active', x === b));
        [wChart, dChart].forEach((c) => { if (c) c.options.scales.x.time.unit = unit(); });
        load();
      });
      renderNow();
      load();
    },
    update: renderNow,
    unmount() { clearTimeout(timer); wChart?.destroy(); dChart?.destroy(); },
  };
}


PAGES.history = () => {
  let chart = null, range = '24h', reqId = 0;
  const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const span = () => {
    const now = nowSec();
    if (range === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return [d.getTime() / 1000, now]; }
    if (range === '24h') return [now - 86400, now];
    if (range === '7d') return [now - 7 * 86400, now];
    if (range === '30d') return [now - 30 * 86400, now];
    const from = $('#hs-from').value, to = $('#hs-to').value;
    if (!from || !to) return null;
    const a = new Date(from + 'T00:00:00').getTime() / 1000;
    const b = new Date(to + 'T00:00:00').getTime() / 1000 + 86400;
    return b > a ? [a, Math.min(b, now)] : null;
  };
  const load = async () => {
    const sp = span();
    if (!sp) return;
    const [start, end] = sp.map(Math.floor);
    const my = ++reqId;
    $('#hs-note').textContent = 'กำลังโหลด…';
    try {
      const [h, ev] = await Promise.all([
        getJSON(`/api/history?start=${start}&end=${end}`),
        getJSON(`/api/events?limit=100&start=${start}&end=${end}`),
      ]);
      if (my !== reqId) return;
      if (chart) {
        chart.data.datasets = historyDatasets(h);
        chart.options.scales.x.min = start * 1000;
        chart.options.scales.x.max = end * 1000;
        chart.update('none');
      }
      const bucketTxt = h.bucket >= 3600 ? `${h.bucket / 3600} ชม.` : h.bucket >= 60 ? `${h.bucket / 60} นาที` : `${h.bucket} วินาที`;
      const t = summaryTotals(h);
      $('#hs-note').textContent = `ค่าเฉลี่ยทุก ${bucketTxt} · บันทึกได้ ${fmtDur(h.monitored_sec)} จาก ${fmtDur(end - start)} · ช่องว่างในกราฟ = คอมปิด/โปรแกรมไม่ทำงาน`;
      $('#hs-kpis').innerHTML = [
        ['สำเร็จ', t.health === null ? '—' : t.health.toFixed(2), '%'],
        ['Latency เฉลี่ย', fmtMs(t.avg), 'ms'],
        ['Latency สูงสุด', fmtMs(t.max), 'ms'],
        ['หลุด (ครั้ง)', String(t.outages), ''],
      ].map(([l, v, u]) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val">${v}<small>${u}</small></div></div>`).join('');
      $('#hs-table').innerHTML = `<thead><tr><th>เป้าหมาย</th><th class="num">จำนวนครั้งที่วัด</th><th class="num">เฉลี่ย</th><th class="num">สูงสุด</th><th class="num">Packet loss</th><th class="num">หลุด</th></tr></thead>
        <tbody>${h.targets.map((id, i) => {
          const s = h.summary[id];
          return `<tr><td><span class="swatch" style="background:${targetColor(i)}"></span>${esc(targetName(id))}</td>
            <td class="num">${s.samples.toLocaleString()}</td><td class="num">${fmtMs(s.avg_ms)} ms</td>
            <td class="num">${fmtMs(s.max_ms)} ms</td>
            <td class="num ${s.loss_pct ? 'c-crit' : ''}">${s.loss_pct === null ? '—' : s.loss_pct.toFixed(2) + '%'}</td>
            <td class="num ${s.outages ? 'c-crit' : ''}">${s.outages}</td></tr>`;
        }).join('')}</tbody>`;
      $('#hs-events').innerHTML = ev.events.length ? ev.events.map((e) => eventItem(e)).join('') : '<div class="empty">ไม่มีเหตุการณ์ในช่วงนี้</div>';
    } catch (e) {
      $('#hs-note').textContent = 'โหลดข้อมูลไม่สำเร็จ';
    }
  };
  return {
    mount(el) {
      const today = new Date();
      const weekAgo = new Date(Date.now() - 6 * 86400000);
      el.innerHTML = `
        <div class="card">
          <div class="controls">
            <div class="seg" id="hs-range">
              <button data-r="today">วันนี้</button><button data-r="24h" class="active">24 ชม.</button><button data-r="7d">7 วัน</button><button data-r="30d">30 วัน</button><button data-r="custom">กำหนดเอง</button>
            </div>
            <span class="muted">จาก</span><input type="date" class="date-in" id="hs-from" value="${toDateInput(weekAgo)}">
            <span class="muted">ถึง</span><input type="date" class="date-in" id="hs-to" value="${toDateInput(today)}" max="${toDateInput(today)}">
          </div>
          <div class="card-sub" id="hs-note" style="margin-top:10px">&nbsp;</div>
        </div>
        <div class="grid kpis mt" id="hs-kpis"></div>
        <div class="card mt">
          <div class="card-head"><div><div class="card-title">Latency ย้อนหลัง</div><div class="card-sub">เส้น = ค่าเฉลี่ย latency · พื้นที่สีแดง = packet loss (แกนขวา) · ข้อมูลเก่ากว่า ${S.cfg?.raw_retention_days ?? 7} วันเป็นค่าเฉลี่ยรายชั่วโมง</div></div></div>
          <div class="chart-box tall"><canvas id="hs-chart"></canvas></div>
        </div>
        <div class="grid two-col mt">
          <div class="card"><div class="card-head"><div class="card-title">สรุปตามเป้าหมาย</div></div><div class="tbl-wrap"><table class="tbl" id="hs-table"></table></div></div>
          <div class="card"><div class="card-head"><div class="card-title">เหตุการณ์ในช่วงนี้</div></div><ul class="ev-list" id="hs-events"></ul></div>
        </div>`;
      $('#hs-range').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        range = b.dataset.r;
        [...$('#hs-range').children].forEach((x) => x.classList.toggle('active', x === b));
        load();
      });
      const custom = () => {
        range = 'custom';
        [...$('#hs-range').children].forEach((x) => x.classList.toggle('active', x.dataset.r === 'custom'));
        load();
      };
      $('#hs-from').addEventListener('change', custom);
      $('#hs-to').addEventListener('change', custom);
      chart = makeChart($('#hs-chart'), { lossAxis: true, tooltipFmt: 'd MMM HH:mm' });
      load();
    },
    unmount() { chart?.destroy(); },
  };
};

PAGES.events = () => {
  let filter = 'all';
  const load = async () => {
    try {
      const d = await getJSON('/api/events?limit=500');
      const groups = { all: null, down: ['down', 'up'], latency: ['high_latency', 'latency_ok'], gap: ['gap'], net: ['speedtest', 'new_device', 'lan_scan', 'wifi', 'dns_down', 'dns_ok'], sec: ['auth', 'auth_lock', 'settings'] };
      const list = d.events.filter((e) => !groups[filter] || groups[filter].includes(e.kind));
      $('#ev-table').innerHTML = `<thead><tr><th>เวลา</th><th>ประเภท</th><th>เป้าหมาย</th><th>รายละเอียด</th></tr></thead>
        <tbody>${list.length ? list.map((e) => `<tr>
          <td class="mono">${fmtDT(e.ts)}${e.ts_end ? ` → ${fmtClock(e.ts_end)}` : ''}</td>
          <td><span class="badge b-${esc(e.kind)}">${esc(KIND[e.kind]?.label ?? e.kind)}</span></td>
          <td>${e.target ? esc(targetName(e.target)) : '<span class="c-muted">ทั้งระบบ</span>'}</td>
          <td style="white-space:normal">${esc(e.message)}</td></tr>`).join('')
          : '<tr><td colspan="4" class="empty">ไม่มีเหตุการณ์</td></tr>'}</tbody>`;
    } catch (_) { }
  };
  return {
    mount(el) {
      el.innerHTML = `
        <div class="card">
          <div class="card-head">
            <div><div class="card-title">บันทึกเหตุการณ์</div><div class="card-sub">หลุดเมื่อไม่ตอบติดกัน ${S.cfg?.down_after_failures ?? 3} ครั้ง · latency สูงเมื่อเกิน ${thr()} ms ติดกัน ${S.cfg?.latency_consecutive ?? 5} รอบ</div></div>
            <div class="seg" id="ev-filter">
              <button data-f="all" class="active">ทั้งหมด</button><button data-f="down">หลุด/กลับมา</button><button data-f="latency">Latency</button><button data-f="gap">ไม่มีข้อมูล</button><button data-f="net">Wi-Fi/DNS/Speed/อุปกรณ์</button><button data-f="sec">ระบบ/ความปลอดภัย</button>
            </div>
          </div>
          <div class="tbl-wrap"><table class="tbl" id="ev-table"></table></div>
        </div>`;
      $('#ev-filter').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        filter = b.dataset.f;
        [...$('#ev-filter').children].forEach((x) => x.classList.toggle('active', x === b));
        load();
      });
      load();
    },
    onEvents: load,
  };
};

/* ---------- 05 Compare ---------- */
const DAY = 86400;
function startOfDay(ts) { const d = new Date(ts * 1000); d.setHours(0, 0, 0, 0); return d.getTime() / 1000; }
function startOfWeek(ts) {  // จันทร์ 00:00
  const d = new Date(startOfDay(ts) * 1000);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime() / 1000;
}
function shiftDays(ts, n) { const d = new Date(ts * 1000); d.setDate(d.getDate() + n); return d.getTime() / 1000; }
const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
function fmtRange(a, b) {
  const sameDay = startOfDay(a) === startOfDay(b - 1);
  return sameDay ? `${fmtDate(a)} ${fmtClock(a).slice(0, 5)}–${fmtClock(b).slice(0, 5)}`
    : `${fmtDate(a)} – ${fmtDate(b - 1)}`;
}

PAGES.compare = () => {
  let chart = null, preset = 'week', tIndex = 0, data = null, reqId = 0;
  const toDateInput = (ts) => { const d = new Date(ts * 1000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fromDateInput = (v) => new Date(v + 'T00:00:00').getTime() / 1000;

  /** คืน {a:[start,end], b:[start,end], la, lb} — B ยาวเท่า A เสมอ เพื่อให้เทียบกันได้ยุติธรรม */
  const periods = () => {
    const now = nowSec();
    if (preset === 'today') {
      const a0 = startOfDay(now), b0 = shiftDays(a0, -1);
      return { a: [a0, now], b: [b0, b0 + (now - a0)], la: 'วันนี้', lb: 'เมื่อวาน (ช่วงเวลาเดียวกัน)' };
    }
    if (preset === 'week') {
      const a0 = startOfWeek(now), b0 = shiftDays(a0, -7);
      return { a: [a0, now], b: [b0, b0 + (now - a0)], la: 'สัปดาห์นี้', lb: 'สัปดาห์ที่แล้ว (ช่วงเดียวกัน)' };
    }
    if (preset === '7d') return { a: [now - 7 * DAY, now], b: [now - 14 * DAY, now - 7 * DAY], la: '7 วันล่าสุด', lb: '7 วันก่อนหน้า' };
    if (preset === '30d') return { a: [now - 30 * DAY, now], b: [now - 60 * DAY, now - 30 * DAY], la: '30 วันล่าสุด', lb: '30 วันก่อนหน้า' };
    const af = $('#cp-a-from').value, at = $('#cp-a-to').value, bf = $('#cp-b-from').value;
    if (!af || !at || !bf) return null;
    const a0 = fromDateInput(af), a1 = Math.min(shiftDays(fromDateInput(at), 1), now), b0 = fromDateInput(bf);
    if (a1 <= a0) return null;
    return { a: [a0, a1], b: [b0, b0 + (a1 - a0)], la: 'ช่วง A', lb: 'ช่วง B' };
  };

  const deltaBadge = (a, b, { lowerIsBetter = true, unit = '%', pp = false } = {}) => {
    if (a === null || b === null || a === undefined || b === undefined) return '';
    let diff, txt;
    if (pp) { diff = a - b; txt = `${diff > 0 ? '+' : ''}${diff.toFixed(2)}${unit}`; }
    else if (unit === '') { diff = a - b; txt = `${diff > 0 ? '+' : ''}${diff}`; }
    else {
      if (b === 0) { diff = a; txt = a ? 'ใหม่' : '±0%'; }
      else { diff = (a - b) / b * 100; txt = `${diff > 0 ? '+' : ''}${diff.toFixed(0)}%`; }
    }
    const eps = pp ? 0.005 : unit === '' ? 0 : 2;
    const cls = Math.abs(diff) <= eps ? 'same' : (diff < 0) === lowerIsBetter ? 'better' : 'worse';
    return `<span class="delta ${cls}">${txt}</span>`;
  };

  const lossOf = (s) => (s.n ? 100 - s.health : null);

  const render = () => {
    if (!data) return;
    const { ha, hb, p } = data;
    const ta = summaryTotals(ha), tb = summaryTotals(hb);
    const spanSec = p.a[1] - p.a[0];
    const covA = Math.min(100, 100 * ha.monitored_sec / spanSec), covB = Math.min(100, 100 * hb.monitored_sec / spanSec);
    $('#cp-note').innerHTML = `<b>${esc(p.la)}</b> ${fmtRange(...p.a)} &nbsp;เทียบกับ&nbsp; <b>${esc(p.lb)}</b> ${fmtRange(...p.b)}`;
    const kpi = (label, va, vb, unit, badge) => `
      <div class="card"><div class="kpi-label">${label}</div>
        <div class="kpi-val">${va}<small>${unit}</small>${badge}</div>
        <div class="kpi-b">${esc(p.lb.split(' (')[0])}: ${vb}${unit ? ' ' + unit : ''}</div></div>`;
    $('#cp-kpis').innerHTML = [
      kpi('Latency เฉลี่ย', fmtMs(ta.avg), fmtMs(tb.avg), 'ms', deltaBadge(ta.avg, tb.avg)),
      kpi('Latency สูงสุด', fmtMs(ta.max), fmtMs(tb.max), 'ms', deltaBadge(ta.max, tb.max)),
      kpi('Packet loss', lossOf(ta)?.toFixed(2) ?? '—', lossOf(tb)?.toFixed(2) ?? '—', '%', deltaBadge(lossOf(ta), lossOf(tb), { pp: true, unit: '' + '%' })),
      kpi('หลุด (ครั้ง)', ta.outages, tb.outages, '', deltaBadge(ta.outages, tb.outages, { unit: '' })),
      kpi('เวลาที่บันทึกได้', covA.toFixed(covA < 10 ? 1 : 0), covB.toFixed(covB < 10 ? 1 : 0), '%', ''),
    ].join('');

    $('#cp-table').innerHTML = `<thead><tr><th>เป้าหมาย</th><th class="num">เฉลี่ย A</th><th class="num">เฉลี่ย B</th><th class="num">เปลี่ยน</th>
      <th class="num">Loss A</th><th class="num">Loss B</th><th class="num">หลุด A</th><th class="num">หลุด B</th></tr></thead>
      <tbody>${ha.targets.map((id, i) => {
        const a = ha.summary[id], b = hb.summary[id];
        const pct = (v) => v === null ? '—' : v.toFixed(2) + '%';
        return `<tr><td><span class="swatch" style="background:${targetColor(i)}"></span>${esc(targetName(id))}</td>
          <td class="num">${fmtMs(a.avg_ms)} ms</td><td class="num c-muted">${fmtMs(b.avg_ms)} ms</td>
          <td class="num">${deltaBadge(a.avg_ms, b.avg_ms)}</td>
          <td class="num ${a.loss_pct ? 'c-crit' : ''}">${pct(a.loss_pct)}</td><td class="num c-muted">${pct(b.loss_pct)}</td>
          <td class="num ${a.outages ? 'c-crit' : ''}">${a.outages}</td><td class="num c-muted">${b.outages}</td></tr>`;
      }).join('')}</tbody>`;

    $('#cp-targets').innerHTML = ha.targets.map((id, i) =>
      `<button data-i="${i}" class="${i === tIndex ? 'active' : ''}">${esc(targetName(id))}</button>`).join('');
    $('#cp-legend').innerHTML = `<span><span class="ln" style="border-color:${targetColor(tIndex)}"></span>${esc(p.la)}</span>
      <span><span class="ln b"></span>${esc(p.lb)}</span>`;

    if (chart) {
      // วาง B ทับบนแกนเวลาของ A (เลื่อนเวลา B มาเท่ากับ A)
      const shift = p.a[0] - p.b[0];
      const line = (h, off) => {
        const out = [];
        let prev = null;
        for (const [bk, avg] of h.series[h.targets[tIndex]]) {
          if (prev !== null && bk - prev > h.bucket * 1.5) out.push({ x: (prev + h.bucket + off) * 1000, y: null });
          out.push({ x: (bk + off) * 1000, y: avg });
          prev = bk;
        }
        return out;
      };
      const col = targetColor(tIndex);
      const da = line(ha, 0), dbb = line(hb, shift);
      chart.data.datasets = [
        { label: p.la, data: da, borderColor: col, backgroundColor: col, pointRadius: dotsIfSparse(da) },
        { label: p.lb, data: dbb, borderColor: C.muted, backgroundColor: C.muted, borderDash: [5, 4], pointRadius: dotsIfSparse(dbb) },
      ];
      chart.options.scales.x.min = p.a[0] * 1000;
      chart.options.scales.x.max = p.a[1] * 1000;
      chart.options.plugins.legend.display = false;
      chart.options.plugins.tooltip.callbacks.title = (items) => {
        if (!items.length) return '';
        const x = items[0].parsed.x / 1000;
        return `${fmtDT(x).slice(0, -3)}  ·  B: ${fmtDT(x - shift).slice(0, -3)}`;
      };
      chart.update('none');
    }
  };

  const load = async () => {
    const p = periods();
    if (!p) { $('#cp-note').textContent = 'เลือกวันให้ครบทั้งช่วง A และวันเริ่มของช่วง B'; return; }
    const span = p.a[1] - p.a[0];
    if (span < 600) { $('#cp-note').textContent = 'ช่วงเวลาสั้นเกินไป (เพิ่งเริ่มวันใหม่?) — ลองเลือกช่วงอื่น'; return; }
    const bucket = span <= 2 * DAY ? 300 : span <= 8 * DAY ? 3600 : 6 * 3600;
    const my = ++reqId;
    $('#cp-note').textContent = 'กำลังโหลด…';
    try {
      const q = (r) => `/api/history?start=${Math.floor(r[0])}&end=${Math.floor(r[1])}&bucket=${bucket}`;
      const [ha, hb] = await Promise.all([getJSON(q(p.a)), getJSON(q(p.b))]);
      if (my !== reqId) return;
      data = { ha, hb, p };
      render();
    } catch (_) {
      $('#cp-note').textContent = 'โหลดข้อมูลไม่สำเร็จ';
    }
  };

  return {
    mount(el) {
      const now = nowSec();
      el.innerHTML = `
        <div class="card">
          <div class="controls">
            <div class="seg" id="cp-preset">
              <button data-p="today">วันนี้ vs เมื่อวาน</button><button data-p="week" class="active">สัปดาห์นี้ vs ที่แล้ว</button><button data-p="7d">7 วัน</button><button data-p="30d">30 วัน</button><button data-p="custom">กำหนดเอง</button>
            </div>
          </div>
          <div class="controls" id="cp-custom" hidden style="margin-top:12px">
            <span class="muted">A จาก</span><input type="date" class="date-in" id="cp-a-from" value="${toDateInput(startOfWeek(now))}">
            <span class="muted">ถึง</span><input type="date" class="date-in" id="cp-a-to" value="${toDateInput(now)}">
            <span class="muted">· B เริ่ม</span><input type="date" class="date-in" id="cp-b-from" value="${toDateInput(shiftDays(startOfWeek(now), -7))}">
            <span class="muted">(ยาวเท่าช่วง A)</span>
          </div>
          <div class="card-sub" id="cp-note" style="margin-top:10px">&nbsp;</div>
        </div>
        <div class="grid kpis mt" id="cp-kpis"></div>
        <div class="card mt">
          <div class="card-head">
            <div><div class="card-title">Latency ซ้อนกัน</div><div class="cmp-legend card-sub" id="cp-legend" style="margin-top:4px"></div></div>
            <div class="seg" id="cp-targets"></div>
          </div>
          <div class="chart-box tall"><canvas id="cp-chart"></canvas></div>
        </div>
        <div class="card mt">
          <div class="card-head"><div class="card-title">เทียบตามเป้าหมาย</div><div class="card-sub">สีเขียว = ดีขึ้น · สีแดง = แย่ลง</div></div>
          <div class="tbl-wrap"><table class="tbl" id="cp-table"></table></div>
        </div>`;
      $('#cp-preset').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        preset = b.dataset.p;
        [...$('#cp-preset').children].forEach((x) => x.classList.toggle('active', x === b));
        $('#cp-custom').hidden = preset !== 'custom';
        load();
      });
      ['#cp-a-from', '#cp-a-to', '#cp-b-from'].forEach((s) => $(s).addEventListener('change', load));
      $('#cp-targets').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        tIndex = +b.dataset.i;
        render();
      });
      chart = makeChart($('#cp-chart'), { tooltipFmt: 'd MMM HH:mm' });
      load();
    },
    unmount() { chart?.destroy(); },
  };
};

/* ---------- 06 Security ---------- */
function shortUA(ua) {
  if (!ua) return 'ไม่ทราบอุปกรณ์';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'อื่น ๆ';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'เบราว์เซอร์';
  return `${br} · ${os}`;
}

PAGES.security = () => {
  const loadSessions = async () => {
    if (!S.cfg?.auth_enabled) return;
    try {
      const d = await getJSON('/api/sessions');
      $('#sec-sessions').innerHTML = `<thead><tr><th>อุปกรณ์</th><th>IP</th><th>เข้าสู่ระบบเมื่อ</th><th>ใช้งานล่าสุด</th><th>หมดอายุ</th><th></th></tr></thead>
        <tbody>${d.sessions.map((s) => `<tr>
          <td>${esc(shortUA(s.ua))}${s.current ? '<span class="tag-current">● อุปกรณ์นี้</span>' : ''}</td>
          <td class="mono">${esc(s.ip)}</td><td class="mono">${fmtDT(s.created)}</td>
          <td class="mono">${fmtDT(s.last_seen)}</td><td class="mono">${fmtDate(s.expires)}</td>
          <td><button class="btn btn-sm btn-danger" data-sid="${s.id}">${s.current ? 'ออกจากระบบ' : 'เพิกถอน'}</button></td></tr>`).join('')}</tbody>`;
    } catch (_) { }
  };
  return {
    async mount(el) {
      await loadConfig();
      if (page !== this) return;  // ผู้ใช้เปลี่ยนหน้าไปแล้วระหว่างรอ
      const c = S.cfg;
      if (!c) { el.innerHTML = '<div class="card empty">โหลดข้อมูลไม่สำเร็จ</div>'; return; }
      const lan = c.lan;
      const lanState = !lan.enabled ? '<span class="c-muted">ปิด</span>'
        : lan.bound ? '<span class="c-ok">เปิดอยู่</span>' : '<span class="c-warn">ยังเปิดไม่ได้</span>';
      el.innerHTML = `<div id="sec-root">
        <div class="grid two-col">
          <div class="card">
            <div class="card-head"><div class="card-title">การป้องกัน</div></div>
            <div class="sec-row"><span class="k">Login (รหัสผ่าน)</span>${c.auth_enabled ? '<span class="c-ok">เปิด</span>' : '<span class="c-warn">ยังไม่ได้ตั้ง</span>'}</div>
            <div class="sec-row"><span class="k">รหัส 6 หลัก (TOTP)</span>${c.auth_enabled ? '<span class="c-ok">เปิด</span>' : '<span class="c-warn">ยังไม่ได้ตั้ง</span>'}</div>
            <div class="sec-row"><span class="k">อายุการเข้าสู่ระบบ</span><span class="mono">${c.session_days} วัน</span></div>
            <div class="sec-row"><span class="k">ใส่รหัสผิด</span><span>5 ครั้ง → ล็อก 15 นาที</span></div>
            <div class="sec-row"><span class="k">เปิดหน้านี้จาก</span><span class="mono">${esc(c.client_ip)}</span></div>
            ${c.auth_enabled ? '' : `<div class="notice warn">ยังไม่ได้ตั้งรหัส — ตอนนี้เปิดได้เฉพาะเครื่องนี้โดยไม่ต้อง login<br>ตั้งรหัสโดยรันในโฟลเดอร์โปรแกรม:</div><div class="code-line mt">python setup_auth.py</div>`}
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">เข้าจากมือถือ (Wi-Fi เดียวกัน)</div>${lanState}</div>
            ${lan.bound ? `<div class="kpi-label">เปิดบนมือถือที่ต่อ Wi-Fi บ้านด้วยที่อยู่นี้</div><div class="code-line" style="margin-top:6px">${esc(lan.url)}</div>
              <div class="notice info">มือถือจะเห็นการแจ้งเตือนเป็นป๊อปอัปในหน้าเว็บ — Browser Notification ใช้ได้เฉพาะบนเครื่องนี้ (localhost)</div>
              <div class="pwa-how">
                <b>ทำเป็นไอคอนบนหน้าจอมือถือ</b>
                <div><span class="dv-tag">iPhone</span> เปิดด้วย Safari → ปุ่มแชร์ → “เพิ่มไปยังหน้าจอโฮม” — เปิดแบบเต็มจอเหมือนแอป</div>
                <div><span class="dv-tag">Android</span> เปิดด้วย Chrome → เมนู ⋮ → “เพิ่มลงในหน้าจอหลัก”</div>
                <div class="c-muted">บนคอม: Edge/Chrome → เมนู → “ติดตั้งแอปนี้” จะได้หน้าต่างแยกของ Network Pulse</div>
              </div>`
              : lan.enabled ? `<div class="notice warn">${esc(lan.error || 'กำลังเปิด…')}</div>`
              : `<p class="muted" style="margin:0;font-size:13px">ปิดอยู่ — เปิดได้หลังตั้งรหัสแล้ว โดยรัน:</p><div class="code-line mt">python setup_auth.py --lan on</div>
                 <p class="muted" style="font-size:12px">แล้วเปิดโปรแกรมใหม่ · Windows อาจถามสิทธิ์ Firewall ครั้งแรก ให้อนุญาตเฉพาะ "Private network"</p>`}
          </div>
        </div>
        ${c.auth_enabled ? `
        <div class="card mt">
          <div class="card-head"><div class="card-title">อุปกรณ์ที่เข้าสู่ระบบอยู่</div><button class="btn btn-sm btn-danger" id="sec-revoke-others">ออกจากระบบทุกอุปกรณ์อื่น</button></div>
          <div class="tbl-wrap"><table class="tbl" id="sec-sessions"></table></div>
        </div>` : ''}
        <div class="card mt">
          <div class="card-head"><div class="card-title">คำสั่งที่ใช้บ่อย</div><div class="card-sub">รันในโฟลเดอร์โปรแกรม แล้วเปิดโปรแกรมใหม่</div></div>
          <div class="sec-row"><span class="k">เปลี่ยนรหัสผ่าน</span><code class="mono">python setup_auth.py --password</code></div>
          <div class="sec-row"><span class="k">เปลี่ยนมือถือ / ตั้ง TOTP ใหม่</span><code class="mono">python setup_auth.py --totp</code></div>
          <div class="sec-row"><span class="k">เปิด/ปิดการเข้าจาก Wi-Fi</span><code class="mono">python setup_auth.py --lan on|off</code></div>
        </div></div>`;
      $('#sec-root').addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        try {
          if (b.id === 'sec-revoke-others') {
            if (!confirm('ออกจากระบบทุกอุปกรณ์ ยกเว้นเครื่องนี้?')) return;
            await postJSON('/api/sessions/revoke', { others: true });
          } else if (b.dataset.sid) {
            const d = await postJSON('/api/sessions/revoke', { id: +b.dataset.sid });
            if (d.self) { toLogin(); return; }
          } else return;
          loadSessions();
        } catch (err) { alert(err.message); }
      });
      loadSessions();
    },
    onEvents: () => loadSessions(),
  };
};

/* ---------- 07 Settings ---------- */
PAGES.settings = () => {
  let data = null;        // ผลจาก GET /api/settings
  let original = '';      // สถานะฟอร์มตอนโหลด (ไว้เทียบว่าแก้อะไรไปหรือยัง)
  let rows = [];          // [{id, name, host}]
  let root = null;

  const GROUPS = [
    { title: 'การวัด', sub: 'มีผลตั้งแต่รอบถัดไป', keys: ['interval_sec', 'ping_timeout_ms'] },
    { title: 'การแจ้งเตือน', sub: 'มีผลทันที', keys: ['down_after_failures', 'latency_threshold_ms', 'latency_consecutive', 'latency_recover_consecutive'] },
    { title: 'ข้อมูลและการเข้าสู่ระบบ', sub: 'มีผลทันที', keys: ['raw_retention_days', 'session_days'] },
    { title: 'Speed test และอุปกรณ์ในบ้าน', sub: 'มีผลทันที · Speed test แต่ละครั้งใช้เน็ตราว 100–400 MB', keys: ['speedtest_interval_hours', 'plan_down_mbps', 'plan_up_mbps', 'lan_scan_interval_min'] },
  ];
  const UNITS = { interval_sec: 'วินาที', ping_timeout_ms: 'ms', down_after_failures: 'ครั้ง', latency_threshold_ms: 'ms',
    latency_consecutive: 'รอบ', latency_recover_consecutive: 'รอบ', raw_retention_days: 'วัน', session_days: 'วัน',
    speedtest_interval_hours: 'ชม.', plan_down_mbps: 'Mbps', plan_up_mbps: 'Mbps', lan_scan_interval_min: 'นาที' };

  const val = (k) => Number($(`#st-${k}`)?.value);
  function help(k) {
    const iv = val('interval_sec') || data.values.interval_sec;
    switch (k) {
      case 'interval_sec': return `ping ทุกเป้าหมายพร้อมกันทุก ${iv} วินาที — ถี่ขึ้นตรวจจับเร็วขึ้นแต่ฐานข้อมูลโตเร็วขึ้น`;
      case 'ping_timeout_ms': return 'ถ้าไม่ตอบภายในเวลานี้นับว่า "ไม่ตอบ" (ต้องไม่นานกว่าระยะวัด)';
      case 'down_after_failures': return `ตอนนี้ = แจ้งว่าหลุดเมื่อเงียบไปราว ${fmtDur(val(k) * iv)}`;
      case 'latency_threshold_ms': return 'latency เกินค่านี้นับว่าสูง (เส้นประสีส้มในกราฟ)';
      case 'latency_consecutive': return `ตอนนี้ = เตือนเมื่อสูงต่อเนื่องราว ${fmtDur(val(k) * iv)}`;
      case 'latency_recover_consecutive': return 'กันการเตือนสลับไปมาเมื่อ latency แกว่งรอบ ๆ เกณฑ์';
      case 'raw_retention_days': return 'ข้อมูลเก่ากว่านี้จะถูกรวมเป็นค่าเฉลี่ยรายชั่วโมง (ลดค่าแล้วย้อนกลับไม่ได้)';
      case 'session_days': return 'login ค้างไว้ได้นานเท่านี้ก่อนต้องใส่รหัสใหม่ (มีผลกับการ login ครั้งถัดไป)';
      case 'speedtest_interval_hours': return val(k) > 0 ? `วัดเองทุก ${val(k)} ชม. (วันละ ~${Math.ceil(24 / val(k))} ครั้ง) · ระหว่างวัด latency จะสูงขึ้นชั่วคราว` : 'ปิด — กดวัดเองที่หน้า Speed Test';
      case 'plan_down_mbps': return 'ใช้เทียบว่าได้ความเร็วกี่ % ของที่จ่าย (0 = ไม่ระบุ)';
      case 'plan_up_mbps': return 'ดูได้จากใบแจ้งหนี้หรือหน้าเว็บของผู้ให้บริการ';
      case 'lan_scan_interval_min': return val(k) > 0 ? 'เปิดเฉพาะวงในบ้าน — เครือข่ายที่ทำงาน/มหาวิทยาลัยอาจไม่อนุญาตให้สแกน' : 'ปิด — กดสแกนเองที่หน้า Topology';
      default: return '';
    }
  }

  const state = () => JSON.stringify({
    v: Object.keys(data.fields).map((k) => $(`#st-${k}`)?.value),
    t: rows.map((r) => [r.id, r.name.trim(), r.host.trim()]),
  });
  const isDirty = () => data && state() !== original;

  function setMsg(text, cls = '') {
    const m = $('#st-msg');
    if (m) { m.textContent = text; m.className = `msg ${cls}`; }
  }
  function refreshStatus() {
    if (!data) return;
    Object.keys(data.fields).forEach((k) => {
      const inp = $(`#st-${k}`);
      inp.classList.toggle('changed', Number(inp.value) !== data.values[k]);
      $(`#st-help-${k}`).textContent = help(k);
    });
    const dirty = isDirty();
    $('#st-save').disabled = !dirty;
    $('#st-cancel').disabled = !dirty;
    if (dirty) setMsg('มีการแก้ไขที่ยังไม่บันทึก', 'dirty');
    else if ($('#st-msg').classList.contains('dirty')) setMsg('');
  }

  function fieldHtml(k) {
    const f = data.fields[k];
    return `<div class="set-field">
      <label for="st-${k}">${esc(f.label.replace(/ \(.*\)$/, ''))}</label>
      <span class="set-input"><input class="inp num" type="number" id="st-${k}" min="${f.min}" max="${f.max}" step="1" value="${data.values[k]}" inputmode="numeric"><span class="unit">${UNITS[k]}</span></span>
      <div class="set-help" id="st-help-${k}"></div>
      <div class="set-err" id="st-err-${k}" hidden></div>
    </div>`;
  }

  function renderTargets() {
    const box = $('#st-targets');
    box.innerHTML = `<div class="tgt-row tgt-head"><span></span><span>ชื่อที่แสดง</span><span>IP / โดเมน</span><span></span></div>`
      + rows.map((r, i) => `<div class="tgt-row" data-i="${i}">
        <span class="swatch" style="background:${targetColor(i)};margin:0"></span>
        <input class="inp" data-f="name" maxlength="40" value="${esc(r.name)}" placeholder="เช่น Google DNS" aria-label="ชื่อเป้าหมาย ${i + 1}">
        <input class="inp mono" data-f="host" value="${esc(r.host)}" placeholder="1.1.1.1 หรือ auto" aria-label="IP เป้าหมาย ${i + 1}" spellcheck="false" autocapitalize="off">
        <button class="btn btn-sm btn-danger" data-del="${i}" type="button" ${rows.length <= 1 ? 'disabled' : ''} aria-label="ลบเป้าหมาย ${i + 1}">ลบ</button>
        <div class="tgt-err" id="st-terr-${i}" hidden></div>
      </div>`).join('');
    $('#st-add').disabled = rows.length >= data.max_targets;
  }

  function showErrors(fields) {
    root.querySelectorAll('.set-err, .tgt-err').forEach((e) => { e.hidden = true; });
    root.querySelectorAll('.inp.invalid').forEach((e) => e.classList.remove('invalid'));
    let first = null;
    for (const [k, msg] of Object.entries(fields || {})) {
      if (k === 'targets') {
        if (typeof msg === 'string') { const e = $('#st-terr-all'); e.textContent = msg; e.hidden = false; continue; }
        for (const [i, m] of Object.entries(msg)) {
          const e = $(`#st-terr-${i}`);
          if (e) { e.textContent = m; e.hidden = false; }
          const row = root.querySelector(`.tgt-row[data-i="${i}"] [data-f="host"]`);
          row?.classList.add('invalid');
          first = first || row;
        }
        continue;
      }
      const e = $(`#st-err-${k}`);
      if (e) { e.textContent = msg; e.hidden = false; }
      $(`#st-${k}`)?.classList.add('invalid');
      first = first || $(`#st-${k}`);
    }
    first?.focus();
  }

  function renderRestart() {
    const n = $('#st-restart');
    n.hidden = !data.restart_required;
  }

  async function load(keepMsg = false) {
    data = await getJSON('/api/settings');
    if (page !== self) return;
    rows = data.targets.map((t) => ({ ...t }));
    GROUPS.forEach((g, gi) => { $(`#st-group-${gi}`).innerHTML = g.keys.map(fieldHtml).join(''); });
    renderTargets();
    $('#st-gw').textContent = data.gateway_ip && data.gateway_ip !== 'ไม่พบ' ? `ตอนนี้ auto = ${data.gateway_ip}` : '';
    const ro = data.readonly;
    $('#st-readonly').innerHTML = `
      <div class="sec-row"><span class="k">พอร์ตเว็บ</span><span class="mono">${ro.port}</span></div>
      <div class="sec-row"><span class="k">Login + TOTP</span>${ro.auth_enabled ? '<span class="c-ok">เปิด</span>' : '<span class="c-warn">ยังไม่ได้ตั้ง</span>'}</div>
      <div class="sec-row"><span class="k">เข้าจากมือถือ (LAN)</span>${ro.lan_access ? '<span class="c-ok">เปิด</span>' : '<span class="c-muted">ปิด</span>'}</div>
      <div class="sec-row"><span class="k">ไฟล์ฐานข้อมูล</span><span class="mono" style="font-size:12px;overflow-wrap:anywhere;text-align:right">${esc(ro.db_path)}</span></div>`;
    renderRestart();
    original = state();
    showErrors({});
    if (!keepMsg) setMsg('');
    refreshStatus();
  }

  async function save() {
    const body = {};
    Object.keys(data.fields).forEach((k) => { body[k] = val(k); });
    body.targets = rows.map((r) => ({ id: r.id, name: r.name.trim(), host: r.host.trim() }));
    $('#st-save').disabled = true;
    setMsg('กำลังบันทึก…');
    try {
      const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { toLogin(); return; }
      if (!r.ok) { showErrors(d.fields); setMsg(d.error || 'บันทึกไม่สำเร็จ', 'err'); $('#st-save').disabled = false; return; }
      await load(true);
      await loadConfig();
      setMsg(d.changed.length ? (d.restart_required ? 'บันทึกแล้ว ✓ — ค่าอื่นมีผลแล้ว ส่วนเป้าหมายรอเปิดโปรแกรมใหม่' : 'บันทึกแล้ว ✓ มีผลทันที') : 'ไม่มีอะไรเปลี่ยน', 'ok');
    } catch (_) {
      setMsg('ติดต่อเซิร์ฟเวอร์ไม่ได้', 'err');
      $('#st-save').disabled = false;
    }
  }

  const self = {
    isDirty,
    async mount(el) {
      el.innerHTML = `<div id="st-root">
        <div class="notice warn" id="st-restart" hidden style="margin-top:0;margin-bottom:16px">
          เปลี่ยนเป้าหมายแล้ว — ปิดโปรแกรม (Ctrl+C) แล้วเปิดใหม่เพื่อเริ่ม ping ตามรายการใหม่
        </div>
        <div class="grid two-col">
          <div class="card"><div class="card-head"><div class="card-title">${GROUPS[0].title}</div><div class="card-sub">${GROUPS[0].sub}</div></div><div id="st-group-0"></div></div>
          <div class="card"><div class="card-head"><div class="card-title">${GROUPS[1].title}</div><div class="card-sub">${GROUPS[1].sub}</div></div><div id="st-group-1"></div></div>
        </div>
        <div class="card mt">
          <div class="card-head">
            <div><div class="card-title">เป้าหมายที่ ping</div>
              <div class="card-sub">ใส่ IPv4 หรือโดเมน · <span class="mono">auto</span> = default gateway (router) <span id="st-gw"></span> · เปลี่ยนแล้วต้องเปิดโปรแกรมใหม่</div></div>
            <button class="btn btn-sm" id="st-add" type="button">+ เพิ่มเป้าหมาย</button>
          </div>
          <div id="st-targets"></div>
          <div class="set-err" id="st-terr-all" hidden></div>
        </div>
        <div class="card mt"><div class="card-head"><div class="card-title">${GROUPS[3].title}</div><div class="card-sub">${GROUPS[3].sub}</div></div><div id="st-group-3" class="set-grid2"></div></div>
        <div class="grid two-col mt">
          <div class="card"><div class="card-head"><div class="card-title">${GROUPS[2].title}</div><div class="card-sub">${GROUPS[2].sub}</div></div><div id="st-group-2"></div></div>
          <div class="card"><div class="card-head"><div class="card-title">แก้ได้ด้วยคำสั่งเท่านั้น</div><a href="#/security" class="card-sub">Security →</a></div>
            <div id="st-readonly"></div>
            <p class="muted" style="font-size:12px;margin:10px 0 0">รหัสผ่าน, TOTP และการเปิดให้มือถือเข้า ต้องแก้ด้วย <span class="mono">setup_auth.py</span> บนคอมเครื่องนี้เท่านั้น เพื่อไม่ให้ใครที่ได้ session ไปแก้ได้</p>
          </div>
        </div>
        <div class="savebar">
          <span class="msg" id="st-msg"></span>
          <button class="btn" id="st-defaults" type="button">ใช้ค่าเริ่มต้น</button>
          <button class="btn" id="st-cancel" type="button" disabled>ยกเลิกการแก้ไข</button>
          <button class="btn btn-primary" id="st-save" type="button" disabled>บันทึก</button>
        </div>
      </div>`;
      root = $('#st-root');
      root.addEventListener('input', (e) => {
        const row = e.target.closest('.tgt-row');
        if (row && e.target.dataset.f) rows[+row.dataset.i][e.target.dataset.f] = e.target.value;
        e.target.classList.remove('invalid');
        refreshStatus();
      });
      root.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.del !== undefined) {
          rows.splice(+b.dataset.del, 1);
          renderTargets();
          refreshStatus();
        } else if (b.id === 'st-add') {
          rows.push({ id: '', name: '', host: '' });
          renderTargets();
          refreshStatus();
          root.querySelector(`.tgt-row[data-i="${rows.length - 1}"] [data-f="name"]`)?.focus();
        } else if (b.id === 'st-defaults') {
          Object.entries(data.defaults).forEach(([k, v]) => { $(`#st-${k}`).value = v; });
          const byHost = new Map(data.targets.map((t) => [t.host, t.id]));
          rows = data.default_targets.map((t) => ({ id: byHost.get(t.host) || '', name: t.name, host: t.host }));
          renderTargets();
          refreshStatus();
          setMsg('ใส่ค่าเริ่มต้นแล้ว — กดบันทึกเพื่อใช้', 'dirty');
        } else if (b.id === 'st-cancel') {
          load();
        } else if (b.id === 'st-save') {
          save();
        }
      });
      root.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('.inp') && !$('#st-save').disabled) save();
      });
      try { await load(); } catch (_) { if (page === self) el.innerHTML = '<div class="card empty">โหลดการตั้งค่าไม่สำเร็จ</div>'; }
    },
  };
  return self;
};

/* ---------- 03 Network Tools ---------- */
const TOOL_CACHE = {};  // ผลล่าสุดของแต่ละเครื่องมือ (คงไว้เมื่อสลับแท็บ/หน้า)
const TOOL_TABS = [
  ['ping', 'prompt', 'Ping', 'ส่ง ping ซ้ำหลายครั้งเพื่อดู latency และ packet loss'],
  ['trace', 'topology', 'Traceroute', 'ไล่ดูทีละ hop ว่าแพ็กเก็ตผ่านเราเตอร์ตัวไหนบ้าง (ใช้เวลา 10–60 วินาที)'],
  ['dns', 'globe', 'DNS Lookup', 'แปลงชื่อโดเมนเป็น IP — หรือใส่ IP เพื่อหาชื่อกลับ'],
  ['info', 'info', 'IP Info', 'ข้อมูลเครือข่ายของเครื่องที่รัน Network Pulse'],
];

function quickHosts() {
  const hosts = [];
  (S.status?.targets ?? []).forEach((t) => { if (t.host && t.host !== 'ไม่พบ') hosts.push(t.host); });
  ['google.com', 'cloudflare.com'].forEach((h) => hosts.push(h));
  return [...new Set(hosts)];
}

function renderToolResult(tab, d) {
  if (!d) return '';
  if (d.error) return `<div class="notice err">${esc(d.error)}</div>`;
  if (tab === 'ping') {
    const max = Math.max(1, ...d.results.filter((v) => v !== null));
    return `<div class="stat-row">
        <div class="stat"><div class="l">ส่ง / ได้รับ</div><div class="v">${d.received}/${d.sent}</div></div>
        <div class="stat"><div class="l">Packet loss</div><div class="v ${d.loss_pct ? 'c-crit' : ''}">${d.loss_pct}<small>%</small></div></div>
        <div class="stat"><div class="l">ต่ำสุด</div><div class="v">${fmtMs(d.min)}<small>ms</small></div></div>
        <div class="stat"><div class="l">เฉลี่ย</div><div class="v">${fmtMs(d.avg)}<small>ms</small></div></div>
        <div class="stat"><div class="l">สูงสุด</div><div class="v">${fmtMs(d.max)}<small>ms</small></div></div>
      </div>
      <div class="bars">${d.results.map((v, i) => `<div class="bar ${v === null ? 'fail' : ''}" style="height:${v === null ? 100 : Math.max(4, 100 * v / max)}%" title="#${i + 1}: ${v === null ? 'ไม่ตอบ' : fmtMs(v) + ' ms'}"></div>`).join('')}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>ปลายทาง</th><th class="num">เวลา</th></tr></thead><tbody>
        ${d.results.map((v, i) => `<tr><td class="mono">${i + 1}</td><td class="mono">${esc(d.host)}</td>
          <td class="num ${v === null ? 'c-crit' : v > thr() ? 'c-warn' : ''}">${v === null ? 'ไม่ตอบ (timeout)' : fmtMs(v) + ' ms'}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  if (tab === 'trace') {
    return `<div class="card-sub" style="margin-bottom:8px">${d.reached ? '<span class="c-ok">ถึงปลายทางแล้ว</span>' : '<span class="c-warn">ไปไม่ถึงปลายทางภายในจำนวน hop ที่กำหนด</span>'} · ${d.hops.length} hop · * = เราเตอร์ตัวนั้นไม่ตอบ (ปกติของ ISP หลายเจ้า)</div>
      <div class="hop-list">${d.hops.map((h) => `<div class="hop ${h.ip ? '' : 'lost'}"><span class="n">${h.hop}</span><span class="pin"></span>
        <span class="ip">${h.ip ? esc(h.ip) : '<span class="c-muted">ไม่ตอบ</span>'}</span>
        <span class="ms">${h.ms.map((m) => (m === null ? '*' : fmtMs(m) + ' ms')).join(' · ')}</span></div>`).join('')}</div>`;
  }
  if (tab === 'dns') {
    return `<div class="card-sub" style="margin-bottom:8px">${esc(d.query)} · ใช้เวลา ${d.ms} ms (ผ่าน DNS ที่เครื่องนี้ตั้งไว้)</div>
      ${d.records.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>ชนิด</th><th>ค่า</th><th></th></tr></thead><tbody>
        ${d.records.map((r) => `<tr><td><span class="badge b-latency_ok">${esc(r.type)}</span></td><td class="mono">${esc(r.value)}</td>
          <td>${r.type === 'A' ? `<a class="link-btn" href="#/tools/ping/${encodeURIComponent(r.value)}">ping</a>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="notice warn">ไม่พบข้อมูล — ${d.reverse ? 'IP นี้ไม่มีชื่อย้อนกลับ' : 'ชื่อโดเมนนี้ไม่มีอยู่ หรือ DNS ไม่ตอบ'}</div>`}`;
  }
  if (tab === 'info') {
    const [lv, lu] = fmtRate(d.link_bps);
    const row = (k, v) => `<div class="sec-row"><span class="k">${k}</span><span class="mono">${v}</span></div>`;
    return row('ชื่อเครื่อง', esc(d.hostname))
      + row('IP ในวง LAN', esc(d.local_ip ?? 'ไม่พบ'))
      + row('Default Gateway (router)', esc(d.gateway ?? 'ไม่พบ'))
      + row('การ์ดเครือข่าย', esc(d.interface ?? '—'))
      + row('ความเร็วลิงก์', d.link_bps ? `${lv} ${lu}` : '—')
      + row('เปิดหน้านี้จาก', esc(d.client_ip))
      + `<div class="sec-row"><span class="k">IP สาธารณะ (Public)</span><span id="pub-ip">${d.public_ip ? `<span class="mono">${esc(d.public_ip)}</span>` : '<button class="btn btn-sm" id="pub-btn" type="button">ตรวจ Public IP</button>'}</span></div>
        <p class="muted" style="font-size:12px;margin:8px 0 0">ปุ่มตรวจ Public IP จะถาม api.ipify.org (บริการภายนอก) — ไม่ได้ส่งข้อมูลอื่นนอกจากการเชื่อมต่อ</p>`;
  }
  return '';
}

PAGES.tools = () => {
  let tab = 'ping', reqId = 0;
  const self = {
    mount(el, args) {
      el.innerHTML = `<div id="tl-root">
        <div class="tool-tabs" id="tl-tabs">${TOOL_TABS.map(([id, ic, label]) => `<button class="qtool" type="button" data-t="${id}">${icon(ic)}${label}</button>`).join('')}</div>
        <div class="card mt">
          <div class="card-head"><div><div class="card-title" id="tl-title"></div><div class="card-sub" id="tl-help"></div></div></div>
          <form class="tool-form" id="tl-form" autocomplete="off">
            <input class="inp" id="tl-host" placeholder="IP หรือชื่อโดเมน เช่น 8.8.8.8, google.com" spellcheck="false" autocapitalize="off" aria-label="ปลายทาง">
            <select class="inp" id="tl-count" style="flex:none;min-width:0;font-family:var(--font-ui)" aria-label="จำนวนครั้ง"><option value="4">4 ครั้ง</option><option value="10">10 ครั้ง</option></select>
            <button class="btn btn-primary" id="tl-run" type="submit">เริ่ม</button>
          </form>
          <div class="quick-hosts" id="tl-quick"></div>
          <div class="tool-out" id="tl-out"></div>
        </div>
      </div>`;
      $('#tl-tabs').addEventListener('click', (e) => {
        const b = e.target.closest('[data-t]');
        if (b) location.hash = `#/tools/${b.dataset.t}`;
      });
      $('#tl-form').addEventListener('submit', (e) => { e.preventDefault(); run(); });
      $('#tl-quick').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        $('#tl-host').value = b.dataset.h;
        run();
      });
      $('#tl-out').addEventListener('click', async (e) => {
        if (e.target.id !== 'pub-btn') return;
        e.target.disabled = true;
        e.target.innerHTML = '<span class="spin"></span>กำลังถาม…';
        try {
          const d = await postJSON('/api/tools/public-ip');
          if (TOOL_CACHE.info) TOOL_CACHE.info.public_ip = d.ip;
          $('#pub-ip').innerHTML = `<span class="mono">${esc(d.ip)}</span>`;
        } catch (err) {
          $('#pub-ip').innerHTML = `<span class="c-crit">${esc(err.message)}</span>`;
        }
      });
      self.onArgs(args);
    },
    onArgs(args = []) {
      const t = TOOL_TABS.find((x) => x[0] === args[0]) ? args[0] : 'ping';
      const host = args[1] ? String(args[1]) : '';
      tab = t;
      reqId++;  // ทิ้งผลของงานที่ค้างจากแท็บเดิม
      const [, ic, label, help] = TOOL_TABS.find((x) => x[0] === tab);
      [...$('#tl-tabs').children].forEach((b) => b.classList.toggle('active', b.dataset.t === tab));
      $('#tl-title').innerHTML = `${icon(ic, 'ct-ico')}<span>${label}</span>`;
      $('#tl-help').textContent = help;
      $('#tl-form').hidden = tab === 'info';
      $('#tl-quick').hidden = tab === 'info';
      $('#tl-count').hidden = tab !== 'ping';
      $('#tl-run').disabled = false;
      $('#tl-run').textContent = 'เริ่ม';
      $('#tl-quick').innerHTML = quickHosts().map((h) => `<button type="button" data-h="${esc(h)}">${esc(h)}</button>`).join('');
      const cached = TOOL_CACHE[tab];
      $('#tl-host').value = host || cached?.host || cached?.query || '';
      $('#tl-out').innerHTML = renderToolResult(tab, cached);
      if (host || tab === 'info') run();
    },
    update() {  // รายการ IP ลัดอาจยังว่างตอนเปิดหน้า (ยังไม่ได้ผล poll แรก)
      const box = $('#tl-quick');
      const want = quickHosts();
      if (box && box.dataset.v !== want.join(',')) {
        box.innerHTML = want.map((h) => `<button type="button" data-h="${esc(h)}">${esc(h)}</button>`).join('');
        box.dataset.v = want.join(',');
      }
    },
  };

  async function run() {
    const host = $('#tl-host').value.trim();
    if (tab !== 'info' && !host) { $('#tl-host').focus(); return; }
    const my = ++reqId;
    const myTab = tab;
    $('#tl-run').disabled = true;
    $('#tl-run').innerHTML = '<span class="spin"></span>กำลังทำงาน…';
    if (tab !== 'info') $('#tl-out').innerHTML = `<div class="card-sub"><span class="spin"></span>${tab === 'trace' ? 'กำลังไล่เส้นทาง — อาจใช้เวลาถึง 1 นาที' : 'กำลังทำงาน…'}</div>`;
    let d;
    try {
      if (tab === 'ping') d = await postJSON('/api/tools/ping', { host, count: +$('#tl-count').value });
      else if (tab === 'trace') d = await postJSON('/api/tools/trace', { host });
      else if (tab === 'dns') d = await postJSON('/api/tools/dns', { name: host });
      else d = { ...(await getJSON('/api/tools/info')), public_ip: TOOL_CACHE.info?.public_ip };
    } catch (err) {
      d = { error: err.message, host };
    }
    if (page !== self || my !== reqId) return;
    if (!d.error) TOOL_CACHE[myTab] = d;
    $('#tl-out').innerHTML = renderToolResult(myTab, d);
    $('#tl-run').disabled = false;
    $('#tl-run').textContent = 'เริ่ม';
  }
  return self;
};

/* ---------- 04 Topology ---------- */
PAGES.topology = () => {
  let reqId = 0;
  const devices = devicesPanel(() => page === self);
  const nodeHtml = (ic, name, sub, val, st) => `
    <div class="topo-node path-node ${st === 'down' ? 'down' : st === 'warn' ? 'warn' : ''}">
      <div class="pn-ico">${icon(ic)}</div>
      <div class="pn-name">${esc(name)}</div><div class="pn-sub" title="${esc(sub)}">${esc(sub)}</div>
      ${val ? `<div class="pn-val">${esc(val)}</div>` : ''}
    </div>`;
  const linkHtml = (st, label = '') => `<div class="topo-link ${st === 'down' ? 'down' : st === 'warn' ? 'warn' : ''}">${label ? `<span>${esc(label)}</span>` : ''}</div>`;
  const msTxt = (t) => { const m = freshMs(t); return m === undefined ? '' : m === null ? 'ไม่ตอบ' : `${fmtMs(m)} ms`; };
  // เลื่อนกลุ่มปลายทางขึ้นให้จุดกึ่งกลางของเส้นแนวตั้งตรงกับเส้นหลัก (โหนดสูง 128px, เว้น 18px, ไอคอนอยู่ที่ 28px)
  const branchOffset = (n) => (n > 1 ? Math.round(28 - (28 + (n * 128 + (n - 1) * 18) - 100) / 2) : 0);

  function render() {
    const ts = S.status?.targets ?? [];
    const gw = ts[gwIdx()];
    const ext = extIdx().map((i) => ts[i]);
    const extDown = ext.length && ext.every((t) => t.state === 'down');
    const netSt = !ext.length ? 'unknown' : extDown ? 'down' : ext.some((t) => tState(t) !== 'ok') ? 'warn' : 'ok';
    const gwSt = gw ? tState(gw) : 'ok';
    $('#tp-diagram').innerHTML = `<div class="topo-row">
      ${nodeHtml('monitor', S.overview?.hostname || 'เครื่องนี้', S.overview?.local_ip || 'Local PC', 'Network Pulse', 'ok')}
      ${linkHtml(gwSt, gw ? msTxt(gw) : '')}
      ${gw ? nodeHtml('router', gw.name, gw.host, tState(gw) === 'down' ? 'ไม่ตอบ' : 'Router', gwSt) : nodeHtml('router', 'Router', 'ไม่ได้วัด', '', 'unknown')}
      ${linkHtml(netSt === 'down' && gwSt === 'down' ? 'down' : netSt)}
      ${nodeHtml('globe', 'Internet', 'ISP / Public', extDown ? (gwSt === 'down' ? 'ตรวจ router' : 'ISP มีปัญหา?') : '', netSt)}
      ${ext.length > 1 ? linkHtml(netSt, '').replace('topo-link', 'topo-link stub') : ''}
      <div class="topo-branch" style="margin-top:${branchOffset(ext.length)}px">${ext.map((t) => `<div class="topo-item">${linkHtml(tState(t), msTxt(t))}${nodeHtml('cloud', t.name, t.host, t.state === 'down' ? 'หลุด' : t.high ? 'latency สูง' : '', tState(t))}</div>`).join('') || '<div class="card-sub">ไม่มีเป้าหมายภายนอก</div>'}</div>
    </div>`;
    const off = branchOffset(ext.length);
    $('#tp-diagram').style.paddingTop = `${18 + Math.max(0, -off)}px`;
    $('#tp-detail').textContent = S.connected ? (S.status?.overall?.detail ?? '') : 'ติดต่อโปรแกรมไม่ได้';
    const sel = $('#tp-target');
    const want = quickHosts();
    if (sel.dataset.v !== want.join(',')) {
      const cur = sel.value;
      sel.innerHTML = want.map((h) => `<option value="${esc(h)}">${esc(h)}</option>`).join('');
      if (sel.dataset.touched && want.includes(cur)) sel.value = cur;
      else if (ext[0] && want.includes(ext[0].host)) sel.value = ext[0].host;
      sel.dataset.v = want.join(',');
    }
  }

  async function trace() {
    const host = $('#tp-target').value;
    if (!host) return;
    const my = ++reqId;
    $('#tp-run').disabled = true;
    $('#tp-run').innerHTML = '<span class="spin"></span>กำลังไล่เส้นทาง…';
    $('#tp-hops').innerHTML = '<div class="card-sub"><span class="spin"></span>อาจใช้เวลาถึง 1 นาที</div>';
    let d;
    try { d = await postJSON('/api/tools/trace', { host }); } catch (err) { d = { error: err.message }; }
    if (page !== self || my !== reqId) return;
    if (!d.error) TOOL_CACHE.trace = d;
    $('#tp-hops').innerHTML = renderToolResult('trace', d);
    $('#tp-run').disabled = false;
    $('#tp-run').textContent = 'ตรวจเส้นทาง';
  }

  const self = {
    mount(el) {
      el.innerHTML = `
        <div class="card">
          <div class="card-head"><div>${cardTitle('topology', 'แผนผังเครือข่าย')}<div class="card-sub" id="tp-detail" style="margin:2px 0 0 34px"></div></div></div>
          <div class="tbl-wrap"><div class="topo" id="tp-diagram"></div></div>
        </div>
        <div class="card mt">
          <div class="card-head">
            <div>${cardTitle('route', 'เส้นทางจริง (Traceroute)')}<div class="card-sub" style="margin:2px 0 0 34px">ดูว่าแพ็กเก็ตวิ่งผ่านเราเตอร์ของ ISP กี่ตัว และช้าที่ hop ไหน</div></div>
            <div class="head-tools"><select class="inp" id="tp-target" aria-label="ปลายทาง"></select><button class="btn btn-primary" id="tp-run" type="button">ตรวจเส้นทาง</button></div>
          </div>
          <div id="tp-hops">${TOOL_CACHE.trace ? renderToolResult('trace', TOOL_CACHE.trace) : '<div class="empty">กด “ตรวจเส้นทาง” เพื่อเริ่ม</div>'}</div>
        </div>
        ${devices.html}`;
      $('#tp-run').addEventListener('click', trace);
      $('#tp-target').addEventListener('change', (e) => { e.target.dataset.touched = '1'; });
      if (!S.overview) loadOverview();
      render();
      devices.mount();
    },
    unmount() { devices.unmount(); },
    onEvents(evts) { devices.onEvents(evts); },
    update: render,
    onOverview: render,
  };
  return self;
};

/* ---------- ตัวช่วยของ Speed test / รายงาน ---------- */
const mbps = (bps) => (bps === null || bps === undefined ? null : bps / 1e6);
function fmtMbps(bps, digits) {
  const v = mbps(bps);
  if (v === null) return '—';
  return v.toFixed(digits ?? (v >= 100 ? 0 : 1));
}
/** % ของความเร็วแพ็กเกจ (null ถ้าไม่ได้ตั้งไว้) */
const planPct = (bps, plan) => (plan > 0 && bps ? 100 * bps / 1e6 / plan : null);
const pctClass = (p) => (p === null ? '' : p >= 80 ? 'c-ok' : p >= 50 ? 'c-warn' : 'c-crit');
function fmtDay(ts) { return new Date(ts * 1000).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' }); }
function fmtDateLong(ts) { return new Date(ts * 1000).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }); }

/** กราฟเส้นแบบแกนเวลา (ไม่มีเส้นเกณฑ์ latency) */
function makeLineChart(canvas, { yTitle = '', tooltipFmt = 'd MMM HH:mm', unit = 'day', stacked = false, type = 'line' } = {}) {
  if (!chartReady()) {
    canvas.insertAdjacentHTML('afterend', '<div class="chart-msg">โหลด Chart.js ไม่ได้<br>ลองกด Ctrl+F5</div>');
    return null;
  }
  return new Chart(canvas, {
    type,
    data: { datasets: [] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 600 }, parsing: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { type: 'time', time: { unit, tooltipFormat: tooltipFmt, displayFormats: { minute: 'HH:mm', hour: 'd MMM HH:mm', day: 'd MMM' } }, grid: { display: false }, stacked, offset: type === 'bar', ticks: { maxTicksLimit: 10, maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, title: { display: !!yTitle, text: yTitle }, stacked, ticks: { maxTicksLimit: 6 } },
      },
      plugins: { legend: { labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } } },
    },
    plugins: [zoomFixPlugin, glowPlugin],
  });
}

/* ---------- 04 Speed Test ---------- */
PAGES.speed = () => {
  let chart = null, timer = 0, data = null;
  const PHASE = { latency: 'กำลังวัด ping…', download: 'กำลังวัดดาวน์โหลด…', upload: 'กำลังวัดอัปโหลด…' };

  const statCard = (id, ic, label, cls = '') => `
    <div class="sp-stat ${cls}" id="sp-${id}">
      <div class="sp-stat-ico">${icon(ic)}</div>
      <div><div class="klabel">${label}</div><div class="sp-val js-v">—</div><div class="kdelta js-d">&nbsp;</div></div>
    </div>`;
  const setStat = (id, val, unit, sub = '&nbsp;', subCls = '') => {
    const el = $(`#sp-${id}`);
    if (!el) return;
    el.querySelector('.js-v').innerHTML = val === '—' ? '—' : `${val}<small>${unit}</small>`;
    const d = el.querySelector('.js-d');
    d.innerHTML = sub;
    d.className = `kdelta js-d ${subCls}`;
  };

  function renderStatus() {
    if (!data) return;
    const st = data.status || {};
    const plan = data.plan;
    const last = data.tests.find((t) => !t.error);
    const running = !!st.running;
    const btn = $('#sp-go');
    btn.disabled = running || !data.status;
    btn.classList.toggle('running', running);
    $('#sp-go-label').textContent = running ? (PHASE[st.phase] || 'กำลังวัด…') : 'เริ่มวัด';
    const live = running && st.live_bps ? fmtMbps(st.live_bps) : null;
    $('#sp-live').innerHTML = running
      ? `<span class="sp-live-num">${live ?? '…'}</span><small>${live ? 'Mbps' : ''}</small>`
      : last ? `<span class="sp-live-num">${fmtMbps(last.down_bps)}</span><small>Mbps</small>` : '<span class="sp-live-num">—</span>';
    $('#sp-live-sub').textContent = running ? (st.phase === 'upload' ? 'อัปโหลด' : st.phase === 'download' ? 'ดาวน์โหลด' : 'ping')
      : last ? `ดาวน์โหลดล่าสุด · ${fmtDT(last.ts)}` : 'ยังไม่เคยวัด';
    const prog = running ? ({ latency: 0, download: 1, upload: 2 }[st.phase] ?? 0) / 3 + (st.progress || 0) / 3 : 0;
    $('#sp-prog').style.width = `${Math.round(prog * 100)}%`;
    $('#sp-prog').parentElement.hidden = !running;
    $('#sp-ring').style.strokeDasharray = `${(running ? prog : last ? 1 : 0) * 553} 553`;

    const src = running ? st : last;
    const show = (bps, pl, id, label) => {
      const p = planPct(bps, pl);
      setStat(id, fmtMbps(bps), 'Mbps', p === null ? (pl ? '&nbsp;' : `<span class="c-muted">ตั้งความเร็วแพ็กเกจได้ที่ Settings</span>`) : `${p.toFixed(0)}% ของแพ็กเกจ ${pl} Mbps`, pctClass(p));
    };
    show(src?.down_bps, plan.down_mbps, 'down');
    show(src?.up_bps, plan.up_mbps, 'up');
    setStat('ping', src?.ping_ms === null || src?.ping_ms === undefined ? '—' : fmtMs(src.ping_ms), 'ms', 'HTTP ไป-กลับ ถึง Cloudflare');
    setStat('jit', last && !running ? last.jitter_ms.toFixed(1) : '—', 'ms', 'ความแกว่งของ ping');
    const err = !running && st.error;
    $('#sp-err').hidden = !err;
    $('#sp-err').textContent = err || '';
    $('#sp-auto').innerHTML = data.interval_hours > 0
      ? `วัดอัตโนมัติทุก ${data.interval_hours} ชม.`
      : 'วัดอัตโนมัติ: ปิดอยู่ (<a href="#/settings" class="link-btn">ตั้งได้ที่ Settings</a>)';
  }

  function renderHistory() {
    const tests = data.tests;
    const plan = data.plan;
    $('#sp-count').textContent = tests.length ? `${tests.length} ครั้งล่าสุด` : '';
    $('#sp-table').innerHTML = `<thead><tr><th>เวลา</th><th>วิธี</th><th class="num">ดาวน์โหลด</th><th class="num">อัปโหลด</th><th class="num">Ping</th><th class="num">Jitter</th><th class="num">เทียบแพ็กเกจ</th></tr></thead>
      <tbody>${tests.length ? tests.map((t) => {
        if (t.error) return `<tr><td class="mono">${fmtDT(t.ts)}</td><td>${t.trigger === 'scheduled' ? 'อัตโนมัติ' : 'กดเอง'}</td><td colspan="5" class="c-crit" style="white-space:normal">${esc(t.error)}</td></tr>`;
        const pd = planPct(t.down_bps, plan.down_mbps);
        return `<tr><td class="mono">${fmtDT(t.ts)}</td><td>${t.trigger === 'scheduled' ? 'อัตโนมัติ' : 'กดเอง'}</td>
          <td class="num">${fmtMbps(t.down_bps)} Mbps</td><td class="num">${fmtMbps(t.up_bps)} Mbps</td>
          <td class="num">${fmtMs(t.ping_ms)} ms</td><td class="num">${t.jitter_ms?.toFixed(1) ?? '—'} ms</td>
          <td class="num ${pctClass(pd)}">${pd === null ? '—' : pd.toFixed(0) + '%'}</td></tr>`;
      }).join('') : '<tr><td colspan="7" class="empty">ยังไม่มีผลการวัด — กด “เริ่มวัด”</td></tr>'}</tbody>`;
    if (!chart) return;
    const ok = tests.filter((t) => !t.error).slice().reverse();
    const ds = (label, key, color) => ({
      label, data: ok.map((t) => ({ x: t.ts * 1000, y: mbps(t[key]) })), borderColor: color, backgroundColor: areaFill(color),
      fill: true, tension: .3, pointRadius: ok.length < 40 ? 3 : 0, pointHoverRadius: 5, borderWidth: 2,
    });
    const planLine = (v, color, label) => (v > 0 && ok.length ? [{
      label, data: [{ x: ok[0].ts * 1000, y: v }, { x: ok[ok.length - 1].ts * 1000, y: v }], borderColor: color + '99',
      borderDash: [6, 5], borderWidth: 1.2, pointRadius: 0, fill: false, isFail: true,
    }] : []);
    chart.data.datasets = [ds('ดาวน์โหลด', 'down_bps', C.primary), ds('อัปโหลด', 'up_bps', C.violet),
      ...planLine(plan.down_mbps, C.primary, `แพ็กเกจดาวน์โหลด ${plan.down_mbps}`), ...planLine(plan.up_mbps, C.violet, `แพ็กเกจอัปโหลด ${plan.up_mbps}`)];
    const span = ok.length > 1 ? ok[ok.length - 1].ts - ok[0].ts : 0;
    chart.options.scales.x.time.unit = span > 2 * DAY ? 'day' : 'hour';
    chart.update();
    $('#sp-chart-empty').hidden = ok.length > 0;
  }

  async function load() {
    try { data = await getJSON('/api/speedtest'); } catch (_) { return; }
    if (page !== self) return;
    renderStatus();
    renderHistory();
    clearTimeout(timer);
    if (data.status?.running) timer = setTimeout(load, 700);
  }

  async function go() {
    $('#sp-go').disabled = true;
    try {
      await postJSON('/api/speedtest/run');
    } catch (err) {
      toast({ kind: 'error', message: err.message });
    }
    load();
  }

  const self = {
    mount(el) {
      el.innerHTML = `
        <div class="grid sp-top">
          <div class="card sp-hero">
            <div class="sp-dial">
              <svg viewBox="0 0 200 200" aria-hidden="true">
                <defs><linearGradient id="sp-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#39D6A0"/><stop offset=".5" stop-color="#41D8EF"/><stop offset="1" stop-color="#A78BFA"/></linearGradient></defs>
                <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(28,46,74,.9)" stroke-width="10"/>
                <circle id="sp-ring" cx="100" cy="100" r="88" fill="none" stroke="url(#sp-grad)" stroke-width="10" stroke-linecap="round" style="stroke-dasharray:0 553"/>
              </svg>
              <div class="sp-dial-in"><div id="sp-live"></div><div class="sp-live-sub" id="sp-live-sub"></div></div>
            </div>
            <div class="sp-side">
              <button class="sp-go" id="sp-go" type="button">${icon('speed')}<span id="sp-go-label">เริ่มวัด</span></button>
              <div class="health-bar sp-prog" hidden><div id="sp-prog" style="width:0"></div></div>
              <div class="card-sub" id="sp-auto"></div>
              <div class="card-sub">เซิร์ฟเวอร์: speed.cloudflare.com · ใช้เวลาราว 20 วินาที</div>
              <div class="sp-err c-crit" id="sp-err" hidden></div>
            </div>
          </div>
          <div class="sp-stats">
            ${statCard('down', 'down', 'ดาวน์โหลด')}
            ${statCard('up', 'up', 'อัปโหลด')}
            ${statCard('ping', 'timer', 'Ping')}
            ${statCard('jit', 'jitter', 'Jitter')}
          </div>
        </div>
        <div class="card mt">
          <div class="card-head"><div>${cardTitle('trend', 'ความเร็วย้อนหลัง')}<div class="card-sub" style="margin:2px 0 0 34px">เส้นประ = ความเร็วตามแพ็กเกจ (ตั้งได้ที่ Settings)</div></div></div>
          <div class="chart-box"><canvas id="sp-chart"></canvas><div class="chart-msg" id="sp-chart-empty" hidden>ยังไม่มีผลการวัด</div></div>
        </div>
        <div class="card mt">
          <div class="card-head">${cardTitle('list', 'ประวัติการวัด')}<span class="card-sub" id="sp-count"></span></div>
          <div class="tbl-wrap"><table class="tbl" id="sp-table"></table></div>
        </div>`;
      $('#sp-go').addEventListener('click', go);
      chart = makeLineChart($('#sp-chart'), { yTitle: 'Mbps' });
      load();
    },
    unmount() { clearTimeout(timer); chart?.destroy(); },
    onEvents(evts) { if (evts?.some((e) => e.kind === 'speedtest')) load(); },
  };
  return self;
};

/* ---------- 09 Reports ---------- */
PAGES.report = () => {
  let range = 'week', rep = null, chart = null, reqId = 0;
  const RANGES = {
    week: () => { const e = nowSec(); return [startOfDay(e) - 6 * DAY, e, '7 วันล่าสุด']; },
    month30: () => { const e = nowSec(); return [startOfDay(e) - 29 * DAY, e, '30 วันล่าสุด']; },
    thisMonth: () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return [d.getTime() / 1000, nowSec(), 'เดือนนี้']; },
    lastMonth: () => {
      const a = new Date(); a.setDate(1); a.setHours(0, 0, 0, 0); a.setMonth(a.getMonth() - 1);
      const b = new Date(a); b.setMonth(b.getMonth() + 1);
      return [a.getTime() / 1000, b.getTime() / 1000, 'เดือนที่แล้ว'];
    },
  };
  const CAUSE = {
    isp: ['ผู้ให้บริการ (ISP)', 'c-crit'], local: ['ในบ้าน (เราเตอร์)', 'c-warn'],
    wifi: ['Wi-Fi หลุด', 'c-warn'], wifi_weak: ['สัญญาณ Wi-Fi อ่อน', 'c-warn'], unknown: ['ไม่ทราบ', 'c-muted'],
  };
  const pctTxt = (v, d = 2) => (v === null || v === undefined ? '—' : `${v.toFixed(d)}%`);
  const fitChart = () => chart?.resize();  // กระดาษแคบกว่าจอ — ให้กราฟวาดใหม่ตามขนาดตอนพิมพ์
  const kpi = (label, val, sub = '', cls = '') => `<div class="card rp-kpi"><div class="kpi-label">${label}</div><div class="kpi-val ${cls}">${val}</div><div class="kpi-b">${sub}</div></div>`;

  function render() {
    const r = rep, s = r.summary, plan = r.plan;
    const ext = r.targets.filter((t) => t.kind !== 'gateway');
    const gw = r.targets.find((t) => t.kind === 'gateway');
    const cover = s.period_sec ? 100 * s.monitored_sec / s.period_sec : null;
    const pd = planPct(s.down_avg_bps, plan.down_mbps), pu = planPct(s.up_avg_bps, plan.up_mbps);
    const [, , label] = RANGES[range]();
    $('#rp-sheet').innerHTML = `
      <div class="rp-head">
        <div><h2>รายงานคุณภาพอินเทอร์เน็ต</h2>
          <div class="card-sub">${label}: ${fmtDateLong(r.start)} – ${fmtDateLong(Math.min(r.end, r.generated) - 1)} · สร้างเมื่อ ${fmtDT(r.generated)}</div></div>
        <div class="rp-meta card-sub">
          <div>เครื่องที่วัด: <b>${esc(S.overview?.hostname || '—')}</b>${S.overview?.local_ip ? ` (${esc(S.overview.local_ip)})` : ''}</div>
          <div>ปลายทางภายนอก: ${ext.map((t) => `${esc(t.name)} (${esc(t.host)})`).join(', ') || '—'}</div>
          <div>Gateway (เราเตอร์): ${gw ? esc(gw.host) : 'ไม่ได้วัด'} · วัดทุก ${S.cfg?.interval_sec ?? '—'} วินาที</div>
        </div>
      </div>
      <div class="grid rp-kpis">
        ${kpi('อินเทอร์เน็ตใช้ได้ (Uptime)', pctTxt(s.uptime_pct, 3), `ช่วงที่โปรแกรมทำงาน ${fmtDur(s.monitored_sec)} (${pctTxt(cover, 0)} ของช่วงรายงาน)`, s.uptime_pct !== null && s.uptime_pct < 99 ? 'c-warn' : '')}
        ${kpi('อินเทอร์เน็ตหลุด', `${s.outages}<small>ครั้ง</small>`, s.outages ? `รวม ${fmtDur(s.outage_sec)} · นานสุด ${fmtDur(s.longest_sec)}` : 'ไม่มีการหลุด', s.outages ? 'c-crit' : 'c-ok')}
        ${kpi('สาเหตุ', `${s.isp_outages}<small>ISP</small> · ${s.local_outages + s.wifi_outages}<small>ในบ้าน</small>`, gw ? `ในบ้าน = เราเตอร์ไม่ตอบ${s.has_wifi ? ` หรือ Wi-Fi มีปัญหา (${s.wifi_outages} ครั้ง)` : ''}ในช่วงเดียวกัน` : 'ไม่ได้วัด gateway จึงแยกสาเหตุไม่ได้')}
        ${kpi('Latency เฉลี่ย', s.avg_ms === null ? '—' : `${fmtMs(s.avg_ms)}<small>ms</small>`, `สูงสุด ${fmtMs(s.max_ms)} ms · เกินเกณฑ์ ${r.threshold_ms} ms ${s.high_latency} ครั้ง`)}
        ${kpi('Packet loss', pctTxt(s.loss_pct), 'ปลายทางภายนอก', s.loss_pct > 1 ? 'c-warn' : '')}
        ${kpi('ความเร็วเฉลี่ย', s.speedtests ? `${fmtMbps(s.down_avg_bps)}<small>↓</small> ${fmtMbps(s.up_avg_bps)}<small>↑ Mbps</small>` : '—',
          s.speedtests ? `${s.speedtests} ครั้ง · ต่ำสุด ↓${fmtMbps(s.down_min_bps)} ↑${fmtMbps(s.up_min_bps)}${pd !== null ? ` · ${pd.toFixed(0)}% ของแพ็กเกจ` : ''}` : 'ยังไม่มี speed test ในช่วงนี้', pctClass(pd))}
        ${s.has_wifi ? kpi('สัญญาณ Wi-Fi เฉลี่ย', s.wifi_signal === null ? '—' : `${s.wifi_signal.toFixed(0)}<small>%</small>`, s.wifi_down_sec ? `Wi-Fi หลุดรวมราว ${fmtDur(s.wifi_down_sec)}` : 'Wi-Fi ไม่หลุดเลย', sigClass(s.wifi_signal)) : ''}
        ${kpi('DNS ของเครื่อง', s.dns_ms === null ? '—' : `${fmtMs(s.dns_ms)}<small>ms</small>`, s.dns_ms === null ? 'ยังไม่มีข้อมูล' : `ไม่ตอบ ${pctTxt(s.dns_fail_pct)}${s.dns_public_ms !== null ? ` · DNS สาธารณะ ${fmtMs(s.dns_public_ms)} ms` : ''}`, s.dns_ms > 100 || s.dns_fail_pct > 2 ? 'c-warn' : '')}
      </div>
      <div class="card mt rp-chart-card">
        <div class="card-head">${cardTitle('history', 'รายวัน')}<span class="card-sub">แท่ง = นาทีที่หลุด · เส้น = latency เฉลี่ย</span></div>
        <div class="chart-box"><canvas id="rp-chart"></canvas></div>
      </div>
      <div class="card mt">
        <div class="card-head">${cardTitle('list', 'สรุปรายวัน')}</div>
        <div class="tbl-wrap"><table class="tbl rp-tbl">
          <thead><tr><th>วันที่</th><th class="num">วัดได้</th><th class="num">Uptime</th><th class="num">หลุด</th><th class="num">รวมเวลาหลุด</th><th class="num">Latency เฉลี่ย</th><th class="num">สูงสุด</th><th class="num">Loss</th><th class="num">Wi-Fi</th><th class="num">DNS</th><th class="num">↓ Mbps</th><th class="num">↑ Mbps</th></tr></thead>
          <tbody>${r.days.slice().reverse().map((d) => `<tr class="${d.monitored_sec ? '' : 'rp-empty'}">
            <td>${fmtDay(d.day)}</td><td class="num">${d.monitored_sec ? fmtDur(d.monitored_sec) : '—'}</td>
            <td class="num ${d.uptime_pct !== null && d.uptime_pct < 99 ? 'c-warn' : ''}">${pctTxt(d.uptime_pct)}</td>
            <td class="num ${d.outages ? 'c-crit' : ''}">${d.outages || '—'}</td><td class="num">${d.outage_sec ? fmtDur(d.outage_sec) : '—'}</td>
            <td class="num">${d.avg_ms === null ? '—' : fmtMs(d.avg_ms) + ' ms'}</td><td class="num">${d.max_ms === null ? '—' : fmtMs(d.max_ms) + ' ms'}</td>
            <td class="num">${pctTxt(d.loss_pct)}</td>
            <td class="num ${sigClass(d.wifi_signal)}">${d.wifi_signal === null ? '—' : d.wifi_signal.toFixed(0) + '%'}</td>
            <td class="num ${d.dns_ms > 100 ? 'c-warn' : ''}">${d.dns_ms === null ? '—' : fmtMs(d.dns_ms) + ' ms'}</td>
            <td class="num">${fmtMbps(d.speed_down_bps)}</td><td class="num">${fmtMbps(d.speed_up_bps)}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="card mt">
        <div class="card-head">${cardTitle('alert', 'รายการที่อินเทอร์เน็ตหลุด')}<span class="card-sub">ทุกปลายทางภายนอกไม่ตอบพร้อมกัน</span></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>#</th><th>เริ่ม</th><th>กลับมา</th><th class="num">นาน</th><th>สาเหตุที่น่าจะเป็น</th></tr></thead>
          <tbody>${r.outages.length ? r.outages.map((o, i) => `<tr><td class="mono">${i + 1}</td><td class="mono">${fmtDT(o.start)}</td>
            <td class="mono">${o.ongoing ? '<span class="c-crit">ยังหลุดอยู่</span>' : fmtDT(o.end)}</td><td class="num">${fmtDur(o.sec)}</td>
            <td class="${CAUSE[o.cause][1]}">${CAUSE[o.cause][0]}${o.wifi ? ` <span class="c-muted">(Wi-Fi ${o.wifi === 'wifi' ? 'หลุด' : 'อ่อน'}ด้วย)</span>` : ''}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">ไม่มีการหลุดในช่วงนี้</td></tr>'}</tbody>
        </table></div>
      </div>
      <div class="card mt">
        <div class="card-head">${cardTitle('speed', 'ผล Speed test')}${plan.down_mbps ? `<span class="card-sub">แพ็กเกจ ${plan.down_mbps}/${plan.up_mbps || '—'} Mbps</span>` : ''}</div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>เวลา</th><th class="num">ดาวน์โหลด</th><th class="num">อัปโหลด</th><th class="num">Ping</th><th class="num">เทียบแพ็กเกจ</th></tr></thead>
          <tbody>${r.speedtests.length ? r.speedtests.slice().reverse().map((t) => t.error
            ? `<tr><td class="mono">${fmtDT(t.ts)}</td><td colspan="4" class="c-crit">${esc(t.error)}</td></tr>`
            : `<tr><td class="mono">${fmtDT(t.ts)}</td><td class="num">${fmtMbps(t.down_bps)} Mbps</td><td class="num">${fmtMbps(t.up_bps)} Mbps</td>
               <td class="num">${fmtMs(t.ping_ms)} ms</td><td class="num ${pctClass(planPct(t.down_bps, plan.down_mbps))}">${planPct(t.down_bps, plan.down_mbps)?.toFixed(0) ?? '—'}${plan.down_mbps ? '%' : ''}</td></tr>`).join('')
            : '<tr><td colspan="5" class="empty">ไม่มี speed test ในช่วงนี้ — วัดได้ที่หน้า Speed Test</td></tr>'}</tbody>
        </table></div>
      </div>
      <div class="rp-note card-sub">
        วิธีคิด: Network Pulse ping ปลายทางทุก ${S.cfg?.interval_sec ?? '—'} วินาที · “หลุด” เมื่อไม่ตอบติดกัน ${S.cfg?.down_after_failures ?? '—'} ครั้ง
        · นับว่าอินเทอร์เน็ตหลุดเมื่อปลายทางภายนอกทุกตัวหลุดพร้อมกัน · ถ้าเราเตอร์ในบ้านไม่ตอบด้วยในช่วงนั้น จะนับเป็นปัญหาในบ้าน ไม่ใช่ ISP
        · ถ้า Wi-Fi ของเครื่องนี้หลุดหรือสัญญาณต่ำกว่า 35% ในช่วงนั้น จะนับเป็นปัญหา Wi-Fi
        · Uptime คิดเฉพาะช่วงที่คอมเปิดและโปรแกรมทำงาน
      </div>`;
    chart?.destroy();
    chart = makeLineChart($('#rp-chart'), { tooltipFmt: 'EEE d MMM', type: 'bar' });
    if (chart) {
      const days = r.days;  // แสดงทุกวันในช่วง (วันที่ไม่ได้วัดเป็นช่องว่าง)
      chart.options.scales.x.min = r.days[0].day * 1000;
      chart.options.scales.x.max = (r.days[r.days.length - 1].day + DAY) * 1000;
      chart.options.scales.y.title = { display: true, text: 'นาทีที่หลุด' };
      chart.options.scales.y1 = { position: 'right', beginAtZero: true, grid: { display: false }, title: { display: true, text: 'ms' } };
      chart.data.datasets = [
        { type: 'bar', label: 'หลุด (นาที)', data: days.map((d) => ({ x: (d.day + DAY / 2) * 1000, y: d.monitored_sec ? +(d.outage_sec / 60).toFixed(1) : null })), backgroundColor: C.crit + 'AA', borderRadius: 4, maxBarThickness: 28, isFail: true },
        { type: 'line', label: 'Latency เฉลี่ย (ms)', yAxisID: 'y1', data: days.map((d) => ({ x: (d.day + DAY / 2) * 1000, y: d.avg_ms })), borderColor: C.primary, backgroundColor: C.primary, tension: .3, pointRadius: 3, borderWidth: 2, spanGaps: true },
      ];
      chart.update();
    }
  }

  async function load() {
    const [a, b] = RANGES[range]();
    const my = ++reqId;
    $('#rp-sheet').classList.add('loading');
    try {
      const d = await getJSON(`/api/report?start=${Math.floor(a)}&end=${Math.floor(b)}&tz=${-new Date().getTimezoneOffset() * 60}`);
      if (page !== self || my !== reqId) return;
      rep = d;
      render();
    } catch (err) {
      if (page === self) $('#rp-sheet').innerHTML = `<div class="card empty">โหลดรายงานไม่สำเร็จ: ${esc(err.message)}</div>`;
    }
    $('#rp-sheet').classList.remove('loading');
  }

  function csv() {
    if (!rep) return;
    const q = (v) => { const t = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const iso = (ts) => { const d = new Date(ts * 1000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${fmtClock(ts)}`; };
    const day = (ts) => iso(ts).slice(0, 10);
    const n = (v, d = 2) => (v === null || v === undefined ? '' : (+v).toFixed(d));
    const s = rep.summary;
    const rows = [
      ['Network Pulse - รายงานคุณภาพอินเทอร์เน็ต'], ['ช่วง', iso(rep.start), iso(Math.min(rep.end, rep.generated))], ['สร้างเมื่อ', iso(rep.generated)], [],
      ['สรุป'], ['Uptime (%)', n(s.uptime_pct, 3)], ['เวลาที่วัดได้ (วินาที)', s.monitored_sec], ['หลุด (ครั้ง)', s.outages], ['รวมเวลาหลุด (วินาที)', s.outage_sec],
      ['หลุดจาก ISP (ครั้ง)', s.isp_outages], ['หลุดจากในบ้าน (ครั้ง)', s.local_outages], ['Latency เฉลี่ย (ms)', n(s.avg_ms, 1)], ['Latency สูงสุด (ms)', n(s.max_ms, 1)],
      ['Packet loss (%)', n(s.loss_pct)], ['Speed test (ครั้ง)', s.speedtests], ['ดาวน์โหลดเฉลี่ย (Mbps)', n(mbps(s.down_avg_bps), 1)], ['อัปโหลดเฉลี่ย (Mbps)', n(mbps(s.up_avg_bps), 1)],
      ['แพ็กเกจ (Mbps)', rep.plan.down_mbps || '', rep.plan.up_mbps || ''],
      ['หลุดจาก Wi-Fi (ครั้ง)', s.wifi_outages], ['สัญญาณ Wi-Fi เฉลี่ย (%)', n(s.wifi_signal, 0)],
      ['DNS ของเครื่อง เฉลี่ย (ms)', n(s.dns_ms, 1)], ['DNS ไม่ตอบ (%)', n(s.dns_fail_pct)], [],
      ['รายวัน'], ['วันที่', 'วัดได้ (วินาที)', 'Uptime (%)', 'หลุด (ครั้ง)', 'เวลาหลุด (วินาที)', 'Latency เฉลี่ย (ms)', 'Latency สูงสุด (ms)', 'Loss (%)', 'Wi-Fi (%)', 'DNS (ms)', 'ดาวน์โหลด (Mbps)', 'อัปโหลด (Mbps)'],
      ...rep.days.map((d) => [day(d.day + 3600), d.monitored_sec, n(d.uptime_pct, 3), d.outages, d.outage_sec, n(d.avg_ms, 1), n(d.max_ms, 1), n(d.loss_pct), n(d.wifi_signal, 0), n(d.dns_ms, 1), n(mbps(d.speed_down_bps), 1), n(mbps(d.speed_up_bps), 1)]),
      [], ['รายการที่หลุด'], ['เริ่ม', 'กลับมา', 'นาน (วินาที)', 'สาเหตุ'],
      ...rep.outages.map((o) => [iso(o.start), o.ongoing ? 'ยังหลุดอยู่' : iso(o.end), o.sec, CAUSE[o.cause][0]]),
      [], ['Speed test'], ['เวลา', 'ดาวน์โหลด (Mbps)', 'อัปโหลด (Mbps)', 'Ping (ms)', 'Jitter (ms)', 'ข้อผิดพลาด'],
      ...rep.speedtests.map((t) => [iso(t.ts), n(mbps(t.down_bps), 1), n(mbps(t.up_bps), 1), n(t.ping_ms, 1), n(t.jitter_ms, 1), t.error || '']),
    ];
    const blob = new Blob(['﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `network-pulse-report-${day(rep.start)}_${day(Math.min(rep.end, rep.generated) - 1)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  const self = {
    mount(el) {
      el.innerHTML = `
        <div class="card no-print rp-bar">
          <div class="seg" id="rp-range"><button data-r="week" class="active">7 วันล่าสุด</button><button data-r="month30">30 วันล่าสุด</button><button data-r="thisMonth">เดือนนี้</button><button data-r="lastMonth">เดือนที่แล้ว</button></div>
          <div class="head-tools">
            <button class="btn" id="rp-csv" type="button">${icon('filedown')}ดาวน์โหลด CSV</button>
            <button class="btn btn-primary" id="rp-print" type="button">${icon('print')}พิมพ์ / บันทึก PDF</button>
          </div>
        </div>
        <div id="rp-sheet" class="rp-sheet mt"><div class="card empty">กำลังสร้างรายงาน…</div></div>`;
      $('#rp-range').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        range = b.dataset.r;
        [...$('#rp-range').children].forEach((x) => x.classList.toggle('active', x === b));
        load();
      });
      $('#rp-csv').addEventListener('click', csv);
      $('#rp-print').addEventListener('click', () => window.print());
      window.addEventListener('beforeprint', fitChart);
      window.addEventListener('afterprint', fitChart);
      if (!S.overview) loadOverview();
      load();
    },
    unmount() {
      chart?.destroy();
      window.removeEventListener('beforeprint', fitChart);
      window.removeEventListener('afterprint', fitChart);
    },
    onOverview() { if (rep) render(); },
  };
  return self;
};

/* ---------- อุปกรณ์ในวง LAN (อยู่ในหน้า Topology) ---------- */
function devicesPanel(isActive) {
  let data = null, timer = 0, filter = 'all', query = '', editing = null;
  const isRandom = (mac) => (parseInt(mac.slice(0, 2), 16) & 2) !== 0;
  const NEW_SEC = DAY;

  const html = `
    <div class="card mt" id="dv-card">
      <div class="card-head">
        <div>${cardTitle('device', 'อุปกรณ์ในวง LAN')}<div class="card-sub" id="dv-sub" style="margin:2px 0 0 34px">กำลังโหลด…</div></div>
        <div class="head-tools">
          <input class="inp" id="dv-q" type="search" placeholder="ค้นหา IP / ชื่อ / MAC" aria-label="ค้นหาอุปกรณ์">
          <button class="btn btn-primary" id="dv-scan" type="button">${icon('scan')}สแกนตอนนี้</button>
        </div>
      </div>
      <div class="dv-warn" id="dv-warn" hidden></div>
      <div class="dv-bar">
        <div class="seg" id="dv-filter"><button data-f="all" class="active">ทั้งหมด</button><button data-f="online">ออนไลน์</button><button data-f="unknown">ยังไม่รู้จัก</button><button data-f="new">ใหม่ (24 ชม.)</button></div>
        <span class="card-sub" id="dv-count"></span>
      </div>
      <div class="tbl-wrap dv-wrap"><table class="tbl" id="dv-table"></table></div>
    </div>`;

  function rows() {
    const last = data.last_scan?.ts ?? 0;
    const now = nowSec();
    const q = query.trim().toLowerCase();
    return data.devices.filter((d) => {
      if (filter === 'online' && d.last_seen < last) return false;
      if (filter === 'unknown' && d.known) return false;
      if (filter === 'new' && now - d.first_seen > NEW_SEC) return false;
      if (q && ![d.ip, d.mac, d.name, d.hostname].some((v) => (v || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }

  function render() {
    if (!data) return;
    const st = data.status || {};
    const ls = data.last_scan;
    const running = !!st.running;
    $('#dv-scan').disabled = running || !data.status;
    $('#dv-scan').innerHTML = running ? '<span class="spin"></span>กำลังสแกน…' : `${icon('scan')}สแกนตอนนี้`;
    $('#dv-sub').innerHTML = running ? 'กำลังส่ง ARP ไปทุก IP ในวง — ใช้เวลาราว 10–30 วินาที'
      : ls ? `สแกนล่าสุด ${fmtDT(ls.ts)} · วง <span class="mono">${esc(ls.subnet)}</span> · พบ ${ls.found} เครื่อง · ใช้ ${(ls.ms / 1000).toFixed(0)} วินาที`
        + (data.interval_min > 0 ? ` · สแกนอัตโนมัติทุก ${data.interval_min} นาที` : ' · สแกนอัตโนมัติ: ปิด')
        : 'ยังไม่เคยสแกน — กด “สแกนตอนนี้” เพื่อดูว่ามีอุปกรณ์อะไรต่ออยู่บ้าง';
    if (st.error && !running) $('#dv-sub').innerHTML += ` · <span class="c-crit">${esc(st.error)}</span>`;
    const big = ls && ls.found > 40;
    $('#dv-warn').hidden = !big;
    if (big) $('#dv-warn').innerHTML = `${icon('alert')}<div>วงนี้มีอุปกรณ์ ${ls.found} เครื่อง — น่าจะเป็นเครือข่ายของที่ทำงาน/มหาวิทยาลัย/หอพัก ไม่ใช่วงในบ้าน
      อุปกรณ์ส่วนใหญ่เป็นของคนอื่น และผู้ดูแลเครือข่ายอาจไม่อนุญาตให้สแกน${data.interval_min > 0 ? ' <b>ควรปิดการสแกนอัตโนมัติที่ Settings</b>' : ''}</div>`;
    const list = rows();
    const now = nowSec();
    const last = ls?.ts ?? 0;
    $('#dv-count').textContent = `${list.length} จาก ${data.devices.length} เครื่อง`;
    $('#dv-table').innerHTML = `<thead><tr><th></th><th>IP</th><th>ชื่อ</th><th>MAC</th><th>เห็นครั้งแรก</th><th>เห็นล่าสุด</th><th></th></tr></thead>
      <tbody>${list.length ? list.map((d) => {
        const online = d.last_seen >= last;
        const tags = [
          d.ip === data.self_ip ? '<span class="dv-tag t-self">เครื่องนี้</span>' : '',
          d.ip === data.gateway_ip ? '<span class="dv-tag t-gw">Router</span>' : '',
          now - d.first_seen <= NEW_SEC ? '<span class="dv-tag t-new">ใหม่</span>' : '',
          isRandom(d.mac) ? '<span class="dv-tag" title="MAC แบบสุ่ม — มักเป็นมือถือที่เปิด Private Wi-Fi Address">MAC สุ่ม</span>' : '',
          d.known ? '<span class="dv-tag t-known">รู้จักแล้ว</span>' : '',
        ].join('');
        const nameCell = editing === d.mac
          ? `<input class="inp dv-name-in" data-mac="${esc(d.mac)}" value="${esc(d.name || '')}" maxlength="40" placeholder="${esc(d.hostname || 'ตั้งชื่อ เช่น มือถือแม่')}">`
          : `<b>${esc(d.name || d.hostname || '')}</b>${d.name && d.hostname ? ` <span class="c-muted">${esc(d.hostname)}</span>` : ''}${!d.name && !d.hostname ? '<span class="c-muted">ไม่ทราบชื่อ</span>' : ''} ${tags}`;
        return `<tr class="${online ? '' : 'dv-off'}">
          <td><span class="dot ${online ? 'dot-ok' : ''}" title="${online ? 'ตอบในการสแกนล่าสุด' : 'ไม่ตอบในการสแกนล่าสุด'}"></span></td>
          <td class="mono">${esc(d.ip)}</td><td class="dv-name">${nameCell}</td><td class="mono c-muted">${esc(d.mac)}</td>
          <td class="mono">${fmtDT(d.first_seen)}</td><td class="mono">${online ? 'ออนไลน์' : fmtDT(d.last_seen)}</td>
          <td class="dv-act">
            <button class="btn btn-sm" data-act="name" data-mac="${esc(d.mac)}">ตั้งชื่อ</button>
            <button class="btn btn-sm ${d.known ? 'on' : ''}" data-act="known" data-mac="${esc(d.mac)}" data-v="${d.known ? 0 : 1}">${d.known ? '✓ รู้จัก' : 'รู้จักแล้ว'}</button>
            <button class="btn btn-sm btn-danger" data-act="del" data-mac="${esc(d.mac)}" title="ลบออกจากรายการ (ถ้ายังต่ออยู่จะกลับมาในการสแกนครั้งถัดไป)">ลบ</button>
          </td></tr>`;
      }).join('') : `<tr><td colspan="7" class="empty">${data.devices.length ? 'ไม่มีอุปกรณ์ที่ตรงกับตัวกรอง' : 'ยังไม่มีข้อมูล'}</td></tr>`}</tbody>`;
    const inp = $('.dv-name-in');
    if (inp) { inp.focus(); inp.select(); }
  }

  async function load() {
    try { data = await getJSON('/api/devices'); } catch (_) { return; }
    if (!isActive()) return;
    render();
    clearTimeout(timer);
    if (data.status?.running) timer = setTimeout(load, 1000);
  }

  async function act(fn) {
    try { await fn(); } catch (err) { toast({ kind: 'error', message: err.message }); }
    load();
  }

  function saveName(input) {
    const mac = input.dataset.mac, name = input.value.trim();
    editing = null;
    act(() => postJSON('/api/devices/update', { mac, name }));
  }

  return {
    html,
    mount() {
      $('#dv-scan').addEventListener('click', () => act(async () => { await postJSON('/api/devices/scan'); }));
      $('#dv-q').addEventListener('input', (e) => { query = e.target.value; render(); });
      $('#dv-filter').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        filter = b.dataset.f;
        [...$('#dv-filter').children].forEach((x) => x.classList.toggle('active', x === b));
        render();
      });
      const tbl = $('#dv-table');
      tbl.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-act]');
        if (!b) return;
        const mac = b.dataset.mac;
        if (b.dataset.act === 'name') { editing = mac; render(); }
        else if (b.dataset.act === 'known') act(() => postJSON('/api/devices/update', { mac, known: b.dataset.v === '1' }));
        else if (b.dataset.act === 'del' && confirm(`ลบ ${mac} ออกจากรายการ?`)) act(() => postJSON('/api/devices/delete', { mac }));
      });
      tbl.addEventListener('keydown', (e) => {
        if (!e.target.classList.contains('dv-name-in')) return;
        if (e.key === 'Enter') saveName(e.target);
        else if (e.key === 'Escape') { editing = null; render(); }
      });
      tbl.addEventListener('focusout', (e) => { if (e.target.classList.contains('dv-name-in') && editing) saveName(e.target); });
      load();
    },
    unmount() { clearTimeout(timer); },
    onEvents(evts) { if (evts?.some((e) => e.kind === 'new_device' || e.kind === 'lan_scan')) load(); },
  };
}

/* ---------- search (Ctrl+K) ---------- */
const SEARCH_EXTRA = [
  { label: 'Ping', sub: 'Network Tools', ic: 'prompt', href: '#/tools/ping' },
  { label: 'Traceroute', sub: 'Network Tools', ic: 'topology', href: '#/tools/trace' },
  { label: 'DNS Lookup', sub: 'Network Tools', ic: 'globe', href: '#/tools/dns' },
  { label: 'วัดความเร็วเน็ต (Speed test)', sub: 'Speed Test', ic: 'speed', href: '#/speed' },
  { label: 'รายงานสำหรับแจ้ง ISP', sub: 'Reports', ic: 'report', href: '#/report' },
  { label: 'อุปกรณ์ในวง LAN', sub: 'Topology', ic: 'device', href: '#/topology' },
  { label: 'IP Info', sub: 'Network Tools', ic: 'info', href: '#/tools/info' },
  { label: 'เปลี่ยนเป้าหมาย / เกณฑ์เตือน', sub: 'Settings', ic: 'settings', href: '#/settings' },
  { label: 'เข้าจากมือถือ / อุปกรณ์ที่ login', sub: 'Security', ic: 'security', href: '#/security' },
];
const HOST_LIKE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i;
let searchSel = 0, searchItems = [];

function searchResults(q) {
  const s = q.trim(), ql = s.toLowerCase();
  const out = [];
  if (HOST_LIKE.test(s)) {
    const h = encodeURIComponent(s);
    out.push({ label: `Ping ${s}`, sub: 'Network Tools', ic: 'prompt', href: `#/tools/ping/${h}` },
      { label: `Traceroute ${s}`, sub: 'Network Tools', ic: 'topology', href: `#/tools/trace/${h}` },
      { label: `DNS Lookup ${s}`, sub: 'Network Tools', ic: 'globe', href: `#/tools/dns/${h}` });
  }
  if (ql) {
    (S.status?.targets ?? []).forEach((t) => {
      if (`${t.name} ${t.host}`.toLowerCase().includes(ql) && t.host !== 'ไม่พบ') {
        out.push({ label: `Ping ${t.name}`, sub: t.host, ic: 'prompt', href: `#/tools/ping/${encodeURIComponent(t.host)}` });
      }
    });
  }
  const pages = NAV.map((n) => ({ label: n.label, sub: n.crumb, ic: n.id, href: `#/${n.id}` }));
  [...pages, ...SEARCH_EXTRA].forEach((it) => {
    if (!ql || `${it.label} ${it.sub}`.toLowerCase().includes(ql)) out.push(it);
  });
  return out.slice(0, 10);
}
function renderSearch() {
  const pop = $('#search-pop');
  searchItems = searchResults($('#search-in').value);
  searchSel = Math.min(searchSel, Math.max(0, searchItems.length - 1));
  pop.innerHTML = searchItems.length
    ? searchItems.map((it, i) => `<button class="sr ${i === searchSel ? 'sel' : ''}" type="button" data-i="${i}">${icon(it.ic)}<span>${esc(it.label)}</span><small>${esc(it.sub)}</small></button>`).join('')
    : '<div class="sr-empty">ไม่พบ — ลองพิมพ์ชื่อเมนู หรือ IP/โดเมนเพื่อ ping</div>';
  pop.hidden = false;
}
function closeSearch() { $('#search-pop').hidden = true; }
function pickSearch(i) {
  const it = searchItems[i];
  if (!it) return;
  closeSearch();
  $('#search-in').value = '';
  $('#search-in').blur();
  location.hash = it.href;
}
function setupSearch() {
  const inp = $('#search-in');
  inp.addEventListener('focus', () => { searchSel = 0; renderSearch(); });
  inp.addEventListener('input', () => { searchSel = 0; renderSearch(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); searchSel = Math.min(searchSel + 1, searchItems.length - 1); renderSearch(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); searchSel = Math.max(searchSel - 1, 0); renderSearch(); }
    else if (e.key === 'Enter') { e.preventDefault(); pickSearch(searchSel); }
    else if (e.key === 'Escape') { closeSearch(); inp.blur(); }
  });
  $('#search-pop').addEventListener('mousedown', (e) => {
    const b = e.target.closest('.sr');
    if (b) { e.preventDefault(); pickSearch(+b.dataset.i); }
  });
  inp.addEventListener('blur', () => setTimeout(closeSearch, 100));
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inp.focus(); inp.select(); }
  });
}

/* ---------- bell ---------- */
function setupBell() {
  const btn = $('#bell-btn'), pop = $('#bell-pop');
  const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!pop.hidden) { close(); return; }
    renderBellList();
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  });
  $('#bell-read').addEventListener('click', () => markSeen());
  pop.addEventListener('click', (e) => { if (e.target.closest('a')) { close(); markSeen(); } });
  document.addEventListener('click', (e) => { if (!pop.hidden && !e.target.closest('.bell-wrap')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  renderNotifButton();
  $('#notif-btn').addEventListener('click', async () => {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    await Notification.requestPermission();
    renderNotifButton();
  });
}

/* ---------- router ---------- */
function renderNav(active) {
  $('#nav').innerHTML = NAV.map((n) => `${n.sep ? '<div class="nav-sep"></div>' : ''}
    <a href="#/${n.id}" class="${n.id === active ? 'active' : ''}" ${n.id === active ? 'aria-current="page"' : ''}>
      ${icon(n.id)}<span>${n.label}</span>${n.badge ? `<span class="nav-badge" id="nav-badge-${n.id}" hidden></span>` : ''}
    </a>`).join('');
  renderBadges();
}

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map((p) => { try { return decodeURIComponent(p); } catch (_) { return p; } });
  return { id: parts[0] || 'overview', args: parts.slice(1).filter(Boolean) };
}

/* อนิเมชันตอนเปิดหน้า: การ์ดลอยขึ้นทีละใบ แล้วถอด class ออก
   เพื่อไม่ให้การ์ดที่ถูกวาดใหม่ภายหลังเล่นซ้ำ */
let enterTimer = 0;
function animateIn(view) {
  clearTimeout(enterTimer);
  view.classList.remove('page-enter');
  void view.offsetWidth;
  [...view.querySelectorAll('.card')].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 12)));
  view.classList.add('page-enter');
  enterTimer = setTimeout(() => view.classList.remove('page-enter'), 1800);
}

let currentId = null;
function route() {
  const { id, args } = parseHash();
  const item = NAV.find((n) => n.id === id) || NAV[0];
  if (item.id === currentId) { page?.onArgs?.(args); return; }
  if (page?.isDirty?.() && !confirm('ยังไม่ได้บันทึกการตั้งค่า — ออกจากหน้านี้เลยไหม?')) {
    history.replaceState(null, '', `#/${currentId}`);
    return;
  }
  currentId = item.id;
  try { page?.unmount?.(); } catch (_) { }
  renderNav(item.id);
  $('#page-title').textContent = item.label;
  $('#crumb').innerHTML = `<span class="mono">${item.num}</span> / ${esc(item.crumb)}`;
  document.title = `${item.label} · Network Pulse`;
  const view = $('#view');
  view.scrollTop = 0;
  page = PAGES[item.id]();
  page.mount(view, args);
  animateIn(view);
  const pt = $('#page-title');
  pt.classList.remove('title-anim'); void pt.offsetWidth; pt.classList.add('title-anim');
  if (item.id === 'events') markSeen();
}

/* ---------- boot ---------- */
async function boot() {
  tickClock();
  setInterval(tickClock, 1000);
  setupSearch();
  setupBell();
  $('#logout-btn').addEventListener('click', async () => {
    try { await postJSON('/api/logout'); } catch (_) { }
    toLogin();
  });
  await loadConfig();
  setInterval(loadConfig, 60000);
  loadRecentEvents();
  setInterval(loadRecentEvents, 30000);
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => {
    if (page?.isDirty?.()) { e.preventDefault(); e.returnValue = ''; }
  });
  route();
  poll();
}
boot();
