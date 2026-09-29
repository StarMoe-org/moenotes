/**
 * The portrait share image of a player profile, drawn on a canvas in the browser: 1080 × 1440 (3:4, the shape of
 * a card's full art, which fills it). Nothing is uploaded. Every image it draws must allow CORS, or the canvas
 * could not be exported; the asset host sends `Access-Control-Allow-Origin: *` and the logo is same-origin.
 */

export const SHARE_WIDTH = 1080;
export const SHARE_HEIGHT = 1440;

/** The logo on light ground; the brand signature is always the logo, never typed text. */
const LOGO_URL = "/assets/brand/moenotes-signature.svg";

/** Everything the image shows, already localized by the caller. */
export interface ShareImageContent {
  name: string;
  /** e.g. "HK/MO/TW · ID 21139118822" */
  subtitle: string;
  stats: Array<{ label: string; value: string }>;
  /** e.g. "Verified with StarMoe Passport" */
  badge: string;
  /** e.g. the showcase card's title; may be empty. */
  caption: string;
  /** The public page's address without the scheme, or empty for a private profile. */
  link: string;
  /** The favorite card's full art; the image falls back to a plain background without it. */
  artUrl: string | null;
  /** The player's own profile card (a same-origin URL), shown at the top when there is one. */
  profileCardUrl: string | null;
}

// The site's light tokens (src/styles/tokens.css): the image looks the same whatever theme the page is in.
const colors = {
  bg: "#EEF2FA",
  bgDeep: "#DCE5F5",
  paper: "rgba(247, 250, 255, 0.94)",
  text: "#202E4C",
  muted: "#596B87",
  border: "#C5D1E6",
  cream: "#E3EAF7",
  accent: "#395EA8",
  accentSoft: "#E1EAFB",
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`image failed: ${url}`));
    image.src = url;
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draws text cut to maxWidth with an ellipsis. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number): void {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }
  const chars = [...text];
  while (chars.length > 1 && ctx.measureText(`${chars.join("")}…`).width > maxWidth) chars.pop();
  ctx.fillText(`${chars.join("")}…`, x, y);
}

/** Cover-fits an image into the canvas, like CSS `object-fit: cover`. */
function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement): void {
  const scale = Math.max(SHARE_WIDTH / image.naturalWidth, SHARE_HEIGHT / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.drawImage(image, (SHARE_WIDTH - w) / 2, (SHARE_HEIGHT - h) / 2, w, h);
}

export async function renderShareImage(content: ShareImageContent, fontFamily: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_WIDTH;
  canvas.height = SHARE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas");
  await document.fonts?.ready;

  const [art, logo, profileCard] = await Promise.all([
    content.artUrl ? loadImage(content.artUrl).catch(() => null) : Promise.resolve(null),
    loadImage(LOGO_URL).catch(() => null),
    content.profileCardUrl ? loadImage(content.profileCardUrl).catch(() => null) : Promise.resolve(null),
  ]);

  // Background: the card art, or the site's page colors.
  if (art) {
    drawCover(ctx, art);
  } else {
    const ground = ctx.createLinearGradient(0, 0, SHARE_WIDTH, SHARE_HEIGHT);
    ground.addColorStop(0, colors.bg);
    ground.addColorStop(1, colors.bgDeep);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);
  }
  // A soft fade under the panel keeps it readable on busy art.
  const fade = ctx.createLinearGradient(0, SHARE_HEIGHT * 0.45, 0, SHARE_HEIGHT);
  fade.addColorStop(0, "rgba(32, 46, 76, 0)");
  fade.addColorStop(1, "rgba(32, 46, 76, 0.45)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);

  const margin = 48;

  // The player's profile card, framed at the top, over the art.
  if (profileCard) {
    const w = SHARE_WIDTH - margin * 2;
    const h = Math.round((w * profileCard.naturalHeight) / profileCard.naturalWidth);
    ctx.save();
    ctx.shadowColor = "rgba(32, 46, 76, 0.3)";
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 10;
    roundedRect(ctx, margin, margin, w, h, 28);
    ctx.fillStyle = colors.paper;
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundedRect(ctx, margin, margin, w, h, 28);
    ctx.clip();
    ctx.drawImage(profileCard, margin, margin, w, h);
    ctx.restore();
    roundedRect(ctx, margin, margin, w, h, 28);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(247, 250, 255, 0.9)";
    ctx.stroke();
  }

  // The panel.
  const panelHeight = 560;
  const px = margin;
  const py = SHARE_HEIGHT - margin - panelHeight;
  const pw = SHARE_WIDTH - margin * 2;
  const pad = 48;
  ctx.save();
  ctx.shadowColor = "rgba(32, 46, 76, 0.25)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  roundedRect(ctx, px, py, pw, panelHeight, 40);
  ctx.fillStyle = colors.paper;
  ctx.fill();
  ctx.restore();
  roundedRect(ctx, px, py, pw, panelHeight, 40);
  ctx.lineWidth = 3;
  ctx.strokeStyle = colors.border;
  ctx.stroke();

  const left = px + pad;
  const inner = pw - pad * 2;
  ctx.textBaseline = "alphabetic";

  // Row 1: logo, and the badge on the right.
  if (logo) ctx.drawImage(logo, left - 8, py + 28, 208, 80);
  ctx.font = `800 26px ${fontFamily}`;
  const badgeWidth = Math.min(ctx.measureText(content.badge).width + 44, inner - 220);
  const bx = px + pw - pad - badgeWidth;
  const by = py + 44;
  roundedRect(ctx, bx, by, badgeWidth, 48, 24);
  ctx.fillStyle = colors.accentSoft;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(57, 94, 168, 0.35)";
  ctx.stroke();
  ctx.fillStyle = colors.accent;
  fitText(ctx, content.badge, bx + 22, by + 33, badgeWidth - 44);

  // Row 2: name and subtitle.
  ctx.fillStyle = colors.text;
  ctx.font = `800 76px ${fontFamily}`;
  fitText(ctx, content.name, left, py + 204, inner);
  ctx.fillStyle = colors.muted;
  ctx.font = `600 30px ${fontFamily}`;
  fitText(ctx, content.subtitle, left, py + 254, inner);

  // Row 3: stat boxes.
  const gap = 20;
  const boxWidth = (inner - gap * (content.stats.length - 1)) / Math.max(1, content.stats.length);
  const boxY = py + 292;
  content.stats.forEach((stat, index) => {
    const x = left + index * (boxWidth + gap);
    roundedRect(ctx, x, boxY, boxWidth, 132, 24);
    ctx.fillStyle = colors.cream;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.border;
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.font = `700 26px ${fontFamily}`;
    fitText(ctx, stat.label, x + 28, boxY + 48, boxWidth - 56);
    ctx.fillStyle = colors.text;
    ctx.font = `800 52px ${fontFamily}`;
    fitText(ctx, stat.value, x + 28, boxY + 108, boxWidth - 56);
  });

  // Rows 4 and 5: caption, then the link, each on its own line so neither is cut short.
  ctx.fillStyle = colors.muted;
  ctx.font = `600 26px ${fontFamily}`;
  if (content.caption) fitText(ctx, content.caption, left, py + 478, inner);
  if (content.link) {
    ctx.fillStyle = colors.accent;
    ctx.font = `700 26px ${fontFamily}`;
    fitText(ctx, content.link, left, content.caption ? py + 520 : py + 478, inner);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas export failed"))), "image/png");
  });
}
