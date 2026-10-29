'use strict';

/* =========================================================
   Habits — a colorful, offline habit tracker (PWA)
   All data lives in this device's localStorage.
   ========================================================= */

const STORE_KEY = 'habit-tracker-v1';
const SEED = [['Muscles', '💪'], ['Brain', '🧠'], ['Couch', '🛋️'], ['Canvas', '🎨'], ['Connections', '🤝']];
/* Fixed palette order, checked for color-blind separation between neighbors (see styles.css) */
const SLOT_NAMES = ['Coral red', 'Violet', 'Teal', 'Amber', 'Blue', 'Green', 'Pink'];
const RANGES = [[13, '3M'], [26, '6M'], [52, '1Y']];

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const pct = v => v == null ? '–' : Math.round(v * 100) + '%';

/* ---------- Dates (local calendar days as YYYY-MM-DD) ---------- */
const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
const todayKey = () => keyOf(new Date());
const weekStart = k => { const d = dateOf(k); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return keyOf(d); };
const fmt = (k, opts) => dateOf(k).toLocaleDateString(undefined, opts);

/* ---------- State ---------- */
let state = load();
save();

function seedState() {
  const t = todayKey();
  return {
    habits: SEED.map(([name, emoji], i) => ({ id: uid(), name, emoji, slot: i + 1, custom: null, createdAt: t, archived: false })),
    log: {},
  };
}
function valid(s) { return s && Array.isArray(s.habits) && s.log && typeof s.log === 'object'; }
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (valid(s)) return s;
  } catch (e) { /* fall through to a fresh start */ }
  return seedState();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save — storage is blocked or full'); }
}

const active = () => state.habits.filter(h => !h.archived);
const habitById = id => state.habits.find(h => h.id === id);
const isDone = (id, k) => (state.log[k] || []).includes(id);

function toggle(id, k) {
  const arr = state.log[k] || [];
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1); else arr.push(id);
  if (arr.length) state.log[k] = arr; else delete state.log[k];
  const h = habitById(id);
  if (h && k < h.createdAt) h.createdAt = k;
  save();
  return i < 0;
}

/* id -> Set of done date keys (future dates ignored) */
function index() {
  const t = todayKey();
  const m = new Map(state.habits.map(h => [h.id, new Set()]));
  for (const k in state.log) {
    if (k > t) continue;
    for (const id of state.log[k]) if (m.has(id)) m.get(id).add(k);
  }
  return m;
}

/* ---------- Stats ---------- */
function startOf(h, set) {
  let s = h.createdAt;
  for (const k of set) if (k < s) s = k;
  return s;
}
function currentStreak(set, t) {
  let k = set.has(t) ? t : addDays(t, -1), n = 0;
  while (set.has(k)) { n++; k = addDays(k, -1); }
  return n;
}
function bestStreak(set) {
  let best = 0;
  for (const k of set) {
    if (set.has(addDays(k, -1))) continue;
    let n = 0, d = k;
    while (set.has(d)) { n++; d = addDays(d, 1); }
    if (n > best) best = n;
  }
  return best;
}
/* Share of days done in the last `days` days, counting only days since the habit started.
   Today only counts once it is ticked, so mornings don't drag the rate down. */
function rate(set, start, t, days) {
  let done = 0, total = 0;
  for (let i = 0; i < days; i++) {
    const k = addDays(t, -i);
    if (k < start) break;
    if (set.has(k)) { done++; total++; }
    else if (k !== t) total++;
  }
  return total ? done / total : null;
}

/* ---------- Colors ---------- */
const cVar = h => h.custom || `var(--slot-${h.slot})`;
function luma(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255;
}
const onVar = h => h.custom ? (luma(h.custom) > 0.55 ? '#0b0b0b' : '#ffffff') : `var(--on-slot-${h.slot})`;
const vars = h => `--c:${cVar(h)};--on:${onVar(h)}`;
function nextSlot() {
  const used = new Set(active().map(h => h.slot));
  for (let s = 1; s <= SLOT_NAMES.length; s++) if (!used.has(s)) return s;
  return null;
}

/* ---------- UI state ---------- */
const ui = { tab: 'today', day: todayKey(), month: todayKey().slice(0, 7), filter: 'all', weeks: 26 };
let tips = [];
let crossData = null;

const CHECK = '<svg viewBox="0 0 24 24"><path d="M5.5 12.5l4 4 9-9.5"/></svg>';

