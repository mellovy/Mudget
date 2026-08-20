// ---------- STORAGE ----------
const STORE_KEY = 'stash_v1';

function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}
function saveState(state){
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

let state = loadState();

// ---------- ELEMENTS ----------
const onboardingEl = document.getElementById('onboarding');
const mainEl = document.getElementById('main');

// ---------- HELPERS ----------
function peso(n){
  const v = Math.round(n);
  return '₱' + v.toLocaleString('en-PH');
}
function dayMs(){ return 24*60*60*1000; }

// convert a timestamp to the local value a <input type="datetime-local"> expects
function toDatetimeLocalValue(ts){
  const d = new Date(ts);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// convert a <input type="datetime-local"> value back into a timestamp (local time)
function fromDatetimeLocalValue(val){
  if(!val) return Date.now();
  const t = new Date(val).getTime();
  return isNaN(t) ? Date.now() : t;
}

const ACCENTS = ['#e5484d','#ff6b35','#f5c542','#4dd68a','#3ea8ff','#a855f7'];
const ENV_COLORS = ['#e5484d','#ff6b35','#f5c542','#4dd68a','#3ea8ff','#a855f7','#2dd4bf','#f4f1ea'];

function defaultEnvelopes(amount, save){
  const spendable = Math.max(amount - save, 0);
  return [
    { name:'Food', amount: Math.round(spendable*0.65), color: ENV_COLORS[0] },
    { name:'Transpo', amount: Math.round(spendable*0.2), color: ENV_COLORS[1] },
    { name:'Buffer', amount: spendable - Math.round(spendable*0.65) - Math.round(spendable*0.2), color: ENV_COLORS[2] }
  ];
}

function applyAccent(hex){
  document.documentElement.style.setProperty('--accent', hex);
  // derive a dim + glow version
  document.documentElement.style.setProperty('--accent-dim', hex + 'aa');
  document.documentElement.style.setProperty('--accent-glow', hex + '30');
}

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
}

// ---------- ONBOARDING ----------
document.getElementById('ob-continue').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('ob-amount').value) || 1000;
  const days = parseInt(document.getElementById('ob-days').value) || 4;
  const save = parseFloat(document.getElementById('ob-save').value) || 200;

  state = {
    config: {
      amount, days, save,
      envelopes: defaultEnvelopes(amount, save),
      accent: ACCENTS[0]
    },
    cycleStart: Date.now(),
    logs: [],
    lifetimeSaved: save,
    history: [],
    migratedSaveV2: true
  };
  saveState(state);
  boot();
});

// ---------- CYCLE ROLLOVER ----------
function checkRollover(){
  if(!state) return;
  const { days } = state.config;
  const elapsed = Date.now() - state.cycleStart;
  const cycleMs = days * dayMs();

  while(elapsed >= cycleMs){
    const spent = state.logs.reduce((s,l)=>s+l.amount,0);
    const spendable = state.config.amount - state.config.save;
    const leftover = spendable - spent; // extra unspent beyond the save target, can be negative
    state.lifetimeSaved += leftover;
    state.history.unshift({
      start: state.cycleStart,
      spent,
      leftover: leftover + state.config.save, // total banked this cycle (save + extra)
      logs: state.logs
    });
    if(state.history.length > 30) state.history.pop();

    state.cycleStart += cycleMs;
    state.logs = [];
    state.lifetimeSaved += state.config.save; // new cycle's save target, banked immediately
    saveState(state);
    return checkRollover(); // in case multiple cycles passed while app was closed
  }
}

// ---------- RENDER ----------
function currentSpentTotal(){
  return state.logs.reduce((s,l)=>s+l.amount,0);
}
function envelopeSpent(name){
  return state.logs.filter(l=>l.envelope===name).reduce((s,l)=>s+l.amount,0);
}

