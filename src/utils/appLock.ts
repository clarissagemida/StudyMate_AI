// Central app-lock state shared by every protected route.
//
// "Locked" means the Supabase session is still valid, but the app requires a
// fresh password or biometric unlock before any protected screen may mount.
// The flag is persisted so that a reload, restart, or deep link cannot skip
// the unlock step. It is cleared only by the login screen after a successful
// password or device verification.

const LOCK_KEY = "studymate:app-locked";

type Listener = () => void;

const listeners = new Set<Listener>();
let cached: boolean | null = null;

function readStored(): boolean {
  try {
    return (
      typeof globalThis.localStorage !== "undefined" &&
      globalThis.localStorage.getItem(LOCK_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function persist(value: boolean) {
  try {
    if (typeof globalThis.localStorage === "undefined") return;

    if (value) {
      globalThis.localStorage.setItem(LOCK_KEY, "1");
    } else {
      globalThis.localStorage.removeItem(LOCK_KEY);
    }
  } catch {
    // Storage may be unavailable; the in-memory value still applies.
  }
}

export function isAppLocked(): boolean {
  if (cached === null) {
    cached = readStored();
  }

  return cached;
}

export function setAppLocked(next: boolean): void {
  const current = isAppLocked();

  if (current === next) return;

  cached = next;
  persist(next);

  for (const listener of listeners) {
    listener();
  }
}

export function subscribeAppLock(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
