// Iter 381: canonical app-shell wallet store. Distinct from the /report
// PinnedColdkeys store — this one carries the ACTIVE-wallet marker that the
// multi-page shell (Dashboard, Transactions, Portfolio, Performance) will read
// to know which coldkey to render. localStorage only; no backend.

const WALLETS_KEY = 'tao-wr:wallets';
const ACTIVE_KEY = 'tao-wr:active-wallet';
const UPDATED_EVENT = 'tao-wr:wallets-updated';
const MAX_WALLETS = 25;
export const SS58_RE = /^5[a-km-zA-HJ-NP-Z1-9]{47}$/;

function normalise(e) {
  if (!e || typeof e !== 'object' || typeof e.coldkey !== 'string') return null;
  if (!SS58_RE.test(e.coldkey)) return null;
  return {
    coldkey: e.coldkey,
    label: typeof e.label === 'string' ? e.label.slice(0, 40) : '',
    addedAt: typeof e.addedAt === 'number' ? e.addedAt : Date.now(),
  };
}

export function loadWallets() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WALLETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalise).filter(Boolean);
  } catch {
    return [];
  }
}

export function loadActive() {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(ACTIVE_KEY);
    return v && SS58_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

function persist(list, active) {
  try {
    localStorage.setItem(WALLETS_KEY, JSON.stringify(list.slice(0, MAX_WALLETS)));
    if (active) localStorage.setItem(ACTIVE_KEY, active);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
  }
}

// Add returns { ok, error }. First wallet added becomes active automatically.
export function addWallet(coldkey, label = '') {
  const key = String(coldkey || '').trim();
  if (!SS58_RE.test(key)) {
    return { ok: false, error: 'Not a valid SS58 coldkey (starts with 5, 48 chars).' };
  }
  const list = loadWallets();
  if (list.some((w) => w.coldkey === key)) {
    return { ok: false, error: 'That wallet is already in your list.' };
  }
  if (list.length >= MAX_WALLETS) {
    return { ok: false, error: `You can track up to ${MAX_WALLETS} wallets.` };
  }
  const next = [...list, normalise({ coldkey: key, label, addedAt: Date.now() })];
  const active = loadActive() || key;
  persist(next, active);
  return { ok: true };
}

export function removeWallet(coldkey) {
  const list = loadWallets().filter((w) => w.coldkey !== coldkey);
  let active = loadActive();
  if (active === coldkey) active = list.length ? list[0].coldkey : null;
  persist(list, active);
}

export function renameWallet(coldkey, label) {
  const list = loadWallets();
  const idx = list.findIndex((w) => w.coldkey === coldkey);
  if (idx === -1) return;
  list[idx] = { ...list[idx], label: String(label || '').slice(0, 40) };
  persist(list, loadActive());
}

export function setActiveWallet(coldkey) {
  if (!loadWallets().some((w) => w.coldkey === coldkey)) return;
  persist(loadWallets(), coldkey);
}

export function subscribe(cb) {
  if (typeof window === 'undefined') return () => {};
  const onUpdate = () => cb();
  const onStorage = (e) => {
    if (e.key === WALLETS_KEY || e.key === ACTIVE_KEY) cb();
  };
  window.addEventListener(UPDATED_EVENT, onUpdate);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(UPDATED_EVENT, onUpdate);
    window.removeEventListener('storage', onStorage);
  };
}

export function shortKey(k) {
  return `${k.slice(0, 6)}…${k.slice(-6)}`;
}
