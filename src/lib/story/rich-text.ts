/**
 * TextMeshPro rich text in story tables (`<size=150%>`, `<r=reading>base</r>`, `<b>`, `<br>`, …). Size, emphasis
 * and furigana are kept as runs; layout tags (align, pos, voffset, rotate, cspace, …) and colors are dropped: colors
 * were picked for the game's dark text window and can vanish on the site's paper. Unknown tags stay as text.
 */
export interface StoryTextRun {
  text: string;
  /** Font size relative to the surrounding text. */
  scale?: number;
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  /** Furigana over the run's text. */
  ruby?: string;
}

const TMP_TAGS = new Set([
  "align", "alpha", "b", "br", "color", "cspace", "font", "font-weight", "gradient", "i", "indent", "line-height",
  "line-indent", "link", "lowercase", "margin", "mark", "mspace", "nobr", "noparse", "page", "pos", "r", "rotate",
  "ruby", "s", "size", "smallcaps", "space", "sprite", "strikethrough", "style", "sub", "sup", "u", "uppercase",
  "voffset", "width",
]);
const TAG = /<(\/?)([a-z][a-z-]*)(?:\s*=\s*"?([^">]*)"?)?\s*>/gi;
// TextMeshPro sizes without a unit are points; story text is set at roughly this size.
const BASE_POINTS = 36;

export function parseRichText(input: string): { text: string; runs?: StoryTextRun[] } {
  if (!input.includes("<")) return { text: input };
  const runs: StoryTextRun[] = [];
  const sizes: number[] = [];
  const counts = { b: 0, i: 0, u: 0, s: 0 };
  let ruby: string | undefined;
  let styled = false;

  const push = (text: string) => {
    if (!text) return;
    const run: StoryTextRun = { text };
    const scale = sizes.at(-1);
    if (scale !== undefined && scale !== 1) run.scale = scale;
    if (counts.b) run.bold = true;
    if (counts.i) run.italic = true;
    if (counts.u) run.underline = true;
    if (counts.s) run.strike = true;
    if (ruby) run.ruby = ruby;
    const last = runs.at(-1);
    if (last && !run.ruby && !last.ruby && sameStyle(last, run)) last.text += text;
    else runs.push(run);
  };

  let cursor = 0;
  for (const match of input.matchAll(TAG)) {
    const [raw, closing, rawName, value = ""] = match;
    const name = rawName!.toLowerCase();
    if (!TMP_TAGS.has(name)) continue;
    push(input.slice(cursor, match.index));
    cursor = match.index! + raw.length;
    switch (name) {
      case "br":
        push("\n");
        break;
      case "size": {
        if (closing) sizes.pop();
        else sizes.push(sizeScale(value, sizes.at(-1) ?? 1));
        styled = true;
        break;
      }
      case "b": case "i": case "u": case "s":
        counts[name] = Math.max(0, counts[name] + (closing ? -1 : 1));
        styled = true;
        break;
      case "strikethrough":
        counts.s = Math.max(0, counts.s + (closing ? -1 : 1));
        styled = true;
        break;
      case "r": case "ruby":
        ruby = closing ? undefined : value.trim() || undefined;
        styled = true;
        break;
    }
  }
  push(input.slice(cursor));

  const text = runs.map((run) => run.text).join("");
  return styled && runs.some((run) => run.scale || run.bold || run.italic || run.underline || run.strike || run.ruby)
    ? { text, runs }
    : { text };
}

/** The text without markup, for names, captions, search and timing. */
export function plainRichText(input: string): string {
  return parseRichText(input).text;
}

function sizeScale(value: string, current: number): number {
  const trimmed = value.trim();
  const amount = Number.parseFloat(trimmed.replace(/^\+/, ""));
  if (!Number.isFinite(amount)) return current;
  let scale: number;
  if (trimmed.endsWith("%")) scale = amount / 100;
  else if (trimmed.endsWith("em")) scale = amount;
  else if (/^[+-]/.test(trimmed)) scale = current + amount / BASE_POINTS;
  else scale = amount / BASE_POINTS;
  return Math.min(2.5, Math.max(0.5, Math.round(scale * 100) / 100));
}

function sameStyle(a: StoryTextRun, b: StoryTextRun): boolean {
  return a.scale === b.scale && a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.strike === b.strike;
}
