// Counter khata — design-independent core (state, actions, undo, pending UPI, agent tools).
// Concept prototype for a UI/UX challenge. All data is fictional. No real payment or messaging happens.

const STORE_KEY = "counter-khata-demo-v1";

const SEED = {
  customers: [
    { id: "c1", name: "Ramesh Kumar", initials: "RK" },
    { id: "c2", name: "Sunita Devi", initials: "SD" },
    { id: "c3", name: "Arif Khan", initials: "AK" },
    { id: "c4", name: "Meena Patel", initials: "MP" },
    { id: "c5", name: "Joseph D'Souza", initials: "JD" },
    { id: "c6", name: "Lakshmi Iyer", initials: "LI" },
    { id: "c7", name: "Harpreet Singh", initials: "HS" },
    { id: "c8", name: "Pooja Sharma", initials: "PS" }
  ],
  // kind: "credit" = goods given on credit (customer owes more)
  //       "payment" = money received (customer owes less)
  //       "pending" = UPI payment still processing, held as credit until it lands
  entries: [
    { id: "e1", customerId: "c1", kind: "credit", amount: 450, note: "Rice 5 kg", at: "2026-11-17T10:12:00+05:30" },
    { id: "e2", customerId: "c1", kind: "payment", amount: 200, method: "cash", at: "2026-11-18T18:40:00+05:30" },
    { id: "e3", customerId: "c2", kind: "credit", amount: 1250, note: "Monthly groceries", at: "2026-11-02T09:05:00+05:30" },
    { id: "e4", customerId: "c3", kind: "credit", amount: 80, note: "Milk, bread", at: "2026-11-19T08:15:00+05:30" }
  ]
};

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return prefix + Math.random().toString(36).slice(2, 9);
}

export function formatINR(n) {
  // Indian digit grouping: 1,25,000
  return "₹" + Number(n).toLocaleString("en-IN");
}

export class KhataStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.listeners = new Set();
    this.undoStack = [];
    this.state = this.#load();
  }

  #load() {
    try {
      const raw = this.storage && this.storage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) { /* private mode or blocked storage: fall back to seed */ }
    return structuredClone(SEED);
  }

  #save() {
    try { this.storage && this.storage.setItem(STORE_KEY, JSON.stringify(this.state)); } catch (_) { /* ignore */ }
    for (const fn of this.listeners) fn(this.state);
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  reset() { this.state = structuredClone(SEED); this.undoStack = []; this.#save(); }

  customer(id) { return this.state.customers.find(c => c.id === id); }

  // Most recent customers first (for the thumb-zone chips).
  recentCustomers(limit = 6) {
    const lastSeen = new Map();
    for (const e of this.state.entries) {
      const t = Date.parse(e.at);
      if (!lastSeen.has(e.customerId) || lastSeen.get(e.customerId) < t) lastSeen.set(e.customerId, t);
    }
    return [...this.state.customers]
      .sort((a, b) => (lastSeen.get(b.id) || 0) - (lastSeen.get(a.id) || 0))
      .slice(0, limit);
  }

  // Balance = what the customer owes the shop. Pending UPI counts as owed until it lands.
  balance(customerId) {
    let b = 0;
    for (const e of this.state.entries) {
      if (e.customerId !== customerId || e.voided) continue;
      if (e.kind === "credit" || e.kind === "pending") b += e.amount;
      if (e.kind === "payment") b -= e.amount;
    }
    return b;
  }

  // Line-by-line explanation of how the balance was reached (for disputes).
  ledger(customerId) {
    let running = 0;
    return this.state.entries
      .filter(e => e.customerId === customerId)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .map(e => {
        if (!e.voided) {
          if (e.kind === "credit" || e.kind === "pending") running += e.amount;
          if (e.kind === "payment") running -= e.amount;
        }
        return { ...e, runningBalance: running };
      });
  }

  #push(entry) {
    this.state.entries.push(entry);
    this.undoStack.push({ type: "add", id: entry.id });
    this.#save();
    return entry;
  }

  addCredit({ customerId, amount, note = "" }) {
    if (!this.customer(customerId)) throw new Error("Unknown customer");
    if (!(amount > 0)) throw new Error("Amount must be more than zero");
    return this.#push({ id: newId("e"), customerId, kind: "credit", amount, note, at: nowIso() });
  }

  recordPayment({ customerId, amount, method = "cash" }) {
    if (!this.customer(customerId)) throw new Error("Unknown customer");
    if (!(amount > 0)) throw new Error("Amount must be more than zero");
    return this.#push({ id: newId("e"), customerId, kind: "payment", amount, method, at: nowIso() });
  }

  // UPI shows "processing": keep the goods moving, hold the amount as credit.
  holdPendingUpi({ customerId, amount }) {
    if (!this.customer(customerId)) throw new Error("Unknown customer");
    return this.#push({ id: newId("p"), customerId, kind: "pending", amount, at: nowIso() });
  }

  // The bank confirms the money arrived: the pending line turns into a payment-cleared credit pair.
  resolvePendingUpi({ entryId, arrived }) {
    const e = this.state.entries.find(x => x.id === entryId && x.kind === "pending");
    if (!e) throw new Error("No pending UPI entry with that id");
    const before = structuredClone(e);
    if (arrived) {
      e.kind = "credit"; e.note = "UPI was processing";
      const pay = { id: newId("e"), customerId: e.customerId, kind: "payment", amount: e.amount, method: "UPI", at: nowIso() };
      this.state.entries.push(pay);
      this.undoStack.push({ type: "resolve", id: e.id, before, addedId: pay.id });
    } else {
      e.kind = "credit"; e.note = "UPI failed; kept as credit";
      this.undoStack.push({ type: "resolve", id: e.id, before, addedId: null });
    }
    this.#save();
    return e;
  }

  // Mark an entry as wrong (kept in history, excluded from balance).
  voidEntry(entryId, reason = "Entered by mistake") {
    const e = this.state.entries.find(x => x.id === entryId);
    if (!e) throw new Error("No entry with that id");
    e.voided = { reason, at: nowIso() };
    this.undoStack.push({ type: "void", id: entryId });
    this.#save();
    return e;
  }

  undo() {
    const last = this.undoStack.pop();
    if (!last) return false;
    const entries = this.state.entries;
    if (last.type === "add") this.state.entries = entries.filter(e => e.id !== last.id);
    if (last.type === "void") { const e = entries.find(x => x.id === last.id); if (e) delete e.voided; }
    if (last.type === "resolve") {
      const i = entries.findIndex(x => x.id === last.id);
      if (i >= 0) entries[i] = last.before;
      if (last.addedId) this.state.entries = this.state.entries.filter(e => e.id !== last.addedId);
    }
    this.#save();
    return true;
  }

  draftReminder({ customerId, tone = "gentle", lang = "en" }) {
    const c = this.customer(customerId);
    if (!c) throw new Error("Unknown customer");
    const amt = formatINR(this.balance(customerId));
    const first = c.name.split(" ")[0];
    const t = {
      en: {
        gentle: `Namaste ${first} ji, a small note from the shop: your khata shows ${amt}. Pay whenever convenient. Thank you!`,
        clear: `Hello ${first} ji, your khata balance is ${amt}. Please clear it this week. You can pay by UPI or cash.`,
        firm: `${first} ji, ${amt} has been pending on your khata for some time. Please pay by Sunday.`
      }
      // Hindi strings are added in the UI layer, marked as AI-drafted and not native-reviewed.
    };
    return (t[lang] || t.en)[tone] || t.en.gentle;
  }
}

