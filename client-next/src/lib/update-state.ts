// Shared "update in progress" flag.
//
// During a self-update the backend blocks for several minutes (git/npm/build
// run synchronously) and then restarts itself. Health polling therefore sees
// a disconnect that is EXPECTED. This flag lets the app shell show a calm
// "update in progress" screen instead of the "Backend disconnected" landing
// page (whose restart button would corrupt the update if clicked).
//
// Stored in localStorage (not sessionStorage) so that any tab — including one
// opened mid-update — observes the same state.

const KEY = 'ocs-update-in-progress';

// Generous upper bound: worst case is a ~15 min client build plus npm installs.
// If the flag is older than this, assume the update died and stop masking real
// disconnects with the updating screen.
const MAX_AGE_MS = 20 * 60 * 1000;

export function markUpdateInProgress(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {}
}

export function clearUpdateInProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export function isUpdateInProgress(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const started = Number.parseInt(raw, 10);
    if (!Number.isFinite(started) || Date.now() - started > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
