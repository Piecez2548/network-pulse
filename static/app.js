/* Network Pulse — frontend (vanilla JS + Chart.js) */
'use strict';

const C = {
  ok: '#39D6A0', warn: '#EFB65B', crit: '#F0526E', primary: '#41D8EF',
  text: '#DCE7F5', muted: '#71849E', border: '#203047', surface: '#0E1828',
};
const TARGET_COLORS = ['#41D8EF', '#A78BFA', '#DCE7F5', '#F9A8D4', '#7DD3FC', '#FCD34D'];
const POLL_MS = 2000;
const BUFFER_SEC = 3600;

const ICONS = {
  overview: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  live: '<path d="M2 12h4l3-7 4 14 3-9 2 2h4"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  events: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  compare: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  security: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
const icon = (id) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id]}</svg>`;

const NAV = [
  { id: 'overview', num: '01', label: 'Overview', crumb: 'ภาพรวมเครือข่าย' },
  { id: 'live', num: '02', label: 'Live Monitor', crumb: 'กราฟ latency แบบสด' },
  { id: 'history', num: '03', label: 'History', crumb: 'ข้อมูลย้อนหลัง' },
  { id: 'events', num: '04', label: 'Events', crumb: 'บันทึกเหตุการณ์' },
  { id: 'compare', num: '05', label: 'Compare', crumb: 'เทียบช่วงเวลา' },
  { id: 'security', num: '06', label: 'Security', crumb: 'การเข้าสู่ระบบและอุปกรณ์' },
  { id: 'settings', num: '07', label: 'Settings', crumb: 'ตั้งค่าการวัดและการแจ้งเตือน' },
];

const KIND = {
  down: { label: 'หลุด', title: 'การเชื่อมต่อหลุด', color: C.crit, dot: 'dot-crit' },
  up: { label: 'กลับมา', title: 'เชื่อมต่อกลับมาแล้ว', color: C.ok, dot: 'dot-ok' },
  high_latency: { label: 'Latency สูง', title: 'Latency สูง', color: C.warn, dot: 'dot-warn' },
  latency_ok: { label: 'Latency ปกติ', title: 'Latency กลับเป็นปกติ', color: C.primary, dot: '' },
  gap: { label: 'ไม่มีข้อมูล', title: 'ช่วงที่ไม่มีข้อมูล', color: C.muted, dot: '' },
  auth: { label: 'เข้าสู่ระบบ', title: 'มีการเข้าสู่ระบบ', color: C.primary, dot: '' },
  auth_lock: { label: 'ล็อก login', title: 'ใส่รหัสผิดหลายครั้ง', color: C.crit, dot: 'dot-crit' },
  settings: { label: 'ตั้งค่า', title: 'แก้การตั้งค่า', color: C.text, dot: '' },
};
const QUIET_KINDS = new Set(['gap', 'auth', 'settings']);  // แสดงเป็น toast เท่านั้น ไม่ส่ง Browser Notification
const STATUS_TEXT = { online: 'Online', degraded: 'Degraded', offline: 'Offline', unknown: 'Unknown' };
const STATUS_TH = { online: 'ออนไลน์', degraded: 'ไม่เสถียร', offline: 'ออฟไลน์', unknown: 'ไม่ทราบสถานะ' };

/* ---------- state ---------- */
const S = {
  cfg: null,
  ids: [],
  rounds: [],          // [ts, lat0, lat1, ...]  (null = ไม่ตอบ, "x" = ไม่ได้วัด)
  status: null,
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
const thr = () => S.cfg?.latency_threshold_ms ?? 200;
const msClass = (v) => v === null ? 'crit' : v > thr() ? 'warn' : '';
const targetName = (id) => S.cfg?.targets.find((t) => t.id === id)?.name ?? id;
const targetColor = (i) => TARGET_COLORS[i % TARGET_COLORS.length];

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

/* ---------- charts ---------- */
const chartReady = () => typeof window.Chart !== 'undefined';
if (chartReady()) {
  Chart.defaults.color = C.muted;
  Chart.defaults.borderColor = 'rgba(32,48,71,.6)';
  Chart.defaults.font.family = '"JetBrains Mono", Consolas, monospace';
  Chart.defaults.font.size = 11;
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

function makeChart(canvas, { lossAxis = false, tooltipFmt = 'd MMM HH:mm:ss' } = {}) {
  if (!chartReady()) {
    canvas.insertAdjacentHTML('afterend', '<div class="chart-msg">โหลด Chart.js ไม่ได้<br>ต้องต่ออินเทอร์เน็ตตอนเปิดหน้าเว็บ</div>');
    return null;
  }
  const scales = {
    x: {
      type: 'time',
      time: { tooltipFormat: tooltipFmt, displayFormats: { second: 'HH:mm:ss', minute: 'HH:mm', hour: 'HH:mm', day: 'd MMM' } },
      ticks: { maxRotation: 0, autoSkipPadding: 24 },
      grid: { color: 'rgba(32,48,71,.45)' },
    },
    y: {
      beginAtZero: true,
      grace: '10%',
      ticks: { callback: (v) => `${v} ms` },
      grid: { color: 'rgba(32,48,71,.45)' },
    },
  };
  if (lossAxis) {
    scales.y1 = {
      position: 'right', min: 0, max: 100,
      ticks: { callback: (v) => `${v}%`, stepSize: 25 },
      grid: { display: false },
      title: { display: true, text: 'loss', color: C.muted },
    };
  }
  return new Chart(canvas, {
    type: 'line',
    data: { datasets: [] },
    plugins: [thresholdPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      normalized: true,
      spanGaps: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      elements: { point: { radius: 0, hoverRadius: 3 }, line: { borderWidth: 1.6, tension: 0.25 } },
      scales,
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded', font: { family: 'Inter, "Noto Sans Thai", sans-serif', size: 12 } },
        },
        tooltip: {
          backgroundColor: '#122036', borderColor: C.border, borderWidth: 1,
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

/** แปลง rounds ในช่วงเวลา เป็น datasets ของ Chart.js (เว้นช่องเมื่อขาดข้อมูล) */
function liveDatasets(startTs) {
  const gapSec = Math.max(3 * (S.cfg?.interval_sec ?? 2), 6);
  const sets = [];
  const fails = [];
  S.ids.forEach((id, i) => {
    const data = [];
    let prev = null;
    for (const r of S.rounds) {
      if (r[0] < startTs) continue;
      const v = r[1 + i];
      if (v === 'x') continue;
      if (prev !== null && r[0] - prev > gapSec) data.push({ x: (prev + 1) * 1000, y: null });
      data.push({ x: r[0] * 1000, y: v });
      if (v === null) fails.push({ x: r[0] * 1000, y: 0 });
      prev = r[0];
    }
    sets.push({ label: targetName(id), data, borderColor: targetColor(i), backgroundColor: targetColor(i) });
  });
  sets.push({
    label: 'ไม่ตอบ', isFail: true, data: fails, showLine: false,
    pointStyle: 'crossRot', pointRadius: 5, pointHoverRadius: 6, borderWidth: 2,
    borderColor: C.crit, backgroundColor: C.crit,
  });
  return sets;
}

/* ---------- notifications & toasts ---------- */
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
  page?.onEvents?.(events);
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
  btn.textContent = p === 'granted' ? '🔔 แจ้งเตือน: เปิด' : p === 'denied' ? 'แจ้งเตือนถูกบล็อก' : 'เปิดการแจ้งเตือน';
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
    $('#sb-db').textContent = `DB ${fmtBytes(S.cfg.db_bytes)}`;
    $('#sb-listen').textContent = S.cfg.listen;
    $('#sb-interval').textContent = `ทุก ${S.cfg.interval_sec} วินาที · เตือนเมื่อ > ${S.cfg.latency_threshold_ms} ms`;
    $('#side-foot').textContent = `v${S.cfg.version} · Phase 2`;
    $('#logout-btn').hidden = !S.cfg.auth_enabled;
    const lan = S.cfg.lan;
    $('#sb-lan').textContent = lan.bound ? `LAN ${lan.ip}:${S.cfg.listen.split(':').pop()}` : '';
  } catch (_) { /* จะลองใหม่รอบถัดไป */ }
}

function renderChrome() {
  const pill = $('#overall-pill');
  const st = S.connected ? (S.status?.overall?.status ?? 'unknown') : 'unknown';
  pill.className = `pill pill-${st}`;
  pill.querySelector('.dot').classList.toggle('pulse', st === 'online');
  $('#overall-text').textContent = S.connected ? STATUS_TEXT[st] : 'ไม่เชื่อมต่อเซิร์ฟเวอร์';

  const dot = $('#sb-dot');
  const beat = S.status?.last_beat;
  const alive = S.connected && beat && S.serverNow - beat <= 3 * (S.cfg?.interval_sec ?? 2) + 3;
  dot.className = `dot ${alive ? 'dot-ok pulse' : 'dot-crit'}`;
  $('#sb-mon').textContent = !S.connected ? 'ติดต่อเซิร์ฟเวอร์ไม่ได้ — โปรแกรมปิดอยู่?'
    : alive ? `กำลังเฝ้าระวัง ${S.ids.length} เป้าหมาย` : 'ตัววัดไม่ทำงาน';
  $('#sb-last').textContent = beat ? `วัดล่าสุด ${fmtClock(beat)}` : '';
}

/* ---------- shared fragments ---------- */
function eventItem(e) {
  const k = KIND[e.kind] || KIND.gap;
  const when = e.kind === 'gap' && e.ts_end ? `${fmtDT(e.ts)} → ${fmtClock(e.ts_end)}` : fmtDT(e.ts);
  return `<li><span class="dot ${k.dot}" style="${k.dot ? '' : `background:${k.color}`}"></span>
    <div><div class="ev-msg">${esc(e.message)}</div><div class="ev-time">${when}</div></div></li>`;
}
function statePill(t) {
  if (t.state === 'down') return '<span class="pill pill-offline"><span class="dot"></span>Offline</span>';
  if (t.state === 'unknown') return '<span class="pill pill-unknown"><span class="dot"></span>Unknown</span>';
  if (t.high) return '<span class="pill pill-degraded"><span class="dot"></span>High latency</span>';
  if (t.fail_streak > 0) return '<span class="pill pill-degraded"><span class="dot"></span>Packet loss</span>';
  return '<span class="pill pill-online"><span class="dot pulse"></span>Online</span>';
}

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
function historyDatasets(h) {
  const sets = [];
  const lossByBucket = new Map();
  h.targets.forEach((id, i) => {
    const data = [];
    let prev = null;
    for (const [bk, avg, , loss] of h.series[id]) {
      if (prev !== null && bk - prev > h.bucket * 1.5) data.push({ x: (prev + h.bucket) * 1000, y: null });
      data.push({ x: bk * 1000, y: avg });
      lossByBucket.set(bk, Math.max(lossByBucket.get(bk) ?? 0, loss ?? 0));
      prev = bk;
    }
    sets.push({ label: targetName(id), data, borderColor: targetColor(i), backgroundColor: targetColor(i), pointRadius: dotsIfSparse(data) });
  });
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

/* ---------- pages ---------- */
const PAGES = {};

PAGES.overview = () => {
  let chart = null, updCards = null, hist = null, timers = [];
  const loadHistory = async () => {
    try {
      const end = nowSec();
      hist = await getJSON(`/api/history?start=${end - 86400}&end=${end}`);
      if (chart) {
        chart.data.datasets = historyDatasets(hist);
        chart.options.scales.x.min = (end - 86400) * 1000;
        chart.options.scales.x.max = end * 1000;
        chart.update('none');
      }
      renderKpis();
    } catch (_) { /* ลองใหม่รอบหน้า */ }
  };
  const loadEvents = async () => {
    try {
      const d = await getJSON('/api/events?limit=8');
      $('#ov-events').innerHTML = d.events.length ? d.events.map(eventItem).join('') : '<div class="empty">ยังไม่มีเหตุการณ์ — ทุกอย่างปกติ</div>';
    } catch (_) { }
  };
  const renderKpis = () => {
    if (!hist) return;
    const t = summaryTotals(hist);
    const coverage = Math.min(100, 100 * hist.monitored_sec / 86400);
    $('#ov-kpis').innerHTML = [
      ['สำเร็จ (24 ชม.)', t.health === null ? '—' : t.health.toFixed(2), '%'],
      ['Latency เฉลี่ย', fmtMs(t.avg), 'ms'],
      ['Latency สูงสุด', fmtMs(t.max), 'ms'],
      ['หลุด (ครั้ง)', String(t.outages), ''],
      ['เวลาที่บันทึกได้', coverage.toFixed(0), '% ของ 24 ชม.'],
    ].map(([l, v, u]) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val">${v}<small>${u}</small></div></div>`).join('');
    const hv = $('#ov-health');
    hv.textContent = t.health === null ? '—' : `${t.health.toFixed(2)}%`;
    hv.className = `health-val ${t.health !== null && t.health < 95 ? 'c-crit' : t.health !== null && t.health < 99 ? 'c-warn' : 'c-ok'}`;
    $('#ov-health-bar').style.width = `${t.health ?? 0}%`;
    $('#ov-health-bar').style.background = t.health !== null && t.health < 95 ? C.crit : t.health !== null && t.health < 99 ? C.warn : C.ok;
  };
  return {
    mount(el) {
      el.innerHTML = `
        <div class="card hero">
          <div class="hero-status">
            <span class="dot" id="ov-dot"></span>
            <div><div class="hero-big" id="ov-status">—</div><div class="hero-detail" id="ov-detail">กำลังโหลด…</div></div>
          </div>
          <div class="health">
            <div class="kpi-label">Network Health · 24 ชม.</div>
            <div class="health-val" id="ov-health">—</div>
            <div class="health-bar"><div id="ov-health-bar" style="width:0"></div></div>
          </div>
        </div>
        <div class="grid targets mt" id="ov-targets"></div>
        <div class="grid kpis mt" id="ov-kpis"></div>
        <div class="grid two-col mt">
          <div class="card">
            <div class="card-head"><div><div class="card-title">Latency · 24 ชั่วโมงล่าสุด</div><div class="card-sub">ค่าเฉลี่ยรายนาที · ช่องว่างในกราฟ = คอมปิด/โปรแกรมไม่ทำงาน</div></div></div>
            <div class="chart-box"><canvas id="ov-chart"></canvas></div>
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">เหตุการณ์ล่าสุด</div><a href="#/events" class="card-sub">ดูทั้งหมด →</a></div>
            <ul class="ev-list" id="ov-events"><div class="empty">กำลังโหลด…</div></ul>
          </div>
        </div>`;
      updCards = targetCards($('#ov-targets'), 300, '5 นาทีล่าสุด');
      chart = makeChart($('#ov-chart'), { lossAxis: true, tooltipFmt: 'd MMM HH:mm' });
      loadHistory(); loadEvents();
      timers.push(setInterval(loadHistory, 60000), setInterval(loadEvents, 30000));
      this.update();
    },
    update() {
      const st = S.connected ? (S.status?.overall?.status ?? 'unknown') : 'unknown';
      const colors = { online: 'dot-ok pulse', degraded: 'dot-warn', offline: 'dot-crit' };
      $('#ov-dot').className = `dot ${colors[st] ?? ''}`;
      $('#ov-status').textContent = S.connected ? STATUS_TH[st] : 'ติดต่อเซิร์ฟเวอร์ไม่ได้';
      $('#ov-status').className = `hero-big ${st === 'online' ? 'c-ok' : st === 'degraded' ? 'c-warn' : st === 'offline' ? 'c-crit' : ''}`;
      $('#ov-detail').textContent = S.connected ? (S.status?.overall?.detail ?? '') : 'ตรวจว่าโปรแกรม Network Pulse ยังเปิดอยู่';
      if (!$('#ov-targets').children.length && S.status) updCards = targetCards($('#ov-targets'), 300, '5 นาทีล่าสุด');
      updCards?.();
    },
    onEvents() { loadEvents(); },
    unmount() { timers.forEach(clearInterval); chart?.destroy(); },
  };
};

