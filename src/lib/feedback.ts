import { Capacitor } from "@capacitor/core";
import { KeepAwake } from "@capacitor-community/keep-awake";

let audio: AudioContext | null = null;
let wake: WakeLockSentinel | null = null;

export function primeAudio() {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!audio) audio = new Ctor();
    if (audio.state === "suspended") void audio.resume().catch(() => undefined);
  } catch {
    audio = null;
  }
}

export function playChime() {
  try {
    if (!audio || audio.state !== "running") return;
    const start = audio.currentTime;
    [523.25, 659.25].forEach((freq, index) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      const at = start + index * 0.09;
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.05, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      osc.connect(gain);
      gain.connect(audio!.destination);
      osc.start(at);
      osc.stop(at + 0.2);
    });
  } catch {
    /* audio unavailable */
  }
}

export function prefersNativeDialer() {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export async function acquireWake() {
  if (Capacitor.isNativePlatform()) {
    // Android WebView has no Screen Wake Lock API; use the native window flag instead.
    try {
      await KeepAwake.keepAwake();
    } catch {
      /* ignore */
    }
    return;
  }
  if (!("wakeLock" in navigator)) return;
  try {
    wake = await navigator.wakeLock.request("screen");
  } catch {
    wake = null;
  }
}

export async function releaseWake() {
  if (Capacitor.isNativePlatform()) {
    try {
      await KeepAwake.allowSleep();
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    await wake?.release();
  } catch {
    /* already released */
  }
  wake = null;
}
