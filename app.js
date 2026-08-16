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

function defaultEnvelopes(amount, save){
  const spendable = Math.max(amount - save, 0);
  return [
    { name:'Food', amount: Math.round(spendable*0.65) },
    { name:'Transpo', amount: Math.round(spendable*0.2) },
    { name:'Buffer', amount: spendable - Math.round(spendable*0.65) - Math.round(spendable*0.2) }
  ];
}

// ---------- ONBOARDING ----------
document.getElementById('ob-continue').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('ob-amount').value) || 1000;
  const days = parseInt(document.getElementById('ob-days').value) || 4;
  const save = parseFloat(document.getElementById('ob-save').value) || 200;

  state = {
    config: {
      amount, days, save,
      envelopes: defaultEnvelopes(amount, save)
    },
    cycleStart: Date.now(),
    logs: [],
    lifetimeSaved: 0,
    history: []
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
    const leftover = state.config.amount - spent;
    state.lifetimeSaved += leftover;
    state.history.unshift({
      start: state.cycleStart,
      spent,
      leftover,
      logs: state.logs
    });
    if(state.history.length > 30) state.history.pop();

    state.cycleStart += cycleMs;
    state.logs = [];
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
  const { config } = state;
  const elapsed = Date.now() - state.cycleStart;
  const cycleMs = config.days * dayMs();
  const daysLeft = Math.max(0, Math.ceil((cycleMs - elapsed)/dayMs()));
  const hoursLeft = Math.max(0, Math.ceil((cycleMs - elapsed)/(60*60*1000)));

  document.getElementById('cycle-days-left').textContent =
    daysLeft >= 1 ? `${daysLeft} DAY${daysLeft===1?'':'S'} LEFT` : `${hoursLeft}H LEFT`;

  const spent = currentSpentTotal();
  const remaining = config.amount - spent;
  const pctElapsed = Math.min(1, elapsed/cycleMs);
  const pctSpent = Math.min(1, spent/config.amount);

  document.getElementById('spent-total').textContent = peso(spent);
  document.getElementById('remaining-total').textContent = peso(remaining);
  document.getElementById('saved-total').textContent = peso(state.lifetimeSaved);

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
    const pct = env.amount > 0 ? Math.min(1, used/env.amount) : 0;
    const over = used > env.amount;
    const card = document.createElement('div');
    card.className = 'envelope-card';
    card.innerHTML = `
      <div class="envelope-top">
        <div class="envelope-name">${env.name}</div>
        <div class="envelope-nums"><span class="used">${peso(used)}</span> / ${peso(env.amount)}</div>
      </div>
      <div class="envelope-bar-wrap">
        <div class="envelope-bar ${over?'over':''}" style="width:${(pct*100).toFixed(1)}%"></div>
      </div>
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
  [...state.logs].reverse().forEach(log => {
    const item = document.createElement('div');
    item.className = 'log-item';
    const d = new Date(log.ts);
    const timeStr = d.toLocaleDateString('en-PH', { month:'short', day:'numeric' }) + ' · ' +
                     d.toLocaleTimeString('en-PH', { hour:'numeric', minute:'2-digit' });
    item.innerHTML = `
      <div class="log-left">
        <div class="log-note">${log.note || log.envelope}</div>
        <div class="log-meta">${log.envelope} · ${timeStr}</div>
      </div>
      <div style="display:flex;align-items:center;">
        <div class="log-amount">${peso(log.amount)}</div>
        <button class="log-del" data-id="${log.id}">×</button>
      </div>
    `;
    wrap.appendChild(item);
  });

  wrap.querySelectorAll('.log-del').forEach(btn => {
    btn.addEventListener('click', () => {
      state.logs = state.logs.filter(l => l.id !== btn.dataset.id);
      saveState(state);
      render();
    });
  });
}

// ---------- ADD EXPENSE SHEET ----------
let selectedEnvelope = null;
const addSheet = document.getElementById('add-sheet');

function openAddSheet(){
  document.getElementById('add-amount').value = '';
  document.getElementById('add-note').value = '';
  selectedEnvelope = state.config.envelopes[0]?.name || null;
  renderEnvelopePicker();
  addSheet.classList.remove('hidden');
  setTimeout(()=>document.getElementById('add-amount').focus(), 100);
}
function closeAddSheet(){ addSheet.classList.add('hidden'); }

function renderEnvelopePicker(){
  const wrap = document.getElementById('envelope-picker');
  wrap.innerHTML = '';
  state.config.envelopes.forEach(env => {
    const chip = document.createElement('div');
    chip.className = 'env-chip' + (env.name === selectedEnvelope ? ' selected' : '');
    chip.textContent = env.name;
    chip.addEventListener('click', () => {
      selectedEnvelope = env.name;
      renderEnvelopePicker();
    });
    wrap.appendChild(chip);
  });
}

document.getElementById('open-add').addEventListener('click', openAddSheet);
document.getElementById('add-backdrop').addEventListener('click', closeAddSheet);

document.getElementById('add-confirm').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('add-amount').value);
  if(!amount || amount <= 0) return;
  const note = document.getElementById('add-note').value.trim();

  state.logs.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    amount,
    envelope: selectedEnvelope || 'Buffer',
    note,
    ts: Date.now()
  });
  saveState(state);
  closeAddSheet();
  render();
});

// ---------- SETTINGS SHEET ----------
const settingsSheet = document.getElementById('settings-sheet');

function openSettings(){
  document.getElementById('set-amount').value = state.config.amount;
  document.getElementById('set-days').value = state.config.days;
  document.getElementById('set-save').value = state.config.save;
  renderEnvelopeEditList();
  settingsSheet.classList.remove('hidden');
}
function closeSettings(){ settingsSheet.classList.add('hidden'); }

function renderEnvelopeEditList(){
  const wrap = document.getElementById('envelope-edit-list');
  wrap.innerHTML = '';
  state.config.envelopes.forEach((env, i) => {
    const row = document.createElement('div');
    row.className = 'env-edit-row';
    row.innerHTML = `
      <input class="env-name" data-i="${i}" value="${env.name}">
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

document.getElementById('add-envelope-row').addEventListener('click', () => {
  state.config.envelopes.push({ name:'New', amount:0 });
  renderEnvelopeEditList();
});

document.getElementById('settings-save').addEventListener('click', () => {
  const names = [...document.querySelectorAll('.env-name')].map(i=>i.value.trim() || 'Envelope');
  const amts = [...document.querySelectorAll('.env-amt')].map(i=>parseFloat(i.value)||0);
  state.config.envelopes = names.map((name,i)=>({ name, amount: amts[i] }));

  state.config.amount = parseFloat(document.getElementById('set-amount').value) || state.config.amount;
  state.config.days = parseInt(document.getElementById('set-days').value) || state.config.days;
  state.config.save = parseFloat(document.getElementById('set-save').value) || state.config.save;

  saveState(state);
  closeSettings();
  render();
});

document.getElementById('settings-reset').addEventListener('click', () => {
  if(!confirm('End this cycle now and start fresh? Leftover will be added to your saved total.')) return;
  const spent = currentSpentTotal();
  const leftover = state.config.amount - spent;
  state.lifetimeSaved += leftover;
  state.history.unshift({ start: state.cycleStart, spent, leftover, logs: state.logs });
  state.cycleStart = Date.now();
  state.logs = [];
  saveState(state);
  closeSettings();
  render();
});

// ---------- BOOT ----------
function boot(){
  if(!state){
    onboardingEl.classList.remove('hidden');
    mainEl.classList.add('hidden');
    return;
  }
  checkRollover();
  onboardingEl.classList.add('hidden');
  mainEl.classList.remove('hidden');
  render();
}

boot();
setInterval(() => { if(state) render(); }, 60000);

// ---------- SERVICE WORKER ----------
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}