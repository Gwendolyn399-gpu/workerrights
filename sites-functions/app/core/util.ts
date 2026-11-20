export function deepClone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function newId(): string {
  return crypto.randomUUID();
}

// Python round(): banker's rounding (half to even).
export function pyRound(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

// Python f"{value:.Nf}" rounds the original binary double directly. Scaling
// first (value*10**N) fabricates exact midpoints (1.05*10 === 10.5) that Python
// never sees, so format the double itself and reattach the sign.
export function pyFixed(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  return value < 0 || Object.is(value, -0) ? `-${text}` : text;
}

export function isIntegerValue(value: number): boolean {
  return Number.isFinite(value) && Math.floor(value) === value;
}

export function thousands(value: number): string {
  return Math.trunc(value).toLocaleString("en-US");
}

export function stripSuffix(text: string, suffix: string): string {
  return text.endsWith(suffix) ? text.slice(0, text.length - suffix.length) : text;
}

export function truthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return Boolean(value);
}

// Exact decimal arithmetic on JS number string forms (mirrors Decimal(str(x))).
export interface DecimalLite {
  digits: bigint;
  scale: number;
}

export function parseDecimal(value: number | string): DecimalLite {
  const text = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) throw new Error("invalid_decimal");
  const sign = match[1] === "-" ? -1n : 1n;
  const intPart = match[2];
  const fracPart = match[3] ?? "";
  const exponent = match[4] ? parseInt(match[4], 10) : 0;
  let digits = BigInt(intPart + fracPart) * sign;
  let scale = fracPart.length - exponent;
  if (scale < 0) {
    digits *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { digits, scale };
}

function align(a: DecimalLite, b: DecimalLite): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [a.digits * 10n ** BigInt(scale - a.scale), b.digits * 10n ** BigInt(scale - b.scale), scale];
}

export function decimalSub(a: number | string, b: number | string): DecimalLite {
  const [left, right, scale] = align(parseDecimal(a), parseDecimal(b));
  return { digits: left - right, scale };
}

export function decimalEquals(a: DecimalLite, b: number | string): boolean {
  const [left, right] = align(a, parseDecimal(b));
  return left === right;
}

export function decimalNegative(a: DecimalLite): boolean {
  return a.digits < 0n;
}

export function decimalToString(a: DecimalLite): string {
  const negative = a.digits < 0n;
  const abs = (negative ? -a.digits : a.digits).toString();
  if (a.scale === 0) return (negative ? "-" : "") + abs;
  const padded = abs.padStart(a.scale + 1, "0");
  const text = `${padded.slice(0, padded.length - a.scale)}.${padded.slice(padded.length - a.scale)}`;
  return (negative ? "-" : "") + text;
}

export async function sha256Hex(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const record = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(record)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + canonicalJson(record[key]))
      .join(",") +
    "}"
  );
}