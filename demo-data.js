// UI-only fixtures and safe local storage. The supplied core is untouched.
export const CORE_KEY = 'counter-khata-demo-v1';
export const EXTRA_KEY = 'counter-khata-ui-v1';
const fallback = new Map();
let nativeStorage;
try {
  nativeStorage = globalThis.localStorage;
  nativeStorage.setItem('khata-storage-check', '1');
  nativeStorage.removeItem('khata-storage-check');
} catch { nativeStorage = null; }
export const persistent = Boolean(nativeStorage);
export const storage = {
  getItem(key) { try { return nativeStorage ? nativeStorage.getItem(key) : fallback.get(key) ?? null; } catch { return fallback.get(key) ?? null; } },
  setItem(key, value) { fallback.set(key, value); try { nativeStorage?.setItem(key, value); } catch { /* session fallback */ } }
};
export const demoIds = ['ravi', 'meena', 'arjun', 'sita', 'kabir', 'dev'];
export function fixture(base) {
  const state = structuredClone(base);
  const names = ['Ravi Shah', 'Meena Patel', 'Arjun Rao', 'Sita Joshi', 'Kabir Das', 'Dev Patel'];
  state.customers = [
    ...names.map((name, i) => ({ id: demoIds[i], name, initials: name.split(' ').map(s => s[0]).join('') })),
    ...state.customers
  ];
  state.entries.push(
    { id: 'r-opening', customerId: 'ravi', kind: 'credit', amount: 1000, note: 'Opening balance', at: '2026-11-17T18:00:00+05:30' },
    { id: 'r-given-1', customerId: 'ravi', kind: 'credit', amount: 250, note: 'Groceries', at: '2026-11-18T09:10:00+05:30' },
    { id: 'r-given-2', customerId: 'ravi', kind: 'credit', amount: 500, note: 'Groceries', at: '2026-11-18T10:05:00+05:30' },
    { id: 'r-received', customerId: 'ravi', kind: 'payment', amount: 500, method: 'UPI', at: '2026-11-18T11:20:00+05:30' }
  );
  return state;
}
export function replaceState(store, state) {
  store.state = state;
  store.undoStack = [];
  storage.setItem(CORE_KEY, JSON.stringify(state));
  for (const listener of store.listeners) listener(state);
}
export function loadExtra() {
  try { return JSON.parse(storage.getItem(EXTRA_KEY)) || {}; } catch { return {}; }
}
