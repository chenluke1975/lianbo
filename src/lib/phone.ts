const EMERGENCY = new Set(["110", "119", "112", "113", "911", "999", "000"]);

export function normalizeNumber(input: string): string {
  let raw = input.trim().replace(/[^\d+]/g, "");
  if (raw.startsWith("+886")) raw = `0${raw.slice(4)}`;
  else if (raw.startsWith("886") && raw.length >= 11) raw = `0${raw.slice(3)}`;
  return raw.replace(/\D/g, "").slice(0, 15);
}

export function numberIssue(digits: string): string | null {
  if (EMERGENCY.has(digits)) {
    return "這是緊急專線，請直接用電話撥打，不要連撥。";
  }
  return null;
}

export function canDial(digits: string): boolean {
  return digits.length >= 3 && digits.length <= 15 && !EMERGENCY.has(digits);
}

function joinParts(digits: string, sizes: number[]): string {
  const parts: string[] = [];
  let index = 0;
  for (const size of sizes) {
    if (index >= digits.length) break;
    parts.push(digits.slice(index, index + size));
    index += size;
  }
  if (index < digits.length) parts.push(digits.slice(index));
  return parts.join("-");
}

export function formatNumber(digits: string): string {
  if (!digits) return "";
  if (digits.startsWith("0800")) return joinParts(digits, [4, 3, 3]);
  if (digits.startsWith("09")) return joinParts(digits, [4, 3, 3]);
  if (digits.startsWith("02")) return joinParts(digits, [2, 4, 4]);
  if (/^0[3-8]/.test(digits)) {
    return digits.length <= 9 ? joinParts(digits, [2, 3, 4]) : joinParts(digits, [2, 4, 4]);
  }
  if (digits.length <= 5) return digits;
  return digits.replace(/(\d{4})(?=\d)/g, "$1-");
}

export function formatSpan(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} 秒`;
  return `${minutes} 分 ${String(rest).padStart(2, "0")} 秒`;
}

export function formatClock(at: number): string {
  return new Intl.DateTimeFormat("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(at);
}