PAGES.live = () => {
  let chart = null, updCards = null, win = 300;
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
      this.update();
    },
    update() {
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
    unmount() { chart?.destroy(); },
  };
};

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
      $('#hs-events').innerHTML = ev.events.length ? ev.events.map(eventItem).join('') : '<div class="empty">ไม่มีเหตุการณ์ในช่วงนี้</div>';
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
      const groups = { all: null, down: ['down', 'up'], latency: ['high_latency', 'latency_ok'], gap: ['gap'], sec: ['auth', 'auth_lock', 'settings'] };
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
              <button data-f="all" class="active">ทั้งหมด</button><button data-f="down">หลุด/กลับมา</button><button data-f="latency">Latency</button><button data-f="gap">ไม่มีข้อมูล</button><button data-f="sec">ระบบ/ความปลอดภัย</button>
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
              <div class="notice info">มือถือจะเห็นการแจ้งเตือนเป็นป๊อปอัปในหน้าเว็บ — Browser Notification ใช้ได้เฉพาะบนเครื่องนี้ (localhost)</div>`
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
  ];
  const UNITS = { interval_sec: 'วินาที', ping_timeout_ms: 'ms', down_after_failures: 'ครั้ง', latency_threshold_ms: 'ms',
    latency_consecutive: 'รอบ', latency_recover_consecutive: 'รอบ', raw_retention_days: 'วัน', session_days: 'วัน' };

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

function soonPage(item) {
  return {
    mount(el) {
      el.innerHTML = `<div class="card soon"><div>${icon(item.id)}<h2>เร็วๆ นี้</h2><p>${esc(item.soon)}</p></div></div>`;
    },
  };
}

/* ---------- router ---------- */
function renderNav(active) {
  $('#nav').innerHTML = NAV.map((n) => `
    <a href="#/${n.id}" class="${n.id === active ? 'active' : ''}">
      <span class="num">${n.num}</span>${icon(n.id)}<span>${n.label}</span>${n.soon ? '<span class="soon-tag">เร็วๆ นี้</span>' : ''}
    </a>`).join('');
}

let currentId = null;
function route() {
  const id = location.hash.replace(/^#\/?/, '') || 'overview';
  const item = NAV.find((n) => n.id === id) || NAV[0];
  if (item.id === currentId) return;
  if (page?.isDirty?.() && !confirm('ยังไม่ได้บันทึกการตั้งค่า — ออกจากหน้านี้เลยไหม?')) {
    history.replaceState(null, '', `#/${currentId}`);
    return;
  }
  currentId = item.id;
  try { page?.unmount?.(); } catch (_) { }
  renderNav(item.id);
  $('#page-title').textContent = item.label;
  $('#crumb').textContent = `${item.num} · ${item.crumb}`;
  document.title = `${item.label} · Network Pulse`;
  const view = $('#view');
  view.scrollTop = 0;
  page = item.soon ? soonPage(item) : PAGES[item.id]();
  page.mount(view);
}

/* ---------- boot ---------- */
async function boot() {
  setInterval(() => { $('#clock').textContent = fmtClock(nowSec()); }, 1000);
  $('#clock').textContent = fmtClock(nowSec());
  renderNotifButton();
  $('#notif-btn').addEventListener('click', async () => {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    await Notification.requestPermission();
    renderNotifButton();
  });
  $('#logout-btn').addEventListener('click', async () => {
    try { await postJSON('/api/logout'); } catch (_) { }
    toLogin();
  });
  await loadConfig();
  setInterval(loadConfig, 60000);
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => {
    if (page?.isDirty?.()) { e.preventDefault(); e.returnValue = ''; }
  });
  route();
  poll();
}
boot();
