import { create } from "zustand";
import { canDial, normalizeNumber } from "@/lib/phone";

export type Outcome = "busy" | "missed" | "machine" | "connected";
export type Phase = "setup" | "ready" | "counting" | "away" | "paused" | "done";
export type DoneReason = "connected" | "limit" | "stopped" | null;

export type Attempt = {
  id: string;
  at: number;
  outcome: Outcome | null;
};

export type Recent = {
  number: string;
  label: string;
  usedAt: number;
};

export const INTERVALS = [3, 5, 10, 15, 30] as const;
export const LIMITS: Array<number | null> = [5, 10, 20, 50, null];

const INTERVAL_SET = new Set<number>(INTERVALS);
const LIMIT_SET = new Set<number>([5, 10, 20, 50]);
const PHASES: readonly Phase[] = ["setup", "ready", "counting", "away", "paused", "done"];
const OUTCOMES: readonly Outcome[] = ["busy", "missed", "machine", "connected"];
const KEY = "lianbo-v1";

type Store = {
  hydrated: boolean;
  number: string;
  label: string;
  intervalSec: number;
  limit: number | null;
  chimeOn: boolean;
  phase: Phase;
  attempts: Attempt[];
  countdownEndsAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  pausedFrom: Phase | null;
  remainMs: number | null;
  doneReason: DoneReason;
  recents: Recent[];
  now: number;
  shouldChime: boolean;
  hydrate: () => void;
  tick: (now: number) => void;
  setNumber: (value: string) => void;
  appendDigit: (digit: string) => void;
  backspace: () => void;
  setLabel: (value: string) => void;
  setIntervalSec: (value: number) => void;
  setLimit: (value: number | null) => void;
  toggleChime: () => void;
  applyRecent: (number: string) => void;
  startRound: () => void;
  recordDial: (next: "away" | "counting") => void;
  beginCountdown: () => void;
  skipWait: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  markLatest: (outcome: Outcome) => void;
  markConnected: () => void;
  clearChime: () => void;
  resetToSetup: () => void;
};

type Snapshot = {
  v: 1;
  number: string;
  label: string;
  intervalSec: number;
  limit: number | null;
  chimeOn: boolean;
  phase: Phase;
  attempts: Attempt[];
  countdownEndsAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  pausedFrom: Phase | null;
  remainMs: number | null;
  doneReason: DoneReason;
  recents: Recent[];
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function isPhase(value: unknown): value is Phase {
  return typeof value === "string" && (PHASES as readonly string[]).includes(value);
}

function isOutcome(value: unknown): value is Outcome {
  return typeof value === "string" && (OUTCOMES as readonly string[]).includes(value);
}

function isDoneReason(value: unknown): value is DoneReason {
  return value === null || value === "connected" || value === "limit" || value === "stopped";
}

function sanitizeAttempts(value: unknown): Attempt[] {
  if (!Array.isArray(value)) return [];
  const attempts: Attempt[] = [];
  for (const item of value.slice(-80)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<Attempt>;
    if (typeof row.id !== "string" || typeof row.at !== "number") continue;
    attempts.push({
      id: row.id,
      at: row.at,
      outcome: isOutcome(row.outcome) ? row.outcome : null,
    });
  }
  return attempts;
}

function sanitizeRecents(value: unknown): Recent[] {
  if (!Array.isArray(value)) return [];
  const recents: Recent[] = [];
  for (const item of value.slice(0, 6)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<Recent>;
    if (typeof row.number !== "string" || typeof row.usedAt !== "number") continue;
    const number = normalizeNumber(row.number);
    if (!canDial(number)) continue;
    recents.push({
      number,
      label: typeof row.label === "string" ? row.label.slice(0, 24) : "",
      usedAt: row.usedAt,
    });
  }
  return recents;
}

function readSnapshot(): Partial<Store> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Snapshot>;
    if (data.v !== 1) return null;

    const number = normalizeNumber(typeof data.number === "string" ? data.number : "");
    const label = typeof data.label === "string" ? data.label.slice(0, 24) : "";
    const intervalSec =
      typeof data.intervalSec === "number" && INTERVAL_SET.has(data.intervalSec)
        ? data.intervalSec
        : 10;
    let limit: number | null = 20;
    if (data.limit === null) limit = null;
    else if (typeof data.limit === "number" && LIMIT_SET.has(data.limit)) limit = data.limit;

    let phase: Phase = isPhase(data.phase) ? data.phase : "setup";
    let attempts = sanitizeAttempts(data.attempts);
    let countdownEndsAt =
      typeof data.countdownEndsAt === "number" ? data.countdownEndsAt : null;
    const startedAt = typeof data.startedAt === "number" ? data.startedAt : null;
    let finishedAt = typeof data.finishedAt === "number" ? data.finishedAt : null;
    let pausedFrom = isPhase(data.pausedFrom) ? data.pausedFrom : null;
    let remainMs = typeof data.remainMs === "number" ? data.remainMs : null;
    let doneReason: DoneReason = isDoneReason(data.doneReason) ? data.doneReason : null;

    if (phase !== "setup" && !canDial(number)) phase = "setup";
    if (phase === "counting" && (countdownEndsAt === null || countdownEndsAt <= Date.now())) {
      phase = "ready";
      countdownEndsAt = null;
    }
    if (phase === "setup") {
      attempts = [];
      countdownEndsAt = null;
      pausedFrom = null;
      remainMs = null;
      doneReason = null;
      finishedAt = null;
    }
    if (phase !== "paused") {
      pausedFrom = null;
      remainMs = null;
    }
    if (phase !== "done") {
      doneReason = null;
      finishedAt = null;
    }

    return {
      number,
      label,
      intervalSec,
      limit,
      chimeOn: data.chimeOn !== false,
      phase,
      attempts,
      countdownEndsAt,
      startedAt,
      finishedAt,
      pausedFrom,
      remainMs,
      doneReason,
      recents: sanitizeRecents(data.recents),
    };
  } catch {
    return null;
  }
}

function snapshotOf(state: Store): Snapshot {
  return {
    v: 1,
    number: state.number,
    label: state.label,
    intervalSec: state.intervalSec,
    limit: state.limit,
    chimeOn: state.chimeOn,
    phase: state.phase,
    attempts: state.attempts,
    countdownEndsAt: state.countdownEndsAt,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    pausedFrom: state.pausedFrom,
    remainMs: state.remainMs,
    doneReason: state.doneReason,
    recents: state.recents,
  };
}

function sameSnapshot(a: Store, b: Store) {
  return (
    a.number === b.number &&
    a.label === b.label &&
    a.intervalSec === b.intervalSec &&
    a.limit === b.limit &&
    a.chimeOn === b.chimeOn &&
    a.phase === b.phase &&
    a.attempts === b.attempts &&
    a.countdownEndsAt === b.countdownEndsAt &&
    a.startedAt === b.startedAt &&
    a.finishedAt === b.finishedAt &&
    a.pausedFrom === b.pausedFrom &&
    a.remainMs === b.remainMs &&
    a.doneReason === b.doneReason &&
    a.recents === b.recents
  );
}

function upsertRecent(recents: Recent[], number: string, label: string): Recent[] {
  const next: Recent = { number, label, usedAt: Date.now() };
  return [next, ...recents.filter((item) => item.number !== number)].slice(0, 6);
}

function withConnected(attempts: Attempt[]): Attempt[] {
  if (attempts.length === 0) {
    return [{ id: uid(), at: Date.now(), outcome: "connected" }];
  }
  return attempts.map((attempt, index) =>
    index === attempts.length - 1 ? { ...attempt, outcome: "connected" } : attempt,
  );
}

function reachLimit(finishedAt: number): Partial<Store> {
  return {
    phase: "done",
    doneReason: "limit",
    countdownEndsAt: null,
    pausedFrom: null,
    remainMs: null,
    finishedAt,
    shouldChime: false,
  };
}

const initial: Pick<
  Store,
  | "hydrated"
  | "number"
  | "label"
  | "intervalSec"
  | "limit"
  | "chimeOn"
  | "phase"
  | "attempts"
  | "countdownEndsAt"
  | "startedAt"
  | "finishedAt"
  | "pausedFrom"
  | "remainMs"
  | "doneReason"
  | "recents"
  | "now"
  | "shouldChime"
> = {
  hydrated: false,
  number: "",
  label: "",
  intervalSec: 10,
  limit: 20,
  chimeOn: true,
  phase: "setup",
  attempts: [],
  countdownEndsAt: null,
  startedAt: null,
  finishedAt: null,
  pausedFrom: null,
  remainMs: null,
  doneReason: null,
  recents: [],
  now: 0,
  shouldChime: false,
};

export const useLianbo = create<Store>((set, get) => ({
  ...initial,
  hydrate: () => {
    if (get().hydrated) return;
    const saved = readSnapshot();
    set({ hydrated: true, now: Date.now(), ...saved });
  },
  tick: (now) => {
    const state = get();
    if (
      state.phase === "counting" &&
      state.countdownEndsAt !== null &&
      now >= state.countdownEndsAt
    ) {
      if (state.limit !== null && state.attempts.length >= state.limit) {
        set({ now, ...reachLimit(now) });
        return;
      }
      set({ now, phase: "ready", countdownEndsAt: null, shouldChime: true });
      return;
    }
    if (state.phase === "counting" || state.phase === "ready" || state.phase === "away") {
      set({ now });
    }
  },
  setNumber: (value) => set({ number: normalizeNumber(value) }),
  appendDigit: (digit) => {
    if (!/^\d$/.test(digit)) return;
    set((state) => ({ number: normalizeNumber(state.number + digit) }));
  },
  backspace: () => set((state) => ({ number: state.number.slice(0, -1) })),
  setLabel: (value) => set({ label: value.slice(0, 24) }),
  setIntervalSec: (value) => {
    if (!INTERVAL_SET.has(value)) return;
    set({ intervalSec: value });
  },
  setLimit: (value) => {
    if (value !== null && !LIMIT_SET.has(value)) return;
    set({ limit: value });
  },
  toggleChime: () => set((state) => ({ chimeOn: !state.chimeOn })),
  applyRecent: (number) => {
    const found = get().recents.find((item) => item.number === number);
    if (!found) return;
    set({ number: found.number, label: found.label });
  },
  startRound: () => {
    const state = get();
    if (!canDial(state.number)) return;
    const label = state.label.trim();
    set({
      label,
      phase: "ready",
      attempts: [],
      countdownEndsAt: null,
      startedAt: Date.now(),
      finishedAt: null,
      pausedFrom: null,
      remainMs: null,
      doneReason: null,
      shouldChime: false,
      recents: upsertRecent(state.recents, state.number, label),
    });
  },
  recordDial: (next) => {
    const state = get();
    if (state.phase !== "ready") return;
    if (state.limit !== null && state.attempts.length >= state.limit) {
      set(reachLimit(Date.now()));
      return;
    }
    const attempts = [
      ...state.attempts,
      { id: uid(), at: Date.now(), outcome: null as Outcome | null },
    ];
    if (state.limit !== null && attempts.length >= state.limit && next === "counting") {
      set({ attempts, ...reachLimit(Date.now()) });
      return;
    }
    if (next === "away") {
      set({ attempts, phase: "away", countdownEndsAt: null, shouldChime: false });
      return;
    }
    set({
      attempts,
      phase: "counting",
      countdownEndsAt: Date.now() + state.intervalSec * 1000,
      shouldChime: false,
    });
  },
  beginCountdown: () => {
    const state = get();
    if (state.phase !== "away") return;
    if (state.limit !== null && state.attempts.length >= state.limit) {
      set(reachLimit(Date.now()));
      return;
    }
    set({
      phase: "counting",
      countdownEndsAt: Date.now() + state.intervalSec * 1000,
      pausedFrom: null,
      remainMs: null,
      shouldChime: false,
    });
  },
  skipWait: () => {
    if (get().phase !== "counting") return;
    set({ phase: "ready", countdownEndsAt: null, shouldChime: false });
  },
  pause: () => {
    const state = get();
    if (state.phase === "setup" || state.phase === "done" || state.phase === "paused") return;
    const remainMs =
      state.phase === "counting" && state.countdownEndsAt
        ? Math.max(0, state.countdownEndsAt - Date.now())
        : null;
    set({
      phase: "paused",
      pausedFrom: state.phase,
      remainMs,
      countdownEndsAt: null,
      shouldChime: false,
    });
  },
  resume: () => {
    const state = get();
    if (state.phase !== "paused") return;
    if (state.pausedFrom === "counting" && state.remainMs && state.remainMs > 200) {
      set({
        phase: "counting",
        countdownEndsAt: Date.now() + state.remainMs,
        pausedFrom: null,
        remainMs: null,
      });
      return;
    }
    if (state.pausedFrom === "away") {
      set({ phase: "away", pausedFrom: null, remainMs: null });
      return;
    }
    set({ phase: "ready", pausedFrom: null, remainMs: null, shouldChime: false });
  },
  stop: () => {
    const state = get();
    if (state.phase === "setup" || state.phase === "done") return;
    set({
      phase: "done",
      doneReason: "stopped",
      countdownEndsAt: null,
      pausedFrom: null,
      remainMs: null,
      finishedAt: Date.now(),
      shouldChime: false,
    });
  },
  markLatest: (outcome) => {
    const state = get();
    if (state.phase === "setup" || state.attempts.length === 0) return;
    if (outcome === "connected") {
      get().markConnected();
      return;
    }
    const attempts = state.attempts.map((attempt, index) =>
      index === state.attempts.length - 1 ? { ...attempt, outcome } : attempt,
    );
    set({ attempts });
  },
  markConnected: () => {
    const state = get();
    if (state.phase === "setup") return;
    set({
      attempts: withConnected(state.attempts),
      phase: "done",
      doneReason: "connected",
      countdownEndsAt: null,
      pausedFrom: null,
      remainMs: null,
      finishedAt: Date.now(),
      shouldChime: false,
    });
  },
  clearChime: () => set({ shouldChime: false }),
  resetToSetup: () =>
    set({
      phase: "setup",
      attempts: [],
      countdownEndsAt: null,
      startedAt: null,
      finishedAt: null,
      pausedFrom: null,
      remainMs: null,
      doneReason: null,
      shouldChime: false,
    }),
}));

useLianbo.subscribe((state, prev) => {
  if (!state.hydrated || !prev.hydrated || typeof window === "undefined") return;
  if (sameSnapshot(state, prev)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshotOf(state)));
  } catch {
    /* ignore quota */
  }
});