function render(){
  // keep the cycle honest: if enough time has passed while the app was
  // sitting open (not just reloaded), roll over before drawing anything
  checkRollover();

  const { config } = state;
  const elapsed = Date.now() - state.cycleStart;
  const cycleMs = config.days * dayMs();
  const daysLeft = Math.max(0, Math.ceil((cycleMs - elapsed)/dayMs()));
  const hoursLeft = Math.max(0, Math.ceil((cycleMs - elapsed)/(60*60*1000)));

  document.getElementById('cycle-days-left').textContent =
    daysLeft >= 1 ? `${daysLeft} DAY${daysLeft===1?'':'S'} LEFT` : `${hoursLeft}H LEFT`;

  const spent = currentSpentTotal();
  const spendable = config.amount - config.save;
  const remaining = spendable - spent;
  const pctElapsed = Math.min(1, elapsed/cycleMs);
  const pctSpent = Math.min(1, spent/spendable);

  document.getElementById('spent-total').textContent = peso(spent);
  document.getElementById('remaining-total').textContent = peso(remaining);
  document.getElementById('saved-total').textContent = peso(state.lifetimeSaved);

  const recEl = document.getElementById('rec-per-day');
  if(recEl){
    // days left including the partial day in progress, so "today" still counts
    const daysLeftForBudget = Math.max((cycleMs - elapsed) / dayMs(), 1/24);
    const recPerDay = remaining / daysLeftForBudget;
    recEl.classList.toggle('over', remaining < 0);
    recEl.innerHTML = remaining < 0
      ? `<span class="rec-amt">${peso(Math.abs(remaining))}</span> over budget`
      : `<span class="rec-amt">${peso(recPerDay)}</span>/day left to spend`;
  }

  const bar = document.getElementById('cycle-bar');
  bar.style.width = (pctSpent*100).toFixed(1) + '%';
  const statusEl = document.getElementById('cycle-status');

  bar.classList.remove('warn','danger');
  statusEl.classList.remove('warn','danger');

  if(remaining < 0){
    bar.classList.add('danger'); statusEl.classList.add('danger');
    statusEl.textContent = 'OVER BUDGET';
  } else if(pctSpent > pctElapsed + 0.15){
    bar.classList.add('warn'); statusEl.classList.add('warn');
    statusEl.textContent = 'PACE HIGH';
  } else {
    statusEl.textContent = 'ON TRACK';
  }

  renderEnvelopes();
  renderLog();
}

function renderEnvelopes(){
  const wrap = document.getElementById('envelopes-list');
  wrap.innerHTML = '';
  state.config.envelopes.forEach(env => {
    const used = envelopeSpent(env.name);
    const left = env.amount - used;
    const pct = env.amount > 0 ? Math.min(1, used/env.amount) : 0;
    const over = used > env.amount;
    const card = document.createElement('div');
    card.className = 'envelope-card';
    card.innerHTML = `
      <div class="envelope-top">
        <div class="envelope-name"><span class="envelope-dot" style="background:${env.color||'#888'}"></span>${env.name}</div>
        <div class="envelope-nums"><span class="used">${peso(used)}</span> / ${peso(env.amount)}</div>
      </div>
      <div class="envelope-bar-wrap">
        <div class="envelope-bar ${over?'over':''}" style="width:${(pct*100).toFixed(1)}%; ${!over&&env.color?`background:${env.color}`:''}"></div>
      </div>
      <div class="envelope-left ${over?'over':''}">${over ? peso(Math.abs(left))+' over' : peso(left)+' left'}</div>
    `;
    wrap.appendChild(card);
  });
}

function renderLog(){
  const wrap = document.getElementById('log-list');
  wrap.innerHTML = '';
  if(state.logs.length === 0){
    wrap.innerHTML = '<div class="log-empty">no spends logged this cycle yet</div>';
    return;
  }
  [...state.logs].sort((a,b)=>b.ts-a.ts).forEach(log => {
    const env = state.config.envelopes.find(e=>e.name===log.envelope);
    const item = document.createElement('div');
    item.className = 'log-item';
    item.style.cursor = 'pointer';
    const d = new Date(log.ts);
    const timeStr = d.toLocaleDateString('en-PH', { month:'short', day:'numeric' }) + ' · ' +
                     d.toLocaleTimeString('en-PH', { hour:'numeric', minute:'2-digit' });
    item.innerHTML = `
      <div class="log-left">
        <div class="log-note">${log.note || log.envelope}</div>
        <div class="log-meta"><span class="envelope-dot" style="display:inline-block;background:${env?env.color:'#666'}"></span> ${log.envelope} · ${timeStr}</div>
      </div>
      <div class="log-amount">${peso(log.amount)}</div>
    `;
    item.addEventListener('click', () => openAddSheet(log));
    wrap.appendChild(item);
  });
}