// Agent tools (to A). Same actions a person can do on screen.
export const AGENT_TOOLS = [
  { name: "add_credit", description: "Record goods given on credit to a customer.", inputSchema: { type: "object", properties: { customerId: { type: "string" }, amount: { type: "number" }, note: { type: "string" } }, required: ["customerId", "amount"] } },
  { name: "record_payment", description: "Record money received from a customer.", inputSchema: { type: "object", properties: { customerId: { type: "string" }, amount: { type: "number" }, method: { type: "string", enum: ["cash", "UPI"] } }, required: ["customerId", "amount"] } },
  { name: "get_balance", description: "Get what a customer owes the shop.", inputSchema: { type: "object", properties: { customerId: { type: "string" } }, required: ["customerId"] } },
  { name: "list_ledger", description: "List a customer's entries with the running balance.", inputSchema: { type: "object", properties: { customerId: { type: "string" } }, required: ["customerId"] } },
  { name: "draft_reminder", description: "Draft a payment reminder in a chosen tone. Does not send anything.", inputSchema: { type: "object", properties: { customerId: { type: "string" }, tone: { type: "string", enum: ["gentle", "clear", "firm"] } }, required: ["customerId"] } },
  { name: "hold_pending_upi", description: "Hold a still-processing UPI payment as credit so the sale can finish.", inputSchema: { type: "object", properties: { customerId: { type: "string" }, amount: { type: "number" } }, required: ["customerId", "amount"] } }
];

export function agentHandlers(store) {
  return {
    add_credit: a => store.addCredit(a),
    record_payment: a => store.recordPayment(a),
    get_balance: a => ({ customerId: a.customerId, balance: store.balance(a.customerId) }),
    list_ledger: a => store.ledger(a.customerId),
    draft_reminder: a => ({ text: store.draftReminder(a) }),
    hold_pending_upi: a => store.holdPendingUpi(a)
  };
}

// Register with WebMCP when the browser offers it; otherwise expose a plain JS API.
// API names are still moving (document.modelContext vs navigator.modelContext), so detect both.
export function exposeAgentTools(store) {
  const handlers = agentHandlers(store);
  globalThis.counterKhata = { tools: AGENT_TOOLS, call: (name, args) => handlers[name](args) };
  const mc = (globalThis.document && document.modelContext) || (globalThis.navigator && navigator.modelContext);
  if (!mc || typeof mc.registerTool !== "function") return "js-api-only";
  for (const t of AGENT_TOOLS) {
    try {
      mc.registerTool({ ...t, execute: async args => ({ content: [{ type: "text", text: JSON.stringify(handlers[t.name](args)) }] }) });
    } catch (_) { return "js-api-only"; }
  }
  return "webmcp";
}