function render() {
  if (ui.day > todayKey()) ui.day = todayKey();
  $('#title').textContent = { today: 'Today', calendar: 'Calendar', history: 'History' }[ui.tab];
  for (const b of document.querySelectorAll('.tabbar button')) {
    if (b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  for (const v of ['today', 'calendar', 'history']) $('#view-' + v).hidden = v !== ui.tab;
  hideTip();
  if (ui.tab === 'today') renderToday();
  else if (ui.tab === 'calendar') renderCalendar();
  else renderHistory();
}

/* ---------- Today ---------- */
function arcPath(cx, cy, r, a0, a1) {
  const p = a => { const t = (a - 90) * Math.PI / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; };
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
function ringSVG(hs, k) {
  const n = hs.length, gap = n > 1 ? 14 : 0;
  const segs = hs.map((h, i) => {
    const a0 = i * 360 / n + gap / 2, a1 = (i + 1) * 360 / n - gap / 2 - (n === 1 ? 0.01 : 0);
    const color = isDone(h.id, k) ? cVar(h) : 'var(--empty)';
    return `<path class="ring-seg" d="${arcPath(70, 70, 58, a0, a1)}" style="stroke:${color}" fill="none" stroke-width="14" stroke-linecap="round"/>`;
  }).join('');
  return `<svg viewBox="0 0 140 140" aria-hidden="true">${segs}</svg>`;
}

function renderToday() {
  const t = todayKey(), k = ui.day, hs = active(), idx = index();
  const done = hs.filter(h => isDone(h.id, k)).length;
  const dayName = k === t ? 'Today' : k === addDays(t, -1) ? 'Yesterday' : fmt(k, { weekday: 'long' });
  const cheer = !hs.length ? '' : done === hs.length ? 'All done! 🎉' : done ? 'Keep going' : 'Let’s start';
  $('#view-today').innerHTML = `
    <div class="daynav">
      <button class="icon-btn" data-act="day-prev" aria-label="Previous day">‹</button>
      <label class="daylabel">
        <span class="day-main">${dayName}</span>
        <span class="day-sub">${fmt(k, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        <input type="date" id="day-input" max="${t}" value="${k}" aria-label="Pick a day">
      </label>
      <button class="icon-btn" data-act="day-next" aria-label="Next day" ${k >= t ? 'disabled' : ''}>›</button>
    </div>
    ${hs.length ? `<div class="ring-wrap">${ringSVG(hs, k)}
      <div class="ring-text"><b>${done}/${hs.length}</b><span>${cheer}</span></div></div>` : ''}
    ${k !== t ? '<button class="back-today" data-act="day-today">Back to today</button>' : ''}
    <ul class="cards">${hs.map(h => card(h, k, idx.get(h.id), t)).join('')}</ul>
    ${hs.length ? '' : '<p class="empty-note">No habits yet. Add your first one!</p>'}
    <button class="add-btn" data-act="add">+ Add habit</button>`;
}

function card(h, k, set, t) {
  const done = set.has(k), streak = currentStreak(set, t);
  return `<li><div class="card${done ? ' done' : ''}" style="${vars(h)}" data-card="${h.id}">
    <button class="card-main" data-act="toggle" data-id="${h.id}" aria-pressed="${done}">
      <span class="emoji" aria-hidden="true">${esc(h.emoji || '•')}</span>
      <span class="card-text">
        <span class="name">${esc(h.name)}</span>
        <span class="meta">${streak ? `🔥 ${streak} day${streak > 1 ? 's' : ''} streak` : 'No streak yet'}</span>
      </span>
      <span class="check" aria-hidden="true">${CHECK}</span>
    </button>
    <button class="card-more" data-act="edit" data-id="${h.id}" aria-label="Edit ${esc(h.name)}">⋯</button>
  </div></li>`;
}

function confetti(x, y, h) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('i');
    p.className = 'confetti';
    const mix = [100, 100, 70, 45][i % 4];
    p.style.cssText = `${vars(h)};left:${x}px;top:${y}px;border-radius:${i % 3 ? '2px' : '50%'};` +
      `background:color-mix(in srgb, var(--c) ${mix}%, white)`;
    document.body.appendChild(p);
    const ang = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 70;
    const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 30;
    p.animate([
      { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 40}px)) scale(0.6) rotate(${Math.random() * 540 - 270}deg)`, opacity: 0 },
    ], { duration: 650 + Math.random() * 450, easing: 'cubic-bezier(.15,.7,.4,1)' }).onfinish = () => p.remove();
  }
}

/* ---------- Calendar ---------- */
function flowerSVG(hs, k, idx) {
  const n = hs.length;
  if (!n) return '';
  const rx = Math.max(6, Math.min(14, 75 / n)), ry = n > 1 ? 21 : 30;
  const petals = hs.map((h, i) => {
    const fill = idx.get(h.id).has(k) ? cVar(h) : 'var(--empty)';
    return `<ellipse cx="0" cy="${n > 1 ? -22 : 0}" rx="${n > 1 ? rx : 30}" ry="${ry}" transform="rotate(${i * 360 / n})" style="fill:${fill}"/>`;
  }).join('');
  return `<svg viewBox="-50 -50 100 100" aria-hidden="true">${petals}${n > 1 ? '<circle r="7" style="fill:var(--surface)"/>' : ''}</svg>`;
}

function renderCalendar() {
  const hs = active(), t = todayKey(), idx = index();
  if (ui.filter !== 'all' && !hs.some(h => h.id === ui.filter)) ui.filter = 'all';
  const single = ui.filter === 'all' ? null : habitById(ui.filter);
  const [y, m] = ui.month.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const daysIn = new Date(y, m, 0).getDate();
  const monthName = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const wd = [];
  for (let i = 0; i < 7; i++) wd.push(`<div class="wd">${new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' })}</div>`);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div></div>');
  for (let d = 1; d <= daysIn; d++) {
    const k = `${ui.month}-${pad(d)}`, future = k > t;
    const cls = ['cal-day'];
    if (k === t) cls.push('today');
    const nDone = hs.filter(h => idx.get(h.id).has(k)).length;
    let inner, label, style = '';
    if (single) {
      const done = idx.get(single.id).has(k);
      cls.push('solid');
      if (done) cls.push('done');
      style = vars(single);
      inner = `<span class="num">${d}</span>`;
      label = `${fmt(k, { day: 'numeric', month: 'long' })}: ${single.name} ${done ? 'done' : 'not done'}`;
    } else {
      if (hs.length && nDone === hs.length) cls.push('perfect');
      inner = `<span class="num">${d}</span>${future ? '' : flowerSVG(hs, k, idx)}`;
      label = `${fmt(k, { day: 'numeric', month: 'long' })}: ${nDone} of ${hs.length} done`;
    }
    cells.push(`<button class="${cls.join(' ')}" style="${style}" data-act="cal-day" data-k="${k}" aria-label="${esc(label)}" ${future ? 'disabled' : ''}>${inner}</button>`);
  }

  /* Monthly summary per habit */
  const monthStart = `${ui.month}-01`, monthEnd = `${ui.month}-${pad(daysIn)}`;
  const rows = hs.map(h => {
    const set = idx.get(h.id), start = startOf(h, set);
    let n = 0, total = 0;
    for (let d = 1; d <= daysIn; d++) {
      const k = `${ui.month}-${pad(d)}`;
      if (k > t) break;
      if (set.has(k)) { n++; total++; } else if (k >= start && k !== t) total++;
    }
    const w = total ? n / total * 100 : 0;
    return `<div class="sum-row" style="${vars(h)}">
      <span class="label"><span class="dot"></span>${esc(h.emoji || '')} ${esc(h.name)}</span>
      <span class="sum-bar"><i style="width:${w}%"></i></span>
      <span class="val">${n}/${total}</span></div>`;
  }).join('');

  const nowMonth = t.slice(0, 7);
  $('#view-calendar').innerHTML = `
    <div class="chips" role="group" aria-label="Show habit">
      <button class="chip" data-act="filter" data-id="all" aria-pressed="${!single}">All</button>
      ${hs.map(h => `<button class="chip" style="${vars(h)}" data-act="filter" data-id="${h.id}" aria-pressed="${single === h}">
        <span class="dot"></span>${esc(h.name)}</button>`).join('')}
    </div>
    <div class="card-box">
      <div class="monthnav">
        <button class="icon-btn" data-act="month-prev" aria-label="Previous month">‹</button>
        <h2>${monthName}</h2>
        <button class="icon-btn" data-act="month-next" aria-label="Next month" ${ui.month >= nowMonth ? 'disabled' : ''}>›</button>
      </div>
      <div class="cal" id="cal-grid">${wd.join('')}${cells.join('')}</div>
    </div>
    ${hs.length ? `<div class="card-box"><h2>This month</h2>
      <p class="sub">Days done out of days tracked${monthEnd < t ? '' : ' so far'}</p>
      <div class="month-sum">${rows}</div></div>` : ''}
    <p class="sub" style="text-align:center;color:var(--muted);font-size:13px">
      ${single ? 'Tap a day to tick or untick it.' : 'Tap a day to edit it.'}</p>`;
}

function shiftMonth(n) {
  const [y, m] = ui.month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  const next = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  if (next > todayKey().slice(0, 7)) return;
  ui.month = next;
  render();
}

/* ---------- History ---------- */
function chartWidth() {
  return Math.max(280, Math.min(528, $('main').clientWidth - 32) - 34);
}
const tip = html => (tips.push(html), tips.length - 1);
const tipRow = (h, val) => `<div class="t-row"><span class="dot" style="${vars(h)}"></span>${esc(h.name)}<b>${val}</b></div>`;

function legend(hs) {
  return `<div class="legend">${hs.map(h => `<span style="${vars(h)}"><span class="dot"></span>${esc(h.name)}</span>`).join('')}</div>`;
}

function barsSVG(hs, idx, t, weeks, W) {
  const H = 190, L = 26, R = 4, T = 8, B = 22;
  const iw = W - L - R, ih = H - T - B;
  const maxY = 7 * hs.length;
  const y = v => T + ih - v / maxY * ih;
  const slot = iw / weeks, bw = Math.max(3, Math.min(22, slot * 0.68));
  const end = weekStart(t);
  const step = 7 * Math.max(1, Math.ceil(hs.length / 3));
  let out = '';
  for (let v = step; v <= maxY; v += step) {
    out += `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  out += `<text x="${L - 6}" y="${y(0) + 4}" text-anchor="end">0</text>`;
  let lastLabelX = -99, lastMonth = '';
  for (let i = 0; i < weeks; i++) {
    const ws = addDays(end, -7 * (weeks - 1 - i));
    const x = L + slot * i + (slot - bw) / 2;
    const counts = hs.map(h => {
      const set = idx.get(h.id);
      let c = 0;
      for (let d = 0; d < 7; d++) if (set.has(addDays(ws, d))) c++;
      return c;
    });
    let acc = 0;
    const lastSeg = counts.reduce((a, c, j) => c ? j : a, -1);
    counts.forEach((c, j) => {
      if (!c) return;
      const y0 = y(acc), y1 = y(acc + c);
      acc += c;
      const top = y1 + (j === lastSeg ? 0 : 1), bottom = y0 - (acc - c === 0 ? 0 : 1);
      const hgt = Math.max(1, bottom - top);
      if (j === lastSeg) {
        const r = Math.min(4, bw / 2, hgt);
        out += `<path d="M${x} ${bottom}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + bw - r}Q${x + bw} ${top} ${x + bw} ${top + r}V${bottom}Z" style="fill:${cVar(hs[j])}"/>`;
      } else {
        out += `<rect x="${x}" y="${top}" width="${bw}" height="${hgt}" style="fill:${cVar(hs[j])}"/>`;
      }
    });
    const we = addDays(ws, 6);
    const head = `${fmt(ws, { day: 'numeric', month: 'short' })} – ${fmt(we, { day: 'numeric', month: 'short' })}`;
    const ti = tip(`<div class="t-head">${head}</div>${hs.map((h, j) => tipRow(h, `${counts[j]}/7`)).join('')}`);
    out += `<rect class="hit" x="${L + slot * i}" y="${T}" width="${slot}" height="${ih}" data-tip-i="${ti}"/>`;
    const mo = ws.slice(0, 7);
    if (mo !== lastMonth) {
      const lx = L + slot * i + slot / 2;
      if (lx - lastLabelX > 34 && i > 0) {
        out += `<text x="${lx}" y="${H - 6}" text-anchor="middle">${fmt(ws, { month: 'short' })}</text>`;
        lastLabelX = lx;
      }
      lastMonth = mo;
    }
  }
  out += `<line class="baseline" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Days done per week, stacked by habit">${out}</svg>`;
}

function trendSVG(hs, idx, t, weeks, W) {
  const H = 180, L = 34, R = 6, T = 10, B = 22;
  const iw = W - L - R, ih = H - T - B;
  const days = weeks * 7;
  const first = addDays(t, -(days - 1));
  const keys = [];
  for (let i = 0; i < days; i++) keys.push(addDays(first, i));
  const x = i => L + i / (days - 1) * iw;
  const y = v => T + ih - v * ih;

  let out = '';
  for (const v of [0.5, 1]) out += `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v * 100}%</text>`;
  out += `<text x="${L - 6}" y="${y(0) + 4}" text-anchor="end">0%</text>`;

  const series = hs.map(h => {
    const set = idx.get(h.id), start = startOf(h, set);
    const vals = keys.map(k => k < start ? null : rate(set, start, k, 30));
    let d = '', pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    return { h, vals, d };
  });
  for (const s of series) out += `<path class="series" d="${s.d}" style="stroke:${cVar(s.h)}"/>`;

  let lastMonth = keys[0].slice(0, 7), lastLabelX = -99;
  keys.forEach((k, i) => {
    if (k.slice(0, 7) !== lastMonth) {
      lastMonth = k.slice(0, 7);
      if (x(i) - lastLabelX > 34) { out += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${fmt(k, { month: 'short' })}</text>`; lastLabelX = x(i); }
    }
  });
  out += `<line class="baseline" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`;
  out += `<g id="cross" hidden><line class="cross" y1="${T}" y2="${T + ih}"/>${series.map(s => `<circle class="cross-dot" r="4.5" style="fill:${cVar(s.h)}"/>`).join('')}</g>`;
  out += `<rect class="hit" data-cross="1" x="${L}" y="${T}" width="${iw}" height="${ih}"/>`;
  crossData = { keys, series, x, y, L, iw, days };
  return `<svg class="chart" id="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rolling 30-day completion rate per habit">${out}</svg>`;
}

function heatmapSVG(h, set, t) {
  const weeks = 53, cell = 12, gap = 3, st = cell + gap, L = 20, T = 16;
  const end = weekStart(t), first = addDays(end, -7 * (weeks - 1));
  const start = startOf(h, set);
  const W = L + weeks * st, H = T + 7 * st;
  let out = '';
  ['M', '', 'W', '', 'F', '', ''].forEach((l, d) => { if (l) out += `<text x="0" y="${T + d * st + 10}">${l}</text>`; });
  let lastMonth = '';
  for (let w = 0; w < weeks; w++) {
    const ws = addDays(first, w * 7);
    if (ws.slice(0, 7) !== lastMonth) {
      if (lastMonth && w < weeks - 1) out += `<text x="${L + w * st}" y="10">${fmt(ws, { month: 'short' })}</text>`;
      lastMonth = ws.slice(0, 7);
    }
    for (let d = 0; d < 7; d++) {
      const k = addDays(ws, d);
      if (k > t) break;
      const done = set.has(k);
      const fill = done ? cVar(h) : k < start ? 'var(--empty-faint)' : 'var(--empty)';
      const label = `${fmt(k, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${done ? 'done ✓' : k < start ? 'not tracked yet' : 'not done'}`;
      out += `<rect x="${L + w * st}" y="${T + d * st}" width="${cell}" height="${cell}" rx="3" style="fill:${fill}" data-tip="${esc(label)}"/>`;
    }
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(h.name)}: last 12 months, one square per day">${out}</svg>`;
}

function renderHistory() {
  const hs = active(), t = todayKey(), idx = index(), W = chartWidth();
  tips = [];
  if (!hs.length) { $('#view-history').innerHTML = '<p class="empty-note">Add a habit to see its history.</p>'; return; }
  const per = hs.map(h => {
    const set = idx.get(h.id), start = startOf(h, set);
    return `<div class="card-box" style="${vars(h)}">
      <div class="habit-head"><span class="emoji" aria-hidden="true">${esc(h.emoji || '•')}</span><h2>${esc(h.name)}</h2>
        <span class="badge">${set.size} day${set.size === 1 ? '' : 's'} done</span></div>
      <div class="tiles">
        <div class="tile"><b>${currentStreak(set, t)}</b><span>🔥 Streak</span></div>
        <div class="tile"><b>${bestStreak(set)}</b><span>Best</span></div>
        <div class="tile"><b>${pct(rate(set, start, t, 7))}</b><span>7 days</span></div>
        <div class="tile"><b>${pct(rate(set, start, t, 30))}</b><span>30 days</span></div>
        <div class="tile"><b>${pct(rate(set, start, t, 90))}</b><span>90 days</span></div>
      </div>
      <div class="hm-scroll">${heatmapSVG(h, set, t)}</div>
    </div>`;
  }).join('');
  $('#view-history').innerHTML = `
    <div class="chips" role="group" aria-label="Time range">
      ${RANGES.map(([w, l]) => `<button class="chip" data-act="range" data-w="${w}" aria-pressed="${ui.weeks === w}">${l}</button>`).join('')}
    </div>
    <div class="card-box">
      <h2>Days done per week</h2>
      <p class="sub">Each color is one habit · max ${7 * hs.length} per week</p>
      ${legend(hs)}
      ${barsSVG(hs, idx, t, ui.weeks, W)}
    </div>
    <div class="card-box">
      <h2>Completion rate</h2>
      <p class="sub">Share of the last 30 days done, day by day</p>
      ${legend(hs)}
      ${trendSVG(hs, idx, t, ui.weeks, W)}
    </div>
    ${per}`;
  for (const s of document.querySelectorAll('.hm-scroll')) s.scrollLeft = s.scrollWidth;
}

/* ---------- Tooltip ---------- */
function showTip(html, cx, cy) {
  const el = $('#tooltip');
  el.innerHTML = html;
  el.hidden = false;
  const r = el.getBoundingClientRect();
  let left = cx - r.width / 2, top = cy - r.height - 14;
  if (top < 8) top = cy + 18;
  left = Math.max(8, Math.min(innerWidth - r.width - 8, left));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}
function hideTip() {
  $('#tooltip').hidden = true;
  const c = document.getElementById('cross');
  if (c) c.setAttribute('hidden', '');
}
function crossAt(e) {
  const svg = document.getElementById('trend');
  if (!svg || !crossData) return;
  const { keys, series, x, y, L, iw, days } = crossData;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  const i = Math.max(0, Math.min(days - 1, Math.round((p.x - L) / iw * (days - 1))));
  const g = document.getElementById('cross');
  g.removeAttribute('hidden');
  const line = g.querySelector('line');
  line.setAttribute('x1', x(i)); line.setAttribute('x2', x(i));
  g.querySelectorAll('circle').forEach((c, j) => {
    const v = series[j].vals[i];
    c.style.display = v == null ? 'none' : '';
    if (v != null) { c.setAttribute('cx', x(i)); c.setAttribute('cy', y(v)); }
  });
  const head = fmt(keys[i], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  showTip(`<div class="t-head">${head}</div>${series.map(s => tipRow(s.h, pct(s.vals[i]))).join('')}`, e.clientX, e.clientY);
}
function onPointer(e) {
  const t = e.target;
  if (!(t instanceof Element)) return;
  if (t.closest('[data-cross]')) { crossAt(e); return; }
  const tt = t.closest('[data-tip],[data-tip-i]');
  if (tt) {
    const html = tt.dataset.tipI != null ? tips[+tt.dataset.tipI] : esc(tt.dataset.tip);
    const r = tt.getBoundingClientRect();
    showTip(html, e.pointerType === 'mouse' ? e.clientX : r.left + r.width / 2, e.pointerType === 'mouse' ? e.clientY : r.top);
  } else hideTip();
}
document.addEventListener('pointermove', onPointer);
document.addEventListener('pointerdown', onPointer);
document.addEventListener('scroll', hideTip, true);

/* ---------- Sheets (dialogs) ---------- */
const sheet = $('#sheet');
function openSheet(html) {
  sheet.innerHTML = html;
  if (!sheet.open) sheet.showModal();
}
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });

function editSheet(h) {
  const isNew = !h;
  const slot = isNew ? nextSlot() : h.slot;
  const custom = isNew ? (slot ? null : '#7a5af8') : h.custom;
  const sw = SLOT_NAMES.map((n, i) => `<button type="button" class="swatch" style="--c:var(--slot-${i + 1})" data-slot="${i + 1}"
      aria-label="${n}" aria-pressed="${!custom && slot === i + 1}"></button>`).join('');
  openSheet(`<form id="habit-form" method="dialog">
    <h2>${isNew ? 'New habit' : 'Edit habit'}</h2>
    <div class="row">
      <label class="field emoji-field"><span>Emoji</span><input type="text" name="emoji" value="${esc(isNew ? '⭐' : h.emoji || '')}" maxlength="8"></label>
      <label class="field" style="flex:1"><span>Name</span><input type="text" name="name" value="${esc(isNew ? '' : h.name)}" maxlength="40" required placeholder="e.g. Water"></label>
    </div>
    <div class="field" style="margin-top:14px"><span>Color</span>
      <div class="swatches">${sw}
        <label class="swatch custom" aria-label="Custom color" aria-pressed="${!!custom}"><input type="color" name="custom" value="${custom || '#7a5af8'}"></label>
      </div>
    </div>
    <input type="hidden" name="slot" value="${custom ? '' : slot}">
    <input type="hidden" name="useCustom" value="${custom ? '1' : ''}">
    <div class="btns">
      <button type="button" class="btn" data-act="sheet-close">Cancel</button>
      <button type="submit" class="btn primary">${isNew ? 'Add' : 'Save'}</button>
    </div>
    ${isNew ? '' : `<div class="btns">
      <button type="button" class="btn" data-act="archive" data-id="${h.id}">Archive</button>
      <button type="button" class="btn danger" data-act="delete" data-id="${h.id}">Delete</button></div>
      <p style="margin-top:10px;font-size:13px">Archive hides the habit but keeps its history. Delete removes it and all its history.</p>`}
  </form>`);
  const form = $('#habit-form'), f = form.elements;
  form.addEventListener('click', e => {
    const b = e.target.closest('.swatch[data-slot]');
    if (!b) return;
    f.slot.value = b.dataset.slot;
    f.useCustom.value = '';
    form.querySelectorAll('.swatch').forEach(s => s.setAttribute('aria-pressed', s === b));
  });
  f.custom.addEventListener('input', () => {
    f.useCustom.value = '1';
    form.querySelectorAll('.swatch').forEach(s => s.setAttribute('aria-pressed', s.classList.contains('custom')));
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = f.name.value.trim();
    if (!name) return;
    const data = {
      name,
      emoji: f.emoji.value.trim(),
      slot: f.useCustom.value ? null : +f.slot.value || null,
      custom: f.useCustom.value ? f.custom.value : null,
    };
    if (!data.slot && !data.custom) data.custom = f.custom.value;
    if (isNew) state.habits.push(Object.assign({ id: uid(), createdAt: todayKey(), archived: false }, data));
    else Object.assign(h, data);
    save();
    sheet.close();
    render();
  });
}

function settingsSheet() {
  const archived = state.habits.filter(h => h.archived);
  const demo = /[?&]demo\b/.test(location.search);
  openSheet(`<h2>Settings</h2>
    <h3>Backup</h3>
    <p>Your habits are stored only on this phone. Export a backup now and then — clearing Chrome’s data or changing phones would erase them.</p>
    <div class="btns" style="margin-top:0">
      <button class="btn" data-act="export">Export backup</button>
      <label class="btn">Import backup<input type="file" accept="application/json,.json" id="import-file" hidden></label>
    </div>
    <h3>Archived habits</h3>
    ${archived.length ? archived.map(h => `<div class="list-row" style="${vars(h)}"><span class="dot"></span>
      <span class="name">${esc(h.emoji || '')} ${esc(h.name)}</span>
      <button class="btn" data-act="restore" data-id="${h.id}">Restore</button></div>`).join('') : '<p>None.</p>'}
    ${demo ? `<h3>Demo</h3><div class="btns" style="margin-top:0">
      <button class="btn" data-act="demo">Load sample year</button>
      <button class="btn danger" data-act="reset">Reset everything</button></div>` : ''}
    <div class="btns"><button class="btn primary" data-act="sheet-close">Done</button></div>`);
  $('#import-file').addEventListener('change', importFile);
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `habits-backup-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup saved');
}
function importFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  f.text().then(txt => {
    const s = JSON.parse(txt);
    if (!valid(s)) throw new Error('bad file');
    if (!confirm('Replace all current habits and history with this backup?')) return;
    state = s;
    save();
    sheet.close();
    render();
    toast('Backup restored');
  }).catch(() => toast('That file is not a habits backup'));
}

/* Sample data for trying out the charts (only reachable with ?demo in the URL) */
function loadDemo() {
  if (!confirm('Replace everything with a year of random sample data?')) return;
  const s = seedState(), t = todayKey(), start = addDays(t, -364);
  const odds = [[0.75, 0.35], [0.85, 0.5], [0.6, 0.25], [0.7, 0.2], [0.9, 0.55]];
  s.habits.forEach((h, j) => {
    h.createdAt = start;
    const [stay, begin] = odds[j];
    let prev = false;
    for (let i = 0; i < 365; i++) {
      const k = addDays(start, i);
      const done = Math.random() < (prev ? stay : begin) + i / 365 * 0.1;
      if (done) (s.log[k] = s.log[k] || []).push(h.id);
      prev = done;
    }
  });
  state = s;
  save();
  sheet.close();
  render();
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ---------- Events ---------- */
document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { ui.tab = tab.dataset.tab; scrollTo(0, 0); render(); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.dataset.id, h = id && habitById(id);
  switch (b.dataset.act) {
    case 'toggle': {
      const nowDone = toggle(id, ui.day);
      if (nowDone) {
        const r = b.querySelector('.check').getBoundingClientRect();
        confetti(r.left + r.width / 2, r.top + r.height / 2, h);
        if (navigator.vibrate) navigator.vibrate(12);
      }
      render();
      if (nowDone) { const c = document.querySelector(`[data-card="${id}"]`); if (c) c.classList.add('pop'); }
      break;
    }
    case 'day-prev': ui.day = addDays(ui.day, -1); render(); break;
    case 'day-next': ui.day = addDays(ui.day, 1); render(); break;
    case 'day-today': ui.day = todayKey(); render(); break;
    case 'add': editSheet(null); break;
    case 'edit': editSheet(h); break;
    case 'sheet-close': sheet.close(); break;
    case 'archive': h.archived = true; save(); sheet.close(); render(); toast(`${h.name} archived`); break;
    case 'restore': h.archived = false; save(); settingsSheet(); render(); break;
    case 'delete':
      if (confirm(`Delete “${h.name}” and all its history? This cannot be undone.`)) {
        state.habits = state.habits.filter(x => x !== h);
        for (const k in state.log) {
          state.log[k] = state.log[k].filter(x => x !== id);
          if (!state.log[k].length) delete state.log[k];
        }
        save(); sheet.close(); render();
      }
      break;
    case 'settings': settingsSheet(); break;
    case 'export': exportData(); break;
    case 'demo': loadDemo(); break;
    case 'reset':
      if (confirm('Erase all habits and history?')) { state = seedState(); save(); sheet.close(); render(); }
      break;
    case 'filter': ui.filter = id; render(); break;
    case 'month-prev': shiftMonth(-1); break;
    case 'month-next': shiftMonth(1); break;
    case 'cal-day': {
      const k = b.dataset.k;
      if (ui.filter === 'all') { ui.day = k; ui.tab = 'today'; scrollTo(0, 0); render(); break; }
      const sh = habitById(ui.filter);
      const nowDone = toggle(sh.id, k);
      if (nowDone) { const r = b.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top + r.height / 2, sh); }
      render();
      break;
    }
    case 'range': ui.weeks = +b.dataset.w; render(); break;
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'day-input' && e.target.value) {
    ui.day = e.target.value > todayKey() ? todayKey() : e.target.value;
    render();
  }
});
document.addEventListener('click', e => {
  if (e.target.id === 'day-input' && e.target.showPicker) { try { e.target.showPicker(); } catch (err) { /* not allowed here */ } }
});

/* Swipe left/right on the calendar to change month */
let swipe = null;
$('#view-calendar').addEventListener('touchstart', e => { const p = e.touches[0]; swipe = { x: p.clientX, y: p.clientY }; }, { passive: true });
$('#view-calendar').addEventListener('touchend', e => {
  if (!swipe) return;
  const p = e.changedTouches[0], dx = p.clientX - swipe.x, dy = p.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) > 60 && Math.abs(dy) < 50) shiftMonth(dx < 0 ? 1 : -1);
});

let resizeTimer;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (ui.tab === 'history') render(); }, 150); });

/* Re-render when the app comes back to the foreground on a new day */
let lastDay = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const t = todayKey();
  if (t !== lastDay) { if (ui.day === lastDay) ui.day = t; lastDay = t; render(); }
});

render();

/* ---------- Offline support ---------- */
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