// ---------- TABS ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('tab-'+btn.dataset.tab).classList.remove('hidden');
    if(btn.dataset.tab === 'calendar') renderCalendar();
    if(btn.dataset.tab === 'stats') renderStats();
  });
});

// ---------- CALENDAR ----------
let calViewDate = new Date();
let calSelectedDay = null;

function allLogsCombined(){
  // current cycle logs + all history logs
  let all = [...state.logs];
  state.history.forEach(h => { all = all.concat(h.logs || []); });
  return all;
}

function renderCalendar(){
  const label = calViewDate.toLocaleDateString('en-PH', { month:'long', year:'numeric' });
  document.getElementById('cal-month-label').textContent = label.toUpperCase();

  const year = calViewDate.getFullYear();
  const month = calViewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();

  const logs = allLogsCombined();
  const dailyTotals = {};
  logs.forEach(l => {
    const d = new Date(l.ts);
    if(d.getFullYear()===year && d.getMonth()===month){
      const key = d.getDate();
      dailyTotals[key] = (dailyTotals[key]||0) + l.amount;
    }
  });

  const avgDay = state.config.amount / state.config.days;
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  for(let i=0;i<firstDay;i++){
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  const today = new Date();
  for(let day=1; day<=daysInMonth; day++){
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    const isToday = today.getFullYear()===year && today.getMonth()===month && today.getDate()===day;
    if(isToday) cell.classList.add('today');
    if(calSelectedDay && calSelectedDay.y===year && calSelectedDay.m===month && calSelectedDay.d===day){
      cell.classList.add('selected');
    }
    const total = dailyTotals[day];
    let dotHtml = '';
    if(total){
      let cls = 'ok';
      if(total > avgDay*1.5) cls = 'danger';
      else if(total > avgDay) cls = 'warn';
      dotHtml = `<div class="dot ${cls}"></div>`;
    }
    cell.innerHTML = `<span>${day}</span>${dotHtml}`;
    cell.addEventListener('click', () => {
      calSelectedDay = { y:year, m:month, d:day };
      renderCalendar();
      renderCalDayLog();
    });
    grid.appendChild(cell);
  }

  if(!calSelectedDay) renderCalDayLog();
}

function renderCalDayLog(){
  const wrap = document.getElementById('cal-day-log');
  if(!calSelectedDay){
    wrap.innerHTML = '<div class="log-empty">tap a day to see spends</div>';
    return;
  }
  const logs = allLogsCombined().filter(l => {
    const d = new Date(l.ts);
    return d.getFullYear()===calSelectedDay.y && d.getMonth()===calSelectedDay.m && d.getDate()===calSelectedDay.d;
  });
  if(logs.length === 0){
    wrap.innerHTML = '<div class="log-empty">nothing logged this day</div>';
    return;
  }
  wrap.innerHTML = '';
  logs.forEach(log => {
    const env = state.config.envelopes.find(e=>e.name===log.envelope);
    const item = document.createElement('div');
    item.className = 'log-item';
    const d = new Date(log.ts);
    const timeStr = d.toLocaleTimeString('en-PH', { hour:'numeric', minute:'2-digit' });
    item.innerHTML = `
      <div class="log-left">
        <div class="log-note">${log.note || log.envelope}</div>
        <div class="log-meta"><span class="envelope-dot" style="display:inline-block;background:${env?env.color:'#666'}"></span> ${log.envelope} · ${timeStr}</div>
      </div>
      <div class="log-amount">${peso(log.amount)}</div>
    `;
    wrap.appendChild(item);
  });
}

document.getElementById('cal-prev').addEventListener('click', () => {
  calViewDate.setMonth(calViewDate.getMonth()-1);
  renderCalendar();
});
document.getElementById('cal-next').addEventListener('click', () => {
  calViewDate.setMonth(calViewDate.getMonth()+1);
  renderCalendar();
});

// ---------- STATS ----------
function renderStats(){
  const cyclesCompleted = state.history.length;
  const avgSpent = cyclesCompleted
    ? Math.round(state.history.reduce((s,h)=>s+h.spent,0)/cyclesCompleted)
    : currentSpentTotal();
  const bestCycle = cyclesCompleted
    ? Math.max(...state.history.map(h=>h.leftover))
    : (state.config.amount - currentSpentTotal());
  const streak = (() => {
    let s = 0;
    for(const h of state.history){
      if(h.leftover >= state.config.save) s++; else break;
    }
    return s;
  })();

  const grid = document.getElementById('stats-summary');
  grid.innerHTML = `
    <div class="stat-card"><div class="stat-label">TOTAL SAVED</div><div class="stat-value good">${peso(state.lifetimeSaved)}</div></div>
    <div class="stat-card"><div class="stat-label">CYCLES DONE</div><div class="stat-value">${cyclesCompleted}</div></div>
    <div class="stat-card"><div class="stat-label">AVG SPENT/CYCLE</div><div class="stat-value">${peso(avgSpent)}</div></div>
    <div class="stat-card"><div class="stat-label">SAVE STREAK</div><div class="stat-value accent">${streak}</div></div>
  `;

  const histWrap = document.getElementById('history-list');
  if(state.history.length === 0){
    histWrap.innerHTML = '<div class="log-empty">finish your first cycle to see history</div>';
    return;
  }
  histWrap.innerHTML = '';
  state.history.forEach(h => {
    const d = new Date(h.start);
    const dateStr = d.toLocaleDateString('en-PH', { month:'short', day:'numeric' });
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="history-left">
        <div class="history-date">Cycle from ${dateStr}</div>
        <div class="history-sub">spent ${peso(h.spent)}</div>
      </div>
      <div class="history-leftover ${h.leftover<0?'neg':'pos'}">${h.leftover<0?'-':'+'}${peso(Math.abs(h.leftover))}</div>
    `;
    histWrap.appendChild(item);
  });
}

// ---------- ADD EXPENSE SHEET ----------
let selectedEnvelope = null;
let editingLogId = null;
const addSheet = document.getElementById('add-sheet');
const QUICK_AMOUNTS = [20, 50, 100, 150];

function openAddSheet(logToEdit){
  editingLogId = logToEdit ? logToEdit.id : null;
  document.getElementById('add-amount').value = logToEdit ? logToEdit.amount : '';
  document.getElementById('add-note').value = logToEdit ? (logToEdit.note||'') : '';
  document.getElementById('add-date').value = toDatetimeLocalValue(logToEdit ? logToEdit.ts : Date.now());
  selectedEnvelope = logToEdit ? logToEdit.envelope : (state.lastEnvelope || state.config.envelopes[0]?.name || null);
  document.getElementById('add-confirm').textContent = logToEdit ? 'SAVE CHANGES' : 'ADD';
  document.getElementById('add-delete').classList.toggle('hidden', !logToEdit);
  renderEnvelopePicker();
  renderQuickAmounts();
  addSheet.classList.remove('hidden');
  setTimeout(()=>document.getElementById('add-amount').focus(), 100);
}
function closeAddSheet(){ addSheet.classList.add('hidden'); editingLogId = null; }

// picks your 4 most-used spend amounts (across current + past cycles) so
// the quick-chips actually reflect real habits instead of static guesses;
// falls back to sensible defaults until there's enough history
function getSmartQuickAmounts(){
  const counts = {};
  allLogsCombined().forEach(l => {
    const amt = Math.round(l.amount);
    counts[amt] = (counts[amt]||0) + 1;
  });
  const frequent = Object.keys(counts)
    .map(Number)
    .sort((a,b) => counts[b]-counts[a] || a-b)
    .slice(0,4);
  if(frequent.length === 4) return frequent.sort((a,b)=>a-b);
  const fallback = QUICK_AMOUNTS.filter(a => !frequent.includes(a));
  return [...frequent, ...fallback].slice(0,4).sort((a,b)=>a-b);
}


function renderQuickAmounts(){
  const wrap = document.getElementById('quick-amounts');
  wrap.innerHTML = '';
  getSmartQuickAmounts().forEach(amt => {
    const chip = document.createElement('div');
    chip.className = 'quick-chip';
    chip.textContent = '₱'+amt;
    chip.addEventListener('click', () => {
      document.getElementById('add-amount').value = amt;
    });
    wrap.appendChild(chip);
  });
}

function renderEnvelopePicker(){
  const wrap = document.getElementById('envelope-picker');
  wrap.innerHTML = '';
  state.config.envelopes.forEach(env => {
    const chip = document.createElement('div');
    chip.className = 'env-chip' + (env.name === selectedEnvelope ? ' selected' : '');
    chip.textContent = env.name;
    if(env.name === selectedEnvelope){
      chip.style.borderColor = env.color;
      chip.style.color = env.color;
    }
    chip.addEventListener('click', () => {
      selectedEnvelope = env.name;
      renderEnvelopePicker();
    });
    wrap.appendChild(chip);
  });
}

// remember the last envelope used so the add sheet defaults to it next time
document.getElementById('add-amount').addEventListener('keydown', e => {
  if(e.key === 'Enter'){
    e.preventDefault();
    document.getElementById('add-confirm').click();
  }
});
document.getElementById('add-note').addEventListener('keydown', e => {
  if(e.key === 'Enter'){
    e.preventDefault();
    document.getElementById('add-confirm').click();
  }
});

document.getElementById('open-add').addEventListener('click', () => openAddSheet(null));
document.getElementById('add-backdrop').addEventListener('click', closeAddSheet);

document.getElementById('add-confirm').addEventListener('click', () => {
  const amountInput = document.getElementById('add-amount');
  const amount = parseFloat(amountInput.value);
  if(!amount || amount <= 0){
    const wrap = amountInput.closest('.input-wrap');
    wrap.classList.add('shake');
    setTimeout(()=>wrap.classList.remove('shake'), 350);
    amountInput.focus();
    return;
  }
  const note = document.getElementById('add-note').value.trim();
  const ts = fromDatetimeLocalValue(document.getElementById('add-date').value);

  if(editingLogId){
    const log = state.logs.find(l => l.id === editingLogId);
    if(log){
      log.amount = amount;
      log.note = note;
      log.envelope = selectedEnvelope || 'Buffer';
      log.ts = ts;
    }
  } else {
    state.logs.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
      amount,
      envelope: selectedEnvelope || 'Buffer',
      note,
      ts
    });
  }
  state.lastEnvelope = selectedEnvelope;
  saveState(state);
  closeAddSheet();
  render();
});

document.getElementById('add-delete').addEventListener('click', () => {
  if(!editingLogId) return;
  const removed = state.logs.find(l => l.id === editingLogId);
  const removedIndex = state.logs.findIndex(l => l.id === editingLogId);
  state.logs = state.logs.filter(l => l.id !== editingLogId);
  saveState(state);
  closeAddSheet();
  render();
  if(removed) showUndoToast('Entry deleted', () => {
    state.logs.splice(Math.min(removedIndex, state.logs.length), 0, removed);
    saveState(state);
    render();
  });
});

// ---------- UNDO TOAST ----------
let undoToastTimer = null;
function showUndoToast(message, onUndo){
  const toast = document.getElementById('undo-toast');
  if(!toast) return;
  clearTimeout(undoToastTimer);
  document.getElementById('undo-toast-msg').textContent = message;
  toast.classList.remove('hidden');
  toast.classList.add('show');

  const undoBtn = document.getElementById('undo-toast-btn');
  const cleanup = () => {
    toast.classList.remove('show');
    setTimeout(()=>toast.classList.add('hidden'), 200);
    undoBtn.removeEventListener('click', handler);
  };
  const handler = () => { onUndo(); cleanup(); clearTimeout(undoToastTimer); };
  undoBtn.addEventListener('click', handler);

  undoToastTimer = setTimeout(cleanup, 5000);
}

// ---------- SETTINGS SHEET ----------
const settingsSheet = document.getElementById('settings-sheet');

// snapshot taken when the settings sheet opens, so on save we can tell
// whether the envelope amounts were hand-edited or should auto-scale
// to follow a changed cycle amount / save target
let settingsOpenSnapshot = null;

function openSettings(){
  document.getElementById('set-amount').value = state.config.amount;
  document.getElementById('set-days').value = state.config.days;
  document.getElementById('set-save').value = state.config.save;
  settingsOpenSnapshot = {
    spendable: state.config.amount - state.config.save,
    envTotal: state.config.envelopes.reduce((s,e)=>s+e.amount,0)
  };
  renderEnvelopeEditList();
  renderAccentPicker();
  settingsSheet.classList.remove('hidden');
}

function renderAccentPicker(){
  const wrap = document.getElementById('accent-picker');
  wrap.innerHTML = '';
  ACCENTS.forEach(hex => {
    const sw = document.createElement('div');
    sw.className = 'accent-swatch' + (state.config.accent === hex ? ' selected' : '');
    sw.style.background = hex;
    sw.addEventListener('click', () => {
      state.config.accent = hex;
      applyAccent(hex);
      renderAccentPicker();
      saveState(state);
    });
    wrap.appendChild(sw);
  });

  document.querySelectorAll('.theme-icon-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.theme === (state.config.theme || 'dark'));
  });
}

document.querySelectorAll('.theme-icon-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.config.theme = btn.dataset.theme;
    applyTheme(state.config.theme);
    renderAccentPicker();
    saveState(state);
  });
});
function closeSettings(){ settingsSheet.classList.add('hidden'); }

function renderEnvelopeEditList(){
  const wrap = document.getElementById('envelope-edit-list');
  wrap.innerHTML = '';
  state.config.envelopes.forEach((env, i) => {
    const row = document.createElement('div');
    row.className = 'env-edit-row';
    row.innerHTML = `
      <input class="env-name" data-i="${i}" value="${env.name}">
      <input class="env-color" data-i="${i}" type="color" value="${env.color||'#b4ff39'}">
      <input class="env-amt" data-i="${i}" type="number" value="${env.amount}">
      <button data-i="${i}" class="env-del">×</button>
    `;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll('.env-del').forEach(btn => {
    btn.addEventListener('click', () => {
      state.config.envelopes.splice(parseInt(btn.dataset.i), 1);
      renderEnvelopeEditList();
    });
  });
}

document.getElementById('open-settings').addEventListener('click', openSettings);
document.getElementById('settings-backdrop').addEventListener('click', closeSettings);
document.getElementById('settings-close').addEventListener('click', closeSettings);

document.getElementById('auto-save-target').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('set-amount').value) || state.config.amount;
  document.getElementById('set-save').value = Math.round(amount * 0.2);
});

document.getElementById('add-envelope-row').addEventListener('click', () => {
  const nextColor = ENV_COLORS[state.config.envelopes.length % ENV_COLORS.length];
  state.config.envelopes.push({ name:'New', amount:0, color: nextColor });
  renderEnvelopeEditList();
});

document.getElementById('settings-save').addEventListener('click', () => {
  const names = [...document.querySelectorAll('.env-name')].map(i=>i.value.trim() || 'Envelope');
  const amts = [...document.querySelectorAll('.env-amt')].map(i=>parseFloat(i.value)||0);
  const colors = [...document.querySelectorAll('.env-color')].map(i=>i.value);
  let envelopes = names.map((name,i)=>({ name, amount: amts[i], color: colors[i] }));

  const newAmount = parseFloat(document.getElementById('set-amount').value) || state.config.amount;
  const newDays = parseInt(document.getElementById('set-days').value) || state.config.days;
  const newSave = parseFloat(document.getElementById('set-save').value) || state.config.save;
  const newSpendable = Math.max(newAmount - newSave, 0);

  // auto-adjust envelope amounts if the cycle amount/save target changed
  // but the person didn't also hand-edit the envelope amounts themselves —
  // scale everything proportionally so envelopes keep tracking the budget
  if(settingsOpenSnapshot){
    const enteredTotal = envelopes.reduce((s,e)=>s+e.amount,0);
    const envelopesUntouched = Math.abs(enteredTotal - settingsOpenSnapshot.envTotal) < 1;
    const spendableChanged = Math.abs(newSpendable - settingsOpenSnapshot.spendable) >= 1;
    if(envelopesUntouched && spendableChanged && settingsOpenSnapshot.spendable > 0){
      const ratio = newSpendable / settingsOpenSnapshot.spendable;
      envelopes = envelopes.map(e => ({ ...e, amount: Math.max(Math.round(e.amount * ratio), 0) }));
    }
  }

  state.config.envelopes = envelopes;
  state.config.amount = newAmount;
  state.config.days = newDays;
  state.config.save = newSave;

  settingsOpenSnapshot = null;
  saveState(state);
  closeSettings();
  render();
});

document.getElementById('settings-reset').addEventListener('click', () => {
  if(!confirm('End this cycle now and start fresh? Your save target is already counted as saved — any extra unspent money will be banked too.')) return;
  const spent = currentSpentTotal();
  const spendable = state.config.amount - state.config.save;
  const leftover = spendable - spent;
  state.lifetimeSaved += leftover;
  state.history.unshift({ start: state.cycleStart, spent, leftover: leftover + state.config.save, logs: state.logs });
  state.cycleStart = Date.now();
  state.logs = [];
  state.lifetimeSaved += state.config.save;
  saveState(state);
  closeSettings();
  render();
});

document.getElementById('settings-delete-all').addEventListener('click', () => {
  if(!confirm('Delete everything? This wipes all logs, envelopes, history, and saved totals. This cannot be undone.')) return;
  if(!confirm('Really sure? Last chance to back out.')) return;
  localStorage.removeItem(STORE_KEY);
  state = null;
  closeSettings();
  location.reload();
});

// ---------- BOOT ----------
function boot(){
  if(!state){
    onboardingEl.classList.remove('hidden');
    mainEl.classList.add('hidden');
    return;
  }
  checkRollover();
  if(!state.migratedSaveV2){
    state.lifetimeSaved += state.config.save; // bank this cycle's save target under the new logic
    state.migratedSaveV2 = true;
    saveState(state);
  }
  if(!state.config.accent || state.config.accent === '#b4ff39' || state.config.accent === '#e8918f') state.config.accent = ACCENTS[0];
  if(state.config.envelopes.some(e=>!e.color)){
    state.config.envelopes.forEach((e,i)=>{ if(!e.color) e.color = ENV_COLORS[i % ENV_COLORS.length]; });
  }
  applyAccent(state.config.accent);
  applyTheme(state.config.theme || 'dark');
  onboardingEl.classList.add('hidden');
  mainEl.classList.remove('hidden');
  render();
}

boot();
setInterval(() => { if(state) render(); }, 60000);

// ---------- SERVICE WORKER ----------
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      // if a new SW is already waiting, activate it immediately
      if(reg.waiting) reg.waiting.postMessage('SKIP_WAITING');

      // watch for a new SW being found and force it to activate
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if(!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if(newWorker.state === 'installed' && navigator.serviceWorker.controller){
            newWorker.postMessage('SKIP_WAITING');
          }
        });
      });

      // check for updates every time the app is opened/foregrounded
      reg.update();
      document.addEventListener('visibilitychange', () => {
        if(document.visibilityState === 'visible') reg.update();
      });
    }).catch(()=>{});

    // reload the page once the new SW takes control, so the fresh
    // assets actually get used instead of sitting cached-but-unused
    let refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if(refreshed) return;
      refreshed = true;
      window.location.reload();
    });
  });
}