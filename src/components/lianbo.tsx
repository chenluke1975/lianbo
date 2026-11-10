import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  Copy,
  Delete,
  Phone,
  PhoneCall,
  PhoneMissed,
  PhoneOff,
  Voicemail,
} from "lucide-react";
import { clsx } from "clsx";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import {
  acquireWake,
  playChime,
  prefersNativeDialer,
  primeAudio,
  releaseWake,
} from "@/lib/feedback";
import {
  INTERVALS,
  LIMITS,
  useLianbo,
  type Attempt,
  type DoneReason,
  type Outcome,
} from "@/lib/lianbo-store";
import { canDial, formatClock, formatNumber, formatSpan, numberIssue } from "@/lib/phone";

const OUTCOME_META: Array<{ id: Outcome; label: string; icon: typeof PhoneOff }> = [
  { id: "busy", label: "忙線", icon: PhoneOff },
  { id: "missed", label: "沒人接", icon: PhoneMissed },
  { id: "machine", label: "語音", icon: Voicemail },
  { id: "connected", label: "接通", icon: PhoneCall },
];

function outcomeText(outcome: Outcome | null) {
  if (outcome === "busy") return "忙線";
  if (outcome === "missed") return "沒人接";
  if (outcome === "machine") return "語音";
  if (outcome === "connected") return "接通";
  return "已撥出";
}

export function Lianbo() {
  useSessionEffects();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-4">
      <Header />
      <section className="desk-card rounded-3xl border border-line border-t-4 border-t-signal bg-card px-4 py-3">
        <Announcer />
        <Stage />
      </section>
    </main>
  );
}

function useSessionEffects() {
  const hydrate = useLianbo((state) => state.hydrate);
  const tick = useLianbo((state) => state.tick);
  const beginCountdown = useLianbo((state) => state.beginCountdown);
  const shouldChime = useLianbo((state) => state.shouldChime);
  const chimeOn = useLianbo((state) => state.chimeOn);
  const clearChime = useLianbo((state) => state.clearChime);
  const phase = useLianbo((state) => state.phase);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const id = window.setInterval(() => tick(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [tick]);

  useEffect(() => {
    if (!shouldChime) return;
    if (chimeOn) playChime();
    try {
      navigator.vibrate?.(50);
    } catch {
      /* some browsers reject vibrate */
    }
    clearChime();
  }, [shouldChime, chimeOn, clearChime]);

  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      const current = useLianbo.getState();
      if (current.phase === "away") current.beginCountdown();
      if (current.phase !== "setup" && current.phase !== "done") void acquireWake();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("pageshow", onReturn);
    // In the Android app, also listen for the native resume event (coming back from the dialer).
    const nativeResume = Capacitor.isNativePlatform()
      ? App.addListener("resume", onReturn)
      : null;
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("pageshow", onReturn);
      void nativeResume?.then((handle) => handle.remove());
    };
  }, [beginCountdown]);

  const active = phase !== "setup" && phase !== "done";
  useEffect(() => {
    if (!active) {
      void releaseWake();
      return;
    }
    void acquireWake();
    return () => {
      void releaseWake();
    };
  }, [active]);
}

function Header() {
  return (
    <header className="mb-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-signal text-on-signal">
            <Phone className="size-4" aria-hidden />
          </span>
          <p className="text-sm font-medium">連撥</p>
        </div>
        <ChimeToggle />
      </div>
      <h1 className="mt-2 font-display text-3xl leading-none">撥到有人接</h1>
      <p className="mt-1.5 text-sm text-muted">忙線就再打。次數和間隔幫你看著。</p>
    </header>
  );
}

function ChimeToggle() {
  const chimeOn = useLianbo((state) => state.chimeOn);
  const toggleChime = useLianbo((state) => state.toggleChime);
  return (
    <button
      type="button"
      aria-pressed={chimeOn}
      aria-label={chimeOn ? "關閉提示音" : "開啟提示音"}
      onClick={() => {
        primeAudio();
        toggleChime();
      }}
      className="press grid size-11 shrink-0 place-items-center rounded-full border border-line bg-card text-ink"
    >
      {chimeOn ? <Bell className="size-5" aria-hidden /> : <BellOff className="size-5" aria-hidden />}
    </button>
  );
}

function Announcer() {
  const phase = useLianbo((state) => state.phase);
  const count = useLianbo((state) => state.attempts.length);
  const reason = useLianbo((state) => state.doneReason);
  const message =
    phase === "ready"
      ? `可以撥第 ${count + 1} 通`
      : phase === "counting"
        ? "下一通倒數中"
        : phase === "away"
          ? "等待從電話回到這一頁"
          : phase === "paused"
            ? "已暫停"
            : phase === "done"
              ? reason === "connected"
                ? "接通了"
                : reason === "limit"
                  ? "這輪已撥完"
                  : "這輪先停下來"
              : "";
  return (
    <p className="sr-only" aria-live="polite">
      {message}
    </p>
  );
}

function Stage() {
  const phase = useLianbo((state) => state.phase);
  if (phase === "setup") return <Setup />;
  if (phase === "done") return <Done />;
  return <Live />;
}

function Setup() {
  const number = useLianbo((state) => state.number);
  const label = useLianbo((state) => state.label);
  const intervalSec = useLianbo((state) => state.intervalSec);
  const limit = useLianbo((state) => state.limit);
  const recents = useLianbo((state) => state.recents);
  const setNumber = useLianbo((state) => state.setNumber);
  const appendDigit = useLianbo((state) => state.appendDigit);
  const backspace = useLianbo((state) => state.backspace);
  const setLabel = useLianbo((state) => state.setLabel);
  const setIntervalSec = useLianbo((state) => state.setIntervalSec);
  const setLimit = useLianbo((state) => state.setLimit);
  const applyRecent = useLianbo((state) => state.applyRecent);
  const startRound = useLianbo((state) => state.startRound);
  const issue = numberIssue(number);
  const ready = canDial(number);
  const pretty = formatNumber(number);

  return (
    <div className="flex flex-col gap-2">
      <div>
        <input
          value={number}
          inputMode="tel"
          autoComplete="tel"
          spellCheck={false}
          aria-label="電話號碼"
          placeholder="輸入電話號碼"
          onChange={(event) => setNumber(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && ready) {
              event.preventDefault();
              primeAudio();
              startRound();
            }
          }}
          className="h-12 w-full bg-transparent text-center font-display text-4xl leading-none text-ink outline-none placeholder:font-sans placeholder:text-xl placeholder:text-faint"
        />
        {(issue || pretty !== number) && (
          <div className="mt-1 text-center text-sm">
            {issue ? (
              <p className="text-signal" role="alert">
                {issue}
              </p>
            ) : (
              <p className="tabular-nums text-muted">{pretty}</p>
            )}
          </div>
        )}
      </div>

      {recents.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm text-muted">最近</p>
          <div className="flex max-w-full gap-2 overflow-x-auto">
            {recents.map((recent) => (
              <button
                key={recent.number}
                type="button"
                onClick={() => applyRecent(recent.number)}
                className="press h-11 shrink-0 rounded-full border border-line bg-paper px-3 text-sm font-medium"
              >
                <span>
                  {recent.label
                    ? `${recent.label} · ${formatNumber(recent.number)}`
                    : formatNumber(recent.number)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5" aria-label="數字鍵">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => appendDigit(digit)}
            className="press h-11 rounded-xl border border-line bg-paper text-xl font-medium tabular-nums"
          >
            {digit}
          </button>
        ))}
        <div className="h-11" aria-hidden />
        <button
          type="button"
          onClick={() => appendDigit("0")}
          className="press h-11 rounded-xl border border-line bg-paper text-xl font-medium tabular-nums"
        >
          0
        </button>
        <button
          type="button"
          aria-label="刪除一位"
          onClick={backspace}
          className="press grid h-11 place-items-center rounded-xl border border-line bg-paper text-ink"
        >
          <Delete className="size-5" aria-hidden />
        </button>
      </div>

      <ChoiceRow
        label="間隔"
        value={String(intervalSec)}
        options={INTERVALS.map((seconds) => ({ id: String(seconds), label: `${seconds}秒` }))}
        onChange={(id) => setIntervalSec(Number(id))}
      />
      <ChoiceRow
        label="上限"
        value={limit === null ? "none" : String(limit)}
        options={LIMITS.map((value) => ({
          id: value === null ? "none" : String(value),
          label: value === null ? "不限" : String(value),
        }))}
        onChange={(id) => setLimit(id === "none" ? null : Number(id))}
      />

      <button
        type="button"
        disabled={!ready}
        onClick={() => {
          primeAudio();
          startRound();
        }}
        className={clsx(
          "press h-14 rounded-2xl text-lg font-semibold",
          ready ? "bg-signal text-on-signal" : "bg-line text-muted",
        )}
      >
        開始連撥
      </button>
      <input
        value={label}
        maxLength={24}
        aria-label="備註"
        placeholder="這通打給誰（選填）"
        onChange={(event) => setLabel(event.target.value)}
        className="h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none placeholder:text-faint"
      />
      <p className="text-center text-sm text-muted">點一下才撥出，回來後自動倒數。</p>
    </div>
  );
}

function ChoiceRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <p className="w-10 shrink-0 text-sm text-muted">{label}</p>
      <div className="grid flex-1 grid-cols-5 gap-1">
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.id)}
              className={clsx(
                "press h-11 rounded-lg text-sm font-medium",
                selected ? "bg-ink text-card" : "bg-paper text-muted",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Live() {
  const phase = useLianbo((state) => state.phase);
  const number = useLianbo((state) => state.number);
  const label = useLianbo((state) => state.label);
  const attempts = useLianbo((state) => state.attempts);
  const limit = useLianbo((state) => state.limit);
  const intervalSec = useLianbo((state) => state.intervalSec);
  const countdownEndsAt = useLianbo((state) => state.countdownEndsAt);
  const now = useLianbo((state) => state.now);
  const startedAt = useLianbo((state) => state.startedAt);
  const [native, setNative] = useState(false);

  useEffect(() => {
    setNative(prefersNativeDialer());
  }, []);

  const remainSec =
    phase === "counting" && countdownEndsAt
      ? Math.max(1, Math.ceil((countdownEndsAt - now) / 1000))
      : 0;
  const tally =
    limit === null ? `已撥 ${attempts.length} 通` : `已撥 ${attempts.length} / ${limit} 通`;

  return (
    <div className="flex flex-col gap-3">
      <NumberBlock number={number} label={label} />
      <p className="text-center text-sm text-muted">
        {tally}
        <span> · 每 {intervalSec} 秒</span>
        {startedAt ? <span> · {formatSpan(Math.max(0, now - startedAt))}</span> : null}
      </p>
      {limit !== null && (
        <div className="h-1 overflow-hidden rounded-full bg-paper" aria-hidden>
          <div
            className="meter-fill h-full w-full bg-signal"
            style={{ transform: `scaleX(${Math.min(1, attempts.length / limit)})` }}
          />
        </div>
      )}

      {phase === "counting" && (
        <div className="py-1 text-center">
          <p className="font-display text-6xl leading-none tabular-nums text-honey">{remainSec}</p>
          <p className="mt-1 text-sm text-muted">秒後可撥下一通</p>
        </div>
      )}

      {phase === "away" && (
        <p className="text-center text-sm leading-relaxed text-muted">
          去電話裡打完這一通。回到這裡會自動倒數；若還停在這一頁，按下面繼續。
        </p>
      )}

      {phase === "paused" && (
        <p className="text-center text-sm text-muted">先暫停。號碼還在，隨時可以繼續。</p>
      )}

      {phase === "ready" && <DialButton native={native} attempt={attempts.length + 1} />}
      {phase === "counting" && (
        <button
          type="button"
          onClick={() => {
            primeAudio();
            useLianbo.getState().skipWait();
          }}
          className="press h-12 rounded-xl border border-line bg-paper text-base font-medium"
        >
          跳過倒數
        </button>
      )}
      {phase === "away" && (
        <button
          type="button"
          onClick={() => {
            primeAudio();
            useLianbo.getState().beginCountdown();
          }}
          className="press h-14 rounded-2xl bg-signal text-lg font-semibold text-on-signal"
        >
          沒接到，開始倒數
        </button>
      )}
      {phase === "paused" && (
        <button
          type="button"
          onClick={() => {
            primeAudio();
            useLianbo.getState().resume();
          }}
          className="press h-14 rounded-2xl bg-ink text-lg font-semibold text-card"
        >
          繼續
        </button>
      )}

      {phase !== "paused" && (
        <button
          type="button"
          onClick={() => useLianbo.getState().markConnected()}
          className="press h-12 rounded-xl bg-honey-soft text-base font-medium text-ink"
        >
          接通了，停止
        </button>
      )}

      {phase !== "paused" ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => useLianbo.getState().pause()}
            className="press h-11 rounded-xl text-sm font-medium text-muted"
          >
            暫停
          </button>
          <button
            type="button"
            onClick={() => useLianbo.getState().stop()}
            className="press h-11 rounded-xl text-sm font-medium text-muted"
          >
            結束這輪
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => useLianbo.getState().stop()}
          className="press h-11 rounded-xl text-sm font-medium text-muted"
        >
          結束這輪
        </button>
      )}

      <OutcomeBar />
      <AttemptLog attempts={attempts} />
    </div>
  );
}

function DialButton({ native, attempt }: { native: boolean; attempt: number }) {
  const number = useLianbo((state) => state.number);
  const label = `撥出第 ${attempt} 通`;
  const className =
    "pulse-dial press grid h-14 w-full place-items-center rounded-2xl bg-signal text-lg font-semibold text-on-signal no-underline";
  if (native) {
    return (
      <a
        href={`tel:${number}`}
        className={className}
        onClick={() => {
          primeAudio();
          useLianbo.getState().recordDial("away");
        }}
      >
        {label}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        primeAudio();
        useLianbo.getState().recordDial("counting");
      }}
    >
      {label}
    </button>
  );
}

function NumberBlock({ number, label }: { number: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="text-center">
      {label ? <p className="text-sm text-muted">{label}</p> : null}
      <p className="font-display text-4xl leading-none tabular-nums">{formatNumber(number)}</p>
      <button
        type="button"
        onClick={() => {
          const clip = navigator.clipboard;
          if (!clip) return;
          void clip.writeText(number).then(
            () => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            },
            () => undefined,
          );
        }}
        className="press mx-auto mt-2 inline-flex h-11 items-center gap-1 px-3 text-sm text-muted"
      >
        <Copy className="size-3.5" aria-hidden />
        {copied ? "已複製" : "複製號碼"}
      </button>
    </div>
  );
}

function OutcomeBar() {
  const attempts = useLianbo((state) => state.attempts);
  const latest = attempts[attempts.length - 1];
  if (!latest) return null;
  return (
    <div>
      <p className="mb-1.5 text-sm text-muted">上一通結果</p>
      <div className="grid grid-cols-4 gap-1.5">
        {OUTCOME_META.map((item) => {
          const selected = latest.outcome === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => useLianbo.getState().markLatest(item.id)}
              className={clsx(
                "press flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl border text-xs font-medium",
                selected ? "border-ink bg-ink text-card" : "border-line bg-paper text-muted",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AttemptLog({ attempts }: { attempts: Attempt[] }) {
  if (attempts.length === 0) return null;
  const rows = [...attempts].reverse().slice(0, 6);
  const hidden = attempts.length - rows.length;
  return (
    <div>
      <p className="mb-1.5 text-sm text-muted">這輪紀錄</p>
      <ul className="flex flex-col gap-1">
        {rows.map((attempt, index) => (
          <li
            key={attempt.id}
            className="flex h-9 items-center justify-between rounded-lg bg-paper px-3 text-sm"
          >
            <span className="tabular-nums text-muted">第 {attempts.length - index} 通</span>
            <span className="tabular-nums">{formatClock(attempt.at)}</span>
            <span className={attempt.outcome === "connected" ? "text-signal" : "text-ink"}>
              {outcomeText(attempt.outcome)}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && <p className="mt-1 text-center text-sm text-muted">還有 {hidden} 通</p>}
    </div>
  );
}

function Done() {
  const reason = useLianbo((state) => state.doneReason);
  const attempts = useLianbo((state) => state.attempts);
  const number = useLianbo((state) => state.number);
  const label = useLianbo((state) => state.label);
  const limit = useLianbo((state) => state.limit);
  const startedAt = useLianbo((state) => state.startedAt);
  const finishedAt = useLianbo((state) => state.finishedAt);
  const spent =
    startedAt && finishedAt ? formatSpan(Math.max(0, finishedAt - startedAt)) : null;

  return (
    <div className="flex flex-col gap-3">
      <NumberBlock number={number} label={label} />
      <div className="text-center">
        <h2 className="font-display text-3xl leading-tight">{doneTitle(reason)}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {doneBody(reason, attempts.length, limit, spent)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          primeAudio();
          useLianbo.getState().startRound();
        }}
        className="press h-14 rounded-2xl bg-signal text-lg font-semibold text-on-signal"
      >
        再撥一輪
      </button>
      {reason !== "connected" && (
        <button
          type="button"
          onClick={() => useLianbo.getState().markConnected()}
          className="press h-12 rounded-xl bg-honey-soft text-base font-medium"
        >
          其實接通了
        </button>
      )}
      <button
        type="button"
        onClick={() => useLianbo.getState().resetToSetup()}
        className="press h-11 text-sm font-medium text-muted"
      >
        換個號碼
      </button>
      {reason !== "connected" && <OutcomeBar />}
      <AttemptLog attempts={attempts} />
    </div>
  );
}

function doneTitle(reason: DoneReason) {
  if (reason === "connected") return "接通了";
  if (reason === "limit") return "這輪撥完了";
  return "先停在這裡";
}

function doneBody(
  reason: DoneReason,
  count: number,
  limit: number | null,
  spent: string | null,
) {
  const time = spent ? `，花了 ${spent}` : "";
  if (reason === "connected") {
    return `第 ${count} 通有人接。這輪一共 ${count} 通${time}。`;
  }
  if (reason === "limit") {
    return `已撥滿 ${limit ?? count} 通${time}。若其中一通其實接通了，可以改標。`;
  }
  if (count === 0) return "這輪還沒撥出。";
  return `這輪撥了 ${count} 通${time}。`;
}
