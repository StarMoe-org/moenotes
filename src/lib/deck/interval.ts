/** Exact rational certificate endpoints, retained even below the binary64 subnormal range. */
export interface DeckFraction { numerator: string; denominator: string }
export interface DeckInterval {
  /** Outward binary64 projections for numeric consumers. */
  lower: number;
  upper: number;
  exact: { lower: DeckFraction; upper: DeckFraction };
}
type Rational = { n: bigint; d: bigint };
const MAX_FINITE_BITS = 0x7fefffffffffffffn;
const MANTISSA_MASK = (1n << 52n) - 1n;
const buffer = new ArrayBuffer(8);
const view = new DataView(buffer);

export function parseFraction(raw: unknown): DeckFraction | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.numerator !== "string" || !/^-?\d+$/.test(value.numerator)
    || typeof value.denominator !== "string" || !/^\d+$/.test(value.denominator) || BigInt(value.denominator) === 0n) return null;
  return { numerator: value.numerator, denominator: value.denominator };
}
const rational = (value: DeckFraction): Rational => ({ n: BigInt(value.numerator), d: BigInt(value.denominator) });
const wire = ({ n, d }: Rational): DeckFraction => ({ numerator: String(n), denominator: String(d) });

function fromBits(bits: bigint): Rational {
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const mantissa = (bits & MANTISSA_MASK) + (exponent === 0 ? 0n : 1n << 52n);
  const power = exponent === 0 ? -1074 : exponent - 1075;
  return power < 0 ? { n: mantissa, d: 1n << BigInt(-power) } : { n: mantissa << BigInt(power), d: 1n };
}
function numberFraction(value: number): Rational {
  view.setFloat64(0, Math.abs(value));
  const result = fromBits(view.getBigUint64(0));
  return { n: value < 0 ? -result.n : result.n, d: result.d };
}
function numberFromBits(bits: bigint): number {
  view.setBigUint64(0, bits);
  return view.getFloat64(0);
}
const compare = (a: Rational, b: Rational): number => {
  const difference = a.n * b.d - b.n * a.d;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
};

/** Binary search over ordered positive IEEE encodings avoids Number(n)/Number(d) overflow/underflow. */
function outward(value: Rational): [number, number] {
  const positive = { n: value.n < 0n ? -value.n : value.n, d: value.d };
  let low = 0n, high = MAX_FINITE_BITS;
  while (low < high) {
    const middle = (low + high + 1n) >> 1n;
    if (compare(fromBits(middle), positive) <= 0) low = middle;
    else high = middle - 1n;
  }
  const floor = numberFromBits(low);
  const ceil = compare(fromBits(low), positive) === 0 ? floor : numberFromBits(low + 1n);
  return value.n < 0n ? [-ceil, -floor] : [floor, ceil];
}

export function parseInterval(raw: unknown): DeckInterval | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") throw new Error("Invalid certified interval");
  const value = raw as Record<string, unknown>;
  const endpoint = (item: unknown): Rational => {
    if (typeof item === "number" && Number.isFinite(item)) return numberFraction(item);
    const fraction = parseFraction(item);
    if (!fraction) throw new Error("Invalid certified interval endpoint");
    return rational(fraction);
  };
  const lower = endpoint(value.lower), upper = endpoint(value.upper);
  if (compare(lower, upper) > 0) throw new Error("Inverted certified interval");
  return { lower: outward(lower)[0], upper: outward(upper)[1], exact: { lower: wire(lower), upper: wire(upper) } };
}

function divide(n: bigint, d: bigint, edge: "lower" | "upper"): bigint {
  const whole = n / d, remainder = n % d;
  return whole + (remainder === 0n ? 0n : edge === "lower" && n < 0n ? -1n : edge === "upper" && n > 0n ? 1n : 0n);
}
function scaled(value: Rational, places: number, edge: "lower" | "upper"): bigint {
  return places >= 0 ? divide(value.n * 10n ** BigInt(places), value.d, edge)
    : divide(value.n, value.d * 10n ** BigInt(-places), edge);
}
function decimal(units: bigint, places: number, locale: string): string {
  const absolute = units < 0n ? -units : units, scale = 10n ** BigInt(places);
  const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(absolute / scale);
  const parts = new Intl.NumberFormat(locale).formatToParts(-1.1);
  const sign = units < 0n ? parts.find(part => part.type === "minusSign")?.value ?? "-" : "";
  const fraction = places === 0 ? "" : String(absolute % scale).padStart(places, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `${parts.find(part => part.type === "decimal")?.value ?? "."}${fraction}` : ""}`;
}
function endpointText(value: DeckFraction, edge: "lower" | "upper", locale: string, places: number): string {
  const exact = rational(value), absolute = exact.n < 0n ? -exact.n : exact.n;
  if (absolute !== 0n && absolute * 100n < exact.d) {
    // Four significant digits, rounded outward with integers. Tiny probabilities stay visible.
    let exponent = String(absolute).length - String(exact.d).length;
    if (exponent >= 0 ? absolute < exact.d * 10n ** BigInt(exponent) : absolute * 10n ** BigInt(-exponent) < exact.d) exponent--;
    let units = scaled(exact, 3 - exponent, edge);
    if (units >= 10000n || units <= -10000n) { units /= 10n; exponent++; }
    return `${decimal(units, 3, locale)}e${exponent}`;
  }
  return decimal(scaled(exact, places, edge), places, locale);
}

/** Round decimal display outward too; ordinary nearest/floor formatting can invalidate an upper bound. */
export function formatDeckInterval(interval: DeckInterval, locale: string, maximumFractionDigits: number): string {
  return `${endpointText(interval.exact.lower, "lower", locale, maximumFractionDigits)} – ${endpointText(interval.exact.upper, "upper", locale, maximumFractionDigits)}`;
}
