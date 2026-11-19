import { KhataStore, formatINR as money, exposeAgentTools, AGENT_TOOLS } from './khata-core.js';
import { CORE_KEY, EXTRA_KEY, storage, persistent, fixture, replaceState, loadExtra, demoIds } from './demo-data.js';

const base = new KhataStore(null).state;
const seed = () => fixture(base);
if (!storage.getItem(CORE_KEY)) storage.setItem(CORE_KEY, JSON.stringify(seed()));
const store = new KhataStore(storage);
const agentMode = exposeAgentTools(store);
const extra = loadExtra();
const prefs = { size: 'standard', lang: 'en', reduce: false, theme: 'bahi', ...extra.prefs };
let debts = extra.debts || []; // Pending repayments and late-arrival links after conversion.
let recent = (extra.recent || demoIds).filter(id => store.customer(id));
let showGuide = !extra.seen;
const ui = { page: 'home', amount: '', selected: null, customerId: 'ravi', start: null, elapsed: null, undo: null, toast: '', tone: 'gentle', message: '', upi: null, pendingIndex: 0 };
let undoTimeout;
let activeDialog = null;
let mutation = false;
const screen = document.querySelector('#screen');
const sheet = document.querySelector('#sheet');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, cls = '') => {
  const paths = {
    ledger: '<rect x="6" y="3" width="14" height="18" rx="2"/><path d="M3 7h6M3 12h6M3 17h6M12 8h4M12 12h4"/>',
    user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2Z"/>',
    back: '<path d="m14 5-7 7 7 7"/>', down: '<path d="m6 9 6 6 6-6"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
    receive: '<path d="M12 3v12m-5-5 5 5 5-5M3 16v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4"/>',
    send: '<path d="m3 10 18-7-7 18-3-8-8-3Zm8 3L21 3"/>',
    delete: '<path d="M9 5h12v14H9l-7-7Z"/><path d="m12 9 6 6m0-6-6 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>', plus: '<circle cx="12" cy="12" r="10"/><path d="M12 7v10M7 12h10"/>',
    minus: '<circle cx="12" cy="12" r="10"/><path d="M7 12h10"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>'
  };
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.ledger}</svg>`;
};
const hindi = { 'New credit': 'नया उधार', Ledger: 'खाता', Amount: 'रकम', 'Recent customers': 'हाल के ग्राहक', 'Choose a customer': 'ग्राहक चुनें', Settings: 'सेटिंग्स', Back: 'वापस', Outstanding: 'बकाया', History: 'इतिहास', 'Receive via UPI': 'UPI से प्राप्त करें', 'Send reminder': 'अनुस्मारक', 'Copy message': 'संदेश कॉपी करें', Reminder: 'अनुस्मारक', 'Text size': 'अक्षर का आकार', 'Colour theme': 'रंग थीम', Language: 'भाषा', 'Reduce motion': 'गति कम करें', 'Reset demo data': 'डेमो डेटा रीसेट करें', 'UPI pending': 'UPI लंबित', 'Move to credit': 'उधार में बदलें', 'UPI failed · keep on khata': 'UPI विफल · खाते में रखें', Wait: 'प्रतीक्षा करें', 'Mark received': 'प्राप्त चिह्नित करें', 'Hold as credit': 'उधार के रूप में रखें', 'Show demo QR': 'डेमो QR दिखाएँ', 'View ledger': 'खाता देखें', 'New entry': 'नई एंट्री' };
const t = s => prefs.lang === 'hi' ? hindi[s] || s : s;
function saveExtra() { storage.setItem(EXTRA_KEY, JSON.stringify({ prefs, debts, recent, seen: true })); }
saveExtra();
function announce(text, urgent = false) { const el = document.querySelector(urgent ? '#urgent' : '#live'); el.textContent = ''; setTimeout(() => { el.textContent = text; }, 20); }
function customer(id = ui.customerId) { return store.customer(id) || store.state.customers[0]; }
function btn(action, label, cls = '', attrs = '') { return `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${label}</button>`; }
function heading(title, back = 'home', right = '') { return `<header class="page-header">${btn(back, icon('back') + t('Back'), 'back')}<h1 id="screen-title" tabindex="-1">${t(title)}</h1>${right}</header>`; }
function applyPrefs() { document.documentElement.dataset.theme = prefs.theme; document.documentElement.dataset.size = prefs.size; document.documentElement.dataset.reduce = prefs.reduce; document.documentElement.lang = prefs.lang; }
function entryNote(e) {
  // The immutable core calls arrived:false a failure; a manual conversion is still pending.
  if (e.note === 'UPI failed; kept as credit' && debts.some(d => d.linkedId === e.id)) return 'UPI pending at conversion; kept as credit';
  return e.note || '';
}
function pendingItems(id) {
  return [
    ...store.state.entries.filter(e => e.kind === 'pending' && !e.voided).map(e => ({ ...e, source: 'core', purpose: 'purchase' })),
    ...debts.filter(e => !e.resolved).map(e => ({ ...e, source: 'ui' }))
  ].filter(e => !id || e.customerId === id);
}
function pendingBand(id) {
  const items = pendingItems(id);
  if (!items.length) return '';
  ui.pendingIndex = Math.min(ui.pendingIndex, items.length - 1);
  const e = items[ui.pendingIndex];
  const age = Math.max(0, Math.floor((Date.now() - Date.parse(e.at)) / 60000));
  return `<section class="pending-band" aria-label="Pending UPI payments"><div class="section-row"><h2>${icon('clock')}${t('UPI pending')} · ${items.length}</h2>${items.length > 1 ? btn('next-pending', 'Next ' + icon('arrow'), 'small') : ''}</div><article class="pending-card"><div class="section-row"><strong>${esc(customer(e.customerId).name)}</strong><strong class="pending-amount">${money(e.amount)}</strong></div><p class="pending-status">Not received · ${age < 1 ? 'just now' : age + ' min ago'}</p><p class="support">${e.purpose === 'repayment' ? 'Existing debt unchanged. No new credit.' : 'Goods given. On the khata until this UPI lands.'}</p><div class="pending-actions">${btn('mark-received', icon('check') + t('Mark received'), 'primary received-action', `data-id="${e.id}"`)}${e.source === 'core' ? btn('move-credit', t('UPI failed · keep on khata'), 'outline', `data-id="${e.id}"`) : btn('wait', t('Wait'), 'outline', `data-id="${e.id}"`)}</div></article></section>`;
}
function toast() {
  if (ui.undo && Date.now() < ui.undo.until) return `<div class="undo-banner" role="region" aria-label="Saved entry undo"><div><strong>${money(ui.undo.amount)} added to ${esc(customer(ui.undo.customerId).name)}</strong><span>${ui.synthetic ? 'Judge-created entry' : 'Saved in ' + ui.elapsed.toFixed(1) + ' s'} · <span id="undo-seconds">${Math.max(1, Math.ceil((ui.undo.until-Date.now())/1000))}</span> s to undo</span></div>${btn('undo', 'Undo', 'undo-button')}</div>`;
  return ui.toast ? `<p class="notice">${icon('check')}${esc(ui.toast)}</p>` : '';
}
function home() {
  const c = ui.selected && customer(ui.selected);
  const canSave = Number(ui.amount) > 0 && c;
  const saveText = c ? (prefs.lang === 'hi' ? `${money(Number(ui.amount) || 0)} ${c.name.split(' ')[0]} के लिए सहेजें` : `Save ${money(Number(ui.amount) || 0)} for ${c.name.split(' ')[0]}`) : (prefs.lang === 'hi' ? 'पहले ग्राहक चुनें' : 'Choose a customer to save');
  return `${showGuide ? `<section class="guide"><div><strong>Concept demo · no real money or messages.</strong><p>Try: tap 2 · 5 · 0 → Ravi → Save.</p></div>${btn('dismiss-guide', icon('close'), 'icon-button', 'aria-label="Dismiss introduction"')}</section>` : ''}<div class="home-content"><header class="home-header"><h1 id="screen-title" tabindex="-1">${t('New credit')}</h1>${btn('ledger', icon('ledger') + t('Ledger'), 'text-button')}</header>${toast()}${pendingBand()}<section class="amount-block"><label for="amount-display">${t('Amount')}</label><output id="amount-display" class="display-amount" data-len="${(() => { const L = (ui.amount || '0').length; return L <= 6 ? 's' : L <= 8 ? 'm' : L <= 10 ? 'l' : 'xl'; })()}" aria-label="Credit amount">₹${esc(ui.amount || '0')}</output></section><section class="customers"><h2>${t('Recent customers')}</h2><div class="customer-chips">${recent.slice(0,6).map(id => { const c = customer(id); const selected = id === ui.selected; return btn('select', `<span class="avatar">${c.name[0]}${selected ? '<span class="selected-check">✓</span>' : ''}</span><span>${esc(c.name.split(' ')[0])}</span>`, 'customer-chip' + (selected ? ' selected' : ''), `data-id="${id}" aria-pressed="${selected}" aria-label="${esc(c.name)}, ${money(store.balance(id))} outstanding"`); }).join('')}</div></section>${btn('choose', icon('user') + `<span>${c ? (prefs.lang === 'hi' ? 'ग्राहक: ' : 'For ') + esc(c.name) : t('Choose a customer')}</span>` + icon('down'), 'customer-selector')}<div class="keypad" aria-label="Amount keypad">${['1','2','3','4','5','6','7','8','9','.','0','delete'].map(k => btn('key', k === 'delete' ? icon('delete') : k, 'key', `data-key="${k}" aria-label="${k === 'delete' ? 'Delete last digit' : k === '.' ? 'Decimal point' : k}"`)).join('')}</div><div class="save-area">${btn('save', saveText, 'primary save-button', `${!canSave ? 'disabled' : ''}`)}<p class="support centered" id="save-help">${!Number(ui.amount) ? 'Enter an amount, then choose a customer.' : !c ? 'Choose who this credit is for.' : 'Credit · No payment received'}</p></div></div>`;
}
function ledger() {
  const c = customer();
  const entries = store.ledger(c.id).reverse();
  const balance = store.balance(c.id);
  return `${heading('Ledger')}<div class="page-body"><div class="customer-heading"><span class="avatar">${esc(c.initials)}</span><h2>${esc(c.name)}</h2></div>${toast()}<section class="balance-card"><p>${t('Outstanding')}</p><div class="display-amount">${money(balance)}</div><p class="support">${balance < 0 ? 'Customer has an advance with the shop.' : 'What ' + esc(c.name.split(' ')[0]) + ' owes the shop'}</p></section>${pendingBand(c.id)}<div class="section-row history-heading"><h2>${t('History')}</h2><span class="support">Latest first</span></div><p class="support history-note">Each line shows the balance after that entry.</p><div class="ledger-list">${entries.length ? entries.map(e => `<article class="ledger-row ${e.voided ? 'voided' : ''}"><div class="entry-main"><span class="entry-icon">${icon(e.kind === 'payment' ? 'minus' : 'plus')}</span><div><p class="support">${esc(new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }))} · IST</p><strong class="entry-label">${e.kind === 'payment' ? '− Received' : '+ Given'}${e.kind === 'pending' ? ' · UPI pending' : e.method ? ' · ' + esc(e.method) : ''}</strong></div><strong class="line-amount">${e.kind === 'payment' ? '−' : '+'}${money(e.amount)}</strong></div>${e.note ? `<p class="support entry-note">${esc(entryNote(e))}</p>` : ''}<div class="entry-bottom"><span>Balance after <strong>${money(e.runningBalance)}</strong></span>${btn('entry-detail', e.voided ? 'Cancelled · Details' : 'Details', 'text-button small', `data-id="${e.id}"`)}</div>${e.voided ? `<p class="cancel-reason">Cancelled · ${esc(e.voided.reason)}<br>Excluded from balance</p>` : ''}</article>`).join('') : `<div class="empty-state">${icon('ledger')}<h3>A fresh page.</h3><p>No entries for ${esc(c.name.split(' ')[0])} yet.</p>${btn('home', 'Add the first credit', 'outline')}</div>`}</div></div><footer class="sticky-actions">${btn('upi', icon('receive') + t('Receive via UPI'), 'outline')}${btn('reminder', icon('send') + t('Send reminder'), 'primary', balance <= 0 ? 'disabled' : '')}${balance <= 0 ? '<p class="support centered">No payment due. No reminder needed.</p>' : ''}</footer>`;
}
function reminder() {
  const c = customer();
  if (!ui.message) ui.message = store.draftReminder({ customerId: c.id, tone: ui.tone });
  return `${heading('Reminder', 'ledger-back')}<div class="page-body reminder-page"><span class="eyebrow">A LITTLE NUDGE</span><h2>Clear words.<br>A familiar voice.</h2><div class="recipient"><span class="avatar">${esc(c.initials)}</span><div><strong>To: ${esc(c.name)}</strong><p class="support">Outstanding: ${money(store.balance(c.id))}</p></div></div><fieldset><legend>Choose a tone</legend><div class="tone-options">${['gentle','clear','firm'].map(tone => btn('tone', tone[0].toUpperCase()+tone.slice(1), ui.tone === tone ? 'selected-option' : '', `data-tone="${tone}" aria-pressed="${ui.tone === tone}"`)).join('')}</div></fieldset><label class="field-label" for="message">Message preview · English</label><textarea id="message" rows="6">${esc(ui.message)}</textarea><p class="support">You can edit this before copying.</p><div class="quiet-card">${icon('copy')}<p>Only copies the text.<br>No message is sent from this demo.</p></div>${toast()}</div><footer class="sticky-actions">${btn('copy', icon('copy')+t('Copy message'), 'primary', store.balance(c.id) <= 0 ? 'disabled' : '')}${btn('ledger-back', 'Back to ledger', 'text-button')}</footer>`;
}
function qrGraphic() {
  // Decorative checkerboard with intentionally broken finder patterns. Contains no payment payload.
  let squares = '';
  for (let y=0;y<21;y++) for(let x=0;x<21;x++) if ((x*7+y*11+x*y)%5<2 && !(x>5&&x<15&&y>7&&y<13)) squares += `<rect x="${x*6}" y="${y*6}" width="6" height="6"/>`;
  return `<svg class="fake-qr" viewBox="-12 -12 150 150" role="img" aria-label="Decorative demo QR illustration, not a payment code"><rect x="-12" y="-12" width="150" height="150" style="fill:var(--surface)"/><g style="fill:var(--accent)">${squares}</g><rect x="27" y="46" width="74" height="32" rx="4" fill="#FFFCF5"/><text x="64" y="67" text-anchor="middle" fill="#174C3C" font-size="16" font-weight="700">DEMO</text></svg>`;
}
function upi() {
  const u = ui.upi;
  const c = customer(u.customerId);
  const purchase = u.purpose === 'purchase';
  let content;
  if (u.step === 'amount') content = `<span class="eyebrow">01 / AMOUNT</span><h2>Receive via UPI</h2><p class="support">For ${esc(c.name)} · simulated payment</p><fieldset><legend>What is this payment for?</legend><div class="purpose-options">${btn('purpose', 'Existing balance', !purchase ? 'selected-option' : '', 'data-purpose="repayment"')}${btn('purpose', 'New purchase', purchase ? 'selected-option' : '', 'data-purpose="purchase"')}</div></fieldset><p class="purpose-help">${purchase ? 'A new sale. If held, this amount is added to credit.' : 'Pays down the existing balance. If held, no new credit is added.'}</p><label class="field-label" for="upi-amount">${t('Amount')} (₹)</label><input id="upi-amount" class="amount-input" type="text" inputmode="decimal" value="${esc(u.amount)}" autocomplete="off"><p id="upi-error" class="support">Enter up to 9 digits and 2 decimal places.</p>${btn('show-qr', t('Show demo QR') + icon('arrow'), 'primary full')}<p class="support centered">No real money moves.</p>`;
  else if (u.step === 'qr') content = `<span class="eyebrow">02 / DEMO QR</span><h2>Ready to receive</h2><p class="support">${esc(c.name)} · ${purchase ? 'New purchase' : 'Existing balance'}</p><div class="display-amount centered">${money(Number(u.amount))}</div><div class="qr-frame">${qrGraphic()}<strong>DEMO ONLY · DO NOT SCAN</strong></div><p class="support centered">Decorative code. No payment destination.</p><fieldset class="simulation"><legend>Try a payment result</legend>${btn('result', icon('check') + 'Received', 'primary full', 'data-result="received"')}${btn('result', icon('clock') + 'Processing', 'outline full', 'data-result="processing"')}${btn('result', '× Failed', 'outline full', 'data-result="failed"')}</fieldset>`;
  else if (u.step === 'received') content = `<span class="eyebrow">03 / RESULT</span><div class="result-icon">${icon('check')}</div><h2 class="result-title">Received ${money(Number(u.amount))}</h2><p class="centered">From ${esc(c.name)}</p><div class="balance-card"><strong>✓ Recorded in the local ledger</strong><p class="support">Outstanding now</p><div class="medium-amount">${money(store.balance(c.id))}</div></div><p class="support centered">Demo confirmation · no money moved</p>${btn('ledger-back', icon('ledger') + t('View ledger'), 'primary full')}${btn('home', t('New entry'), 'outline full')}`;
  else if (u.step === 'processing') content = `<span class="eyebrow">03 / RESULT</span><div class="result-icon neutral">${icon('clock')}</div><h2 class="result-title">UPI is processing</h2><div class="medium-amount centered">${money(Number(u.amount))}</div><p class="centered"><strong>Not received yet.</strong><br>For ${esc(c.name)}</p><div class="quiet-card"><p>${purchase ? 'Hold this new purchase as credit. The amount will be added to the balance until received.' : 'Keep the existing debt while this payment is pending. Holding it will not add credit again.'}</p></div>${btn('hold', t('Hold as credit'), 'primary full')}${btn('wait-result', t('Wait'), 'outline full')}<p class="support centered">You can mark it received from the pending card.</p>`;
  else content = `<span class="eyebrow">03 / RESULT</span><div class="result-icon neutral">×</div><h2 class="result-title">UPI failed</h2><div class="medium-amount centered">${money(Number(u.amount))}</div><p class="centered"><strong>No payment received.</strong><br>Your ledger has not changed.</p>${btn('retry', 'Try demo again', 'primary full')}${purchase ? btn('failed-credit', t('Move to credit'), 'outline full') : btn('ledger-back', 'Keep existing balance', 'outline full')}`;
  return `${heading('Receive via UPI', 'upi-back')}<div class="page-body upi-page">${content}</div>`;
}
function scenarios() {
  return `<div class="scenario-list">${[
    ['normal','01','Entry ready','₹250, with Ravi selected'],
    ['empty','02','Empty ledger','A fresh page for Ravi'],
    ['pending','03','One UPI pending','₹250 held as new credit'],
    ['failed','04','Failed UPI','No payment, no ledger change'],
    ['undo','05','Undo banner','A real 5-second undo window'],
    ['xl','06','Extra-large text','More room, vertical scrolling']
  ].map(([id,n,title,desc]) => btn('scenario', `<span class="scenario-number">${n}</span><span><strong>${title}</strong><span class="scenario-desc">${desc}</span></span>${icon('arrow')}`, 'scenario', `data-scenario="${id}"`)).join('')}</div>`;
}
function settings() {
  return `${heading('Settings')}<div class="page-body settings-page"><p class="support">Make the counter feel right for you.</p><fieldset><legend>${t('Text size')}</legend><div class="size-options">${['standard','large','xl'].map((s,i) => btn('size', ['Standard','Large','Extra large'][i], prefs.size === s ? 'selected-option' : '', `data-size="${s}" aria-pressed="${prefs.size===s}"`)).join('')}</div></fieldset><fieldset><legend>${t('Colour theme')}</legend><div class="theme-options">${[['bahi','Bahi red','#8E1C17'],['marigold','Marigold','#7A4A00'],['green','Green','#174C3C'],['mono','Black and white','#111111']].map(([k,label,sw]) => btn('theme', `<span class="theme-swatch" style="background:${sw}" aria-hidden="true"></span>${label}`, prefs.theme === k ? 'selected-option' : '', `data-theme="${k}" aria-pressed="${prefs.theme===k}"`)).join('')}</div><p class="support">Money given and received are always shown with a sign and a word, not by colour alone.</p></fieldset><fieldset><legend>${t('Language')}</legend><div class="language-options">${btn('language', 'English', prefs.lang==='en'?'selected-option':'', 'data-lang="en" aria-pressed="'+(prefs.lang==='en')+'"')}${btn('language', 'हिंदी <span lang="en">Hindi</span>', prefs.lang==='hi'?'selected-option':'', 'data-lang="hi" lang="hi" aria-pressed="'+(prefs.lang==='hi')+'"')}</div><p class="support">Main headings and buttons only. Reminder text stays in English.</p><p class="language-note">Hindi labels are AI-drafted and not reviewed by a native speaker</p></fieldset><div class="setting-toggle"><div><strong>${t('Reduce motion')}</strong><p class="support">Also respects your device setting.</p></div><button class="toggle" type="button" role="switch" aria-label="Reduce motion" aria-checked="${prefs.reduce}" data-action="motion"><span></span></button></div><section class="agent-card"><div class="section-row"><h2>AI assistant tools</h2><span class="tool-count">${AGENT_TOOLS.length}</span></div><strong>${agentMode === 'webmcp' ? 'WebMCP · 6 tools registered' : 'JavaScript API · 6 tools available'}</strong><p class="support">${agentMode === 'webmcp' ? 'Also available as window.counterKhata.' : 'WebMCP registration not confirmed. Available as window.counterKhata.'}</p><details><summary>Tool names & interface</summary><code>window.counterKhata.call(name, args)</code><ul>${AGENT_TOOLS.map(t => `<li><code>${t.name}</code></li>`).join('')}</ul><p class="support">Arguments: agent-actions.json<br>All actions use fictional local data.</p></details></section><section class="mobile-judge"><h2>Judge controls</h2><p class="support">Scenarios replace demo entries.</p>${scenarios()}</section><section class="reset-section">${btn('reset', t('Reset demo data'), 'outline full')}<p class="support">Restores fictional data and default settings.</p><p class="support">${persistent ? 'Data stays in this browser. Nothing is synced.' : 'Storage unavailable. Data lasts for this session only.'}</p></section></div>`;
}
function judgePanel() {
  document.querySelector('#judge-panel').innerHTML = `<span class="eyebrow">THE INTERACTIVE PROTOTYPE</span><h2>Every state.<br>One tap away.</h2><p>Explore the small decisions behind a calmer counter.</p><div class="panel-label"><span>JUDGE CONTROLS</span><span>↙ LIVE DEMO</span></div>${scenarios()}<div class="panel-footer">${icon('ledger')}<p>Fictional people. Local data.<br>No payments. No messages.</p></div><p class="support">Scenarios reset demo data.<br>Also in Settings on mobile.</p>`;
}
function render() {
  const focused = document.activeElement;
  let focusSelector = null;
  if (focused?.matches('button[data-action]') && !sheet.contains(focused)) {
    focusSelector = 'button' + [...focused.attributes].filter(a => a.name.startsWith('data-')).map(a => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
  }
  applyPrefs();
  document.querySelector('.phone-top').innerHTML = ui.page === 'home'
    ? `<span class="top-timer">${icon('clock')}<span id="timer">${ui.start ? 'Recording · ' + ((performance.now()-ui.start)/1000).toFixed(1) + ' s' : ui.elapsed !== null ? (ui.synthetic ? 'Judge-created entry' : 'Saved in ' + ui.elapsed.toFixed(1) + ' s') : 'Ready when you are'}</span></span>${btn('settings', icon('settings'), 'icon-button', `aria-label="${t('Settings')}"`)}`
    : '<span>Counter khata</span><span class="local-dot">Local demo</span>';
  screen.innerHTML = ({home, ledger, reminder, upi, settings}[ui.page])();
  document.querySelector('.phone').dataset.page = ui.page;
  if(focusSelector) document.querySelector(focusSelector)?.focus({preventScroll:true});
}
function navigate(page) { ui.page = page; render(); document.querySelector('.phone').scrollTop=0; window.scrollTo(0,0); document.querySelector('#screen-title')?.focus({preventScroll:true}); }
function mutate(fn) { mutation = true; try { return fn(); } finally { mutation=false; saveExtra(); } }
store.subscribe(() => {
  if (!mutation) { ui.toast = 'Local ledger updated by an assistant tool.'; render(); announce(ui.toast); }
});
function openDialog(html, action = null) {
  activeDialog = action;
  sheet.innerHTML = `<div class="sheet-head"><h2 id="sheet-title">${html.title}</h2>${btn('close-dialog', icon('close'), 'icon-button', 'aria-label="Close dialog"')}</div><div class="sheet-body">${html.body}</div>`;
  sheet.showModal();
}
function closeDialog() { sheet.close(); activeDialog=null; }
function selectCustomer(id) {
  if (ui.selected && ui.selected !== id && Number(ui.amount)>0) {
    openDialog({title:'Change customer?',body:`<p>Use ${money(Number(ui.amount))} for <strong>${esc(customer(id).name)}</strong> instead of ${esc(customer(ui.selected).name)}?</p>${btn('confirm-dialog','Use this customer','primary full')}${btn('close-dialog','Keep current customer','outline full')}`}, () => { ui.selected=id; render(); });
  } else { ui.selected=id; render(); announce('For ' + customer(id).name); }
}
function chooseCustomer(forLedger=false) {
  const rows = () => store.state.customers.map(c => `<button type="button" class="search-customer" data-action="pick" data-id="${c.id}" data-ledger="${forLedger}" data-search="${esc(c.name.toLowerCase())}"><span class="avatar">${esc(c.initials)}</span><span><strong>${esc(c.name)}</strong><span class="support">${money(store.balance(c.id))} outstanding · ID ${esc(c.id)}</span></span>${icon('arrow')}</button>`).join('');
  openDialog({title:'Choose a customer',body:`<label class="field-label" for="customer-search">Search name</label><input id="customer-search" type="search" placeholder="e.g. Ravi" autocomplete="off"><div class="customer-results">${rows()}</div><p id="no-results" class="support" hidden>No matching customers.</p>`});
  sheet.querySelector('input').focus();
}
function enterKey(key) {
  if (ui.page !== 'home') return;
  if (!ui.start) { ui.start=performance.now(); ui.elapsed=null; ui.toast=''; }
  let value=ui.amount;
  if (key==='delete') value=value.slice(0,-1);
  else if (key==='.') { if (value.includes('.')) return; value=(value||'0')+'.'; }
  else { if (value.includes('.') && value.split('.')[1].length>=2) { announce('Maximum two decimal places'); return; } if (!value.includes('.') && value.replace(/^0/,'').length>=9) { announce('Maximum nine digits'); return; } value=value==='0'?key:value+key; }
  ui.amount=value;
  render();
  // Restore physical-keyboard focus after updating the keypad.
  screen.querySelector(`[data-key="${key}"]`)?.focus({preventScroll:true});
  announce('Amount ' + money(Number(value)||0));
}
function offerUndo(entry, elapsed) {
  clearTimeout(undoTimeout);
  ui.elapsed=elapsed;
  ui.undo={ id:entry.id, customerId:entry.customerId, amount:entry.amount, until:Date.now()+5000 };
  undoTimeout=setTimeout(() => { ui.undo=null; if(!ui.start){ ui.toast='Saved on this '+(persistent?'browser':'session')+'. You can cancel it in the ledger.'; setTimeout(()=>{ if(ui.toast&&ui.toast.startsWith('Saved on this')){ ui.toast=''; render(); } },3500); } render(); },5000);
}
function saveCredit() {
  if (!(Number(ui.amount)>0) || !ui.selected) return;
  ui.synthetic=false;
  const elapsed=ui.start ? (performance.now()-ui.start)/1000 : 0;
  const id=ui.selected, amount=Number(ui.amount);
  const entry=mutate(() => store.addCredit({ customerId:id, amount }));
  ui.customerId=id;
  recent=[id,...recent.filter(x=>x!==id)].slice(0,6);
  ui.amount=''; ui.selected=null; ui.start=null;
  offerUndo(entry,elapsed); saveExtra(); render();
  announce(`${money(amount)} added to ${customer(id).name}. Saved in ${elapsed.toFixed(1)} seconds. Undo available for five seconds.`);
}
function beginUpi() {
  const c=customer();
  ui.upi={customerId:c.id, amount:String(Math.max(0,store.balance(c.id))||250), purpose:'repayment',step:'amount', completed:false, from:ui.page};
  ui.toast=''; navigate('upi');
}
function receiveUpi() {
  const u=ui.upi;
  if (u.completed) return;
  u.completed=true;
  mutate(() => {
    if (u.purpose==='purchase') store.addCredit({customerId:u.customerId,amount:Number(u.amount),note:'New purchase · paid by UPI'});
    store.recordPayment({customerId:u.customerId,amount:Number(u.amount),method:'UPI'});
  });
  ui.customerId=u.customerId; u.step='received'; render(); announce('Received '+money(Number(u.amount))+'. Recorded in the local ledger.');
}
function holdUpi() {
  const u=ui.upi;
  if(u.completed)return;
  u.completed=true;
  mutate(() => {
    if (u.purpose==='purchase') store.holdPendingUpi({customerId:u.customerId,amount:Number(u.amount)});
    else debts.push({id:'repay-'+crypto.randomUUID(),customerId:u.customerId,amount:Number(u.amount),purpose:'repayment',at:new Date().toISOString()});
  });
  ui.amount=''; ui.selected=null; ui.start=null; ui.toast='UPI pending. Not received yet.';
  navigate('home'); announce(ui.toast);
}
function markReceived(id) {
  const e=pendingItems().find(e=>e.id===id);
  if(!e) return;
  openDialog({title:'Mark as received?',body:`<p>Simulate receiving <strong>${money(e.amount)}</strong> from <strong>${esc(customer(e.customerId).name)}</strong>?</p><p class="support">${e.purpose==='repayment'?'This reduces the existing balance.':'This clears the held purchase.'} No real money moves.</p>${btn('confirm-dialog','Confirm received','primary full')}${btn('close-dialog','Keep pending','outline full')}`},() => {
    const current=pendingItems().find(x=>x.id===id); if(!current) return;
    mutate(() => {
      if(e.source==='core') store.resolvePendingUpi({entryId:id,arrived:true});
      else { const linked=debts.find(x=>x.id===id); linked.resolved=true; store.recordPayment({customerId:e.customerId,amount:e.amount,method:'UPI'}); }
    });
    ui.customerId=e.customerId;
    ui.upi={customerId:e.customerId,amount:String(e.amount),purpose:e.purpose,step:'received',completed:true,from:'home'};
    navigate('upi'); announce('Received '+money(e.amount)+'. Pending cleared.');
  });
}
function moveCredit(id) {
  const e=pendingItems().find(e=>e.id===id); if(!e||e.source!=='core')return;
  openDialog({title:'UPI failed?',body:`<p>Stop waiting for this UPI and keep <strong>${money(e.amount)}</strong> on ${esc(customer(e.customerId).name)}’s khata?</p><p class="support">The goods were already given. If the money arrives late, it clears this credit once.</p>${btn('confirm-dialog','Keep on khata','primary full')}${btn('close-dialog','Keep waiting','outline full')}`},()=>{
    mutate(()=>{ store.resolvePendingUpi({entryId:id,arrived:false}); debts.push({id:'late-'+id,customerId:e.customerId,amount:e.amount,purpose:'purchase',at:e.at,linkedId:id}); });
    ui.toast='Kept as credit. No extra amount added.'; render(); announce(ui.toast);
  });
}
function showEntry(id) {
  const e=store.ledger(ui.customerId).find(x=>x.id===id);if(!e)return;
  const liveLink=debts.some(d=>d.linkedId===id&&!d.resolved);
  openDialog({title:e.voided?'Cancelled entry':'Entry details',body:`<p class="medium-amount">${e.kind==='payment'?'− Received':'+ Given'} ${money(e.amount)}</p><p>Balance after: <strong>${money(e.runningBalance)}</strong></p><p class="support">Transaction ID: <code>${esc(e.id)}</code></p>${e.note?`<p>${esc(entryNote(e))}</p>`:''}${e.voided?`<p>Cancelled: ${esc(e.voided.reason)}</p>`:liveLink?'<p class="support">This entry has a linked pending payment. Resolve that payment before cancelling this line.</p>':`${btn('cancel-entry','Cancel this entry','outline full',`data-id="${id}"`)}<p class="support">Kept in history, excluded from the balance.</p>`}`});
}
function setScenario(which) {
  clearTimeout(undoTimeout);
  mutation=true; replaceState(store,seed()); mutation=false;
  debts=[]; ui.synthetic=false;ui.undo=null;ui.toast='';ui.elapsed=null;ui.start=null;ui.amount='250';ui.selected='ravi';ui.customerId='ravi';ui.pendingIndex=0; showGuide=false;
  prefs.size=which==='xl'?'xl':'standard';recent=[...demoIds];
  if(which==='empty') { mutation=true; replaceState(store,{...store.state,entries:store.state.entries.filter(e=>e.customerId!=='ravi')});mutation=false;ui.page='ledger'; }
  else if(which==='pending') { mutate(()=>store.holdPendingUpi({customerId:'ravi',amount:250}));ui.page='home'; }
  else if(which==='failed') {ui.upi={customerId:'ravi',amount:'250',purpose:'purchase',step:'failed',completed:false,from:'home'};ui.page='upi';}
  else if(which==='undo') { const e=mutate(()=>store.addCredit({customerId:'ravi',amount:250}));offerUndo(e,0);ui.synthetic=true;ui.toast='Judge-created entry';ui.amount='';ui.selected=null;ui.page='home'; }
  else ui.page='home';
  saveExtra();navigate(ui.page); announce('Demo scenario: '+which+'. Fictional entries reset.');
}
async function handleAction(button) {
  const a=button.dataset.action;
  if(a==='key') return enterKey(button.dataset.key);
  if(a==='home') { ui.toast=''; return navigate('home'); }
  if(a==='settings') return navigate('settings');
  if(a==='dismiss-guide') {showGuide=false;render();return;}
  if(a==='select') return selectCustomer(button.dataset.id);
  if(a==='choose') return chooseCustomer();
  if(a==='pick') {const {id,ledger}=button.dataset;closeDialog();if(ledger==='true'){ui.customerId=id;navigate('ledger');}else selectCustomer(id);return;}
  if(a==='ledger') {if(!ui.selected&&!ui.undo&&ui.elapsed===null)return chooseCustomer(true);ui.customerId=ui.selected||ui.customerId;return navigate('ledger');}
  if(a==='ledger-back') {ui.toast='';return navigate('ledger');}
  if(a==='save') return saveCredit();
  if(a==='undo') {
    if(!ui.undo||Date.now()>=ui.undo.until)return;
    const e=store.state.entries.find(e=>e.id===ui.undo.id);
    if(e&&!e.voided)mutate(()=>store.voidEntry(e.id,'Undone after saving'));
    clearTimeout(undoTimeout);ui.undo=null;ui.toast='Credit cancelled. Kept in the ledger history.';render();announce(ui.toast);return;
  }
  if(a==='next-pending') {ui.pendingIndex=(ui.pendingIndex+1)%pendingItems(ui.page==='ledger'?ui.customerId:null).length;render();return;}
  if(a==='wait') {ui.toast='Still pending. Balance unchanged.';render();announce(ui.toast);return;}
  if(a==='mark-received')return markReceived(button.dataset.id);
  if(a==='move-credit')return moveCredit(button.dataset.id);
  if(a==='entry-detail')return showEntry(button.dataset.id);
  if(a==='cancel-entry') {const id=button.dataset.id;closeDialog();openDialog({title:'Cancel this entry?',body:`<p>The original line will stay in history with a strike-through. Its amount will be excluded from the balance.</p>${btn('confirm-dialog','Confirm cancellation','primary full')}${btn('close-dialog','Keep entry','outline full')}`},()=>{mutate(()=>store.voidEntry(id));render();announce('Entry cancelled and kept in history.');});return;}
  if(a==='reminder') {ui.message='';ui.tone='gentle';ui.toast='';return navigate('reminder');}
  if(a==='tone') {ui.tone=button.dataset.tone;ui.message=store.draftReminder({customerId:ui.customerId,tone:ui.tone});ui.toast='';render();return;}
  if(a==='copy') {
    try {await navigator.clipboard.writeText(ui.message);ui.toast='Message copied. Nothing sent.';render();announce(ui.toast);}
    catch {const field=document.querySelector('#message');field.focus();field.select();ui.toast='Copy unavailable. Text selected — use your device’s Copy action.';document.querySelector('#live').textContent=ui.toast;const note=document.createElement('p');note.className='notice';note.textContent=ui.toast;field.after(note);}
    return;
  }
  if(a==='upi')return beginUpi();
  if(a==='upi-back') {if(ui.upi.step==='amount'||ui.upi.completed)return navigate(ui.upi.from||'ledger');ui.upi.step='amount';render();return;}
  if(a==='purpose') {ui.upi.purpose=button.dataset.purpose;render();return;}
  if(a==='show-qr') {
    const value=ui.upi.amount;
    if(!/^\d{1,9}(\.\d{1,2})?$/.test(value)||!(Number(value)>0)){document.querySelector('#upi-error').textContent='Enter an amount above zero, with up to 2 decimal places.';document.querySelector('#upi-amount').setAttribute('aria-invalid','true');announce('Enter a valid amount above zero.',true);return;}
    ui.upi.step='qr';render();return;
  }
  if(a==='result') {if(ui.upi.completed)return;if(button.dataset.result==='received')return receiveUpi();ui.upi.step=button.dataset.result;render();announce(ui.upi.step==='processing'?'UPI processing. Not received.':'UPI failed. No payment received.');return;}
  if(a==='hold')return holdUpi();
  if(a==='wait-result') {ui.upi.step='qr';render();announce('Still waiting. No ledger change. Choose a simulated result when ready.');return;}
  if(a==='retry') {ui.upi.step='qr';render();return;}
  if(a==='failed-credit') {const u=ui.upi;openDialog({title:'Record as credit?',body:`<p>Add ${money(Number(u.amount))} to ${esc(customer(u.customerId).name)}’s balance? No payment was received.</p>${btn('confirm-dialog','Confirm credit','primary full')}${btn('close-dialog','Back','outline full')}`},()=>{if(u.completed)return;u.completed=true;mutate(()=>store.addCredit({customerId:u.customerId,amount:Number(u.amount),note:'UPI failed; kept as credit'}));ui.toast='Failed payment kept as credit.';navigate('ledger');});return;}
  if(a==='size') {prefs.size=button.dataset.size;saveExtra();render();return;}
  if(a==='theme') {prefs.theme=button.dataset.theme;saveExtra();render();announce('Colour theme: '+button.textContent.trim());return;}
  if(a==='language') {prefs.lang=button.dataset.lang;saveExtra();render();return;}
  if(a==='motion') {prefs.reduce=!prefs.reduce;saveExtra();render();return;}
  if(a==='scenario')return setScenario(button.dataset.scenario);
  if(a==='close-dialog')return closeDialog();
  if(a==='confirm-dialog') {const action=activeDialog;closeDialog();action?.();return;}
  if(a==='reset') {openDialog({title:'Reset this demo?',body:`<p>Replace all local entries with the original fictional data and restore default settings?</p>${btn('confirm-dialog','Reset demo data','primary full')}${btn('close-dialog','Keep my demo','outline full')}`},()=>{setScenario('normal');prefs.size='standard';prefs.lang='en';prefs.reduce=false;prefs.theme='bahi';ui.amount='';ui.selected=null;ui.elapsed=null;saveExtra();navigate('home');announce('Demo reset. No customer selected.');});}
}
document.addEventListener('click', e=> {const b=e.target.closest('button[data-action]');if(!b||b.disabled)return;handleAction(b).catch(error=>{announce('Could not complete this action. '+error.message,true);});});
document.addEventListener('input',e=>{
  if(e.target.id==='customer-search') {const query=e.target.value.toLowerCase();let count=0;sheet.querySelectorAll('[data-search]').forEach(row=>{row.hidden=!row.dataset.search.includes(query);if(!row.hidden)count++;});sheet.querySelector('#no-results').hidden=Boolean(count);}
  if(e.target.id==='message')ui.message=e.target.value;
  if(e.target.id==='upi-amount')ui.upi.amount=e.target.value;
});
document.addEventListener('keydown',e=>{
  if(ui.page!=='home'||sheet.open||e.ctrlKey||e.metaKey||e.altKey||e.target.matches('input,textarea,select'))return;
  if(/^\d$/.test(e.key)||e.key==='.'||e.key==='Backspace'){e.preventDefault();enterKey(e.key==='Backspace'?'delete':e.key);}
});
sheet.addEventListener('cancel',()=>{activeDialog=null;});
setInterval(()=>{
  const timer=document.querySelector('#timer');if(timer&&ui.start)timer.textContent='Recording · '+((performance.now()-ui.start)/1000).toFixed(1)+' s';
  const left=document.querySelector('#undo-seconds');if(left&&ui.undo)left.textContent=Math.max(1,Math.ceil((ui.undo.until-Date.now())/1000));
},100);
judgePanel();render();
