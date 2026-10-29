import { MD3_DEFAULT_SEED, md3Colors } from "@/lib/md3/scheme";

export const DECK_SHARE_WIDTH = 1200;
const LOGO_URL = "/assets/brand/moenotes-signature.svg";

export interface DeckShareSlot {
  slotIndex: number;
  isLeader: boolean;
  memberTitle: string;
  memberSubtitle: string;
  memberMeta: string;
  memberArtUrl: string | null;
  snapTitle: string | null;
  snapMeta: string;
  snapArtUrl: string | null;
}

export interface DeckShareSongRow {
  title: string;
  meta: string;
  score: string;
  range: string;
}

export interface DeckShareContent {
  rankBadge: string;
  goalLabel: string;
  songSummary: string;
  proofBadge: string;
  metricLabel: string;
  metricValue: string;
  powerLabel: string;
  powerValue: string;
  membersHeading: string;
  snapsHeading: string;
  leaderTag: string;
  noSnapLabel: string;
  slots: readonly DeckShareSlot[];
  aggregateHeading?: string;
  aggregateRows?: readonly DeckShareSongRow[];
  footerLeft: string;
  footerRight: string;
}

const scheme = md3Colors(MD3_DEFAULT_SEED, false);
const palette = {
  bgTop: scheme.surfaceContainerLowest ?? "#f9f9ff",
  bgBottom: scheme.surfaceContainer ?? "#edeef6",
  card: scheme.surface ?? "#ffffff",
  cardSubtle: scheme.surfaceContainerLow ?? "#f3f3fb",
  chip: scheme.secondaryContainer ?? "#dce2f9",
  chipText: scheme.onSecondaryContainer ?? "#151b2c",
  primary: scheme.primary ?? "#3f5f90",
  onPrimary: scheme.onPrimary ?? "#ffffff",
  primarySoft: scheme.primaryContainer ?? "#d6e3ff",
  onPrimarySoft: scheme.onPrimaryContainer ?? "#001b3d",
  text: scheme.onSurface ?? "#191c22",
  muted: scheme.onSurfaceVariant ?? "#434750",
  border: scheme.outlineVariant ?? "#c3c6d2",
};

const MAX_AGGREGATE_ROWS = 6;

export function computeDeckShareHeight(aggregateCount: number): number {
  const visibleRows = Math.min(Math.max(0, aggregateCount), MAX_AGGREGATE_ROWS);
  const baseHeight = 820;
  if (visibleRows === 0) return baseHeight;
  return baseHeight + 76 + visibleRows * 52;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${url}`));
    img.src = url;
  });
}

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number): void {
  if (!text) return;
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }
  const chars = [...text];
  while (chars.length > 1 && ctx.measureText(`${chars.join("")}…`).width > maxWidth) {
    chars.pop();
  }
  ctx.fillText(`${chars.join("")}…`, x, y);
}

function drawRoundedBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string,
  lineWidth = 1.5,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawSquareArt(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
  radius: number,
  fallbackText: string,
  fontFamily: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, radius);
  ctx.clip();
  if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const dw = image.naturalWidth * scale;
    const dh = image.naturalHeight * scale;
    ctx.drawImage(image, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = palette.cardSubtle;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = palette.muted;
    ctx.font = `600 18px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitText(ctx, fallbackText, x + size / 2, y + size / 2, size - 16);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, radius);
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

export async function renderDeckShareImage(content: DeckShareContent, fontFamily: string): Promise<Blob> {
  const aggregateRows = (content.aggregateRows ?? []).slice(0, MAX_AGGREGATE_ROWS);
  const height = computeDeckShareHeight(aggregateRows.length);

  const canvas = document.createElement("canvas");
  canvas.width = DECK_SHARE_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  await document.fonts?.ready;

  const [logo, memberImages, snapImages] = await Promise.all([
    loadImage(LOGO_URL).catch(() => null),
    Promise.all(content.slots.map((slot) => (slot.memberArtUrl ? loadImage(slot.memberArtUrl).catch(() => null) : Promise.resolve(null)))),
    Promise.all(content.slots.map((slot) => (slot.snapArtUrl ? loadImage(slot.snapArtUrl).catch(() => null) : Promise.resolve(null)))),
  ]);

  const bg = ctx.createLinearGradient(0, 0, DECK_SHARE_WIDTH, height);
  bg.addColorStop(0, palette.bgTop);
  bg.addColorStop(1, palette.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, DECK_SHARE_WIDTH, height);

  const pad = 40;
  const innerWidth = DECK_SHARE_WIDTH - pad * 2;

  // Main surface container
  drawRoundedBox(ctx, pad, 32, innerWidth, height - 64, 28, palette.card, palette.border, 1.5);

  // Header band: Rank + Goal + Song Summary + Proof badge
  let cursorX = pad + 32;
  const headerY = 64;

  ctx.font = `700 22px ${fontFamily}`;
  const rankW = Math.max(64, Math.ceil(ctx.measureText(content.rankBadge).width) + 28);
  drawRoundedBox(ctx, cursorX, headerY, rankW, 42, 14, palette.primary);
  ctx.fillStyle = palette.onPrimary;
  ctx.fillText(content.rankBadge, cursorX + 14, headerY + 29);
  cursorX += rankW + 14;

  ctx.font = `600 18px ${fontFamily}`;
  const goalW = Math.ceil(ctx.measureText(content.goalLabel).width) + 28;
  drawRoundedBox(ctx, cursorX, headerY + 3, goalW, 36, 12, palette.primarySoft);
  ctx.fillStyle = palette.onPrimarySoft;
  ctx.fillText(content.goalLabel, cursorX + 14, headerY + 27);
  cursorX += goalW + 12;

  if (content.proofBadge) {
    const proofW = Math.ceil(ctx.measureText(content.proofBadge).width) + 24;
    drawRoundedBox(ctx, cursorX, headerY + 3, proofW, 36, 12, palette.chip);
    ctx.fillStyle = palette.chipText;
    ctx.fillText(content.proofBadge, cursorX + 12, headerY + 27);
  }

  if (logo && logo.naturalWidth > 0) {
    const logoH = 34;
    const logoW = (logo.naturalWidth / logo.naturalHeight) * logoH;
    ctx.drawImage(logo, pad + innerWidth - 32 - logoW, headerY + 4, logoW, logoH);
  }

  if (content.songSummary) {
    ctx.font = `500 18px ${fontFamily}`;
    ctx.fillStyle = palette.muted;
    fitText(ctx, content.songSummary, pad + 32, headerY + 68, innerWidth - 64);
  }

  // Metric hero strip
  const heroY = 152;
  drawRoundedBox(ctx, pad + 32, heroY, innerWidth - 64, 96, 20, palette.cardSubtle, palette.border, 1);

  ctx.font = `600 16px ${fontFamily}`;
  ctx.fillStyle = palette.muted;
  ctx.fillText(content.metricLabel, pad + 56, heroY + 32);

  ctx.font = `700 36px ${fontFamily}`;
  ctx.fillStyle = palette.text;
  fitText(ctx, content.metricValue, pad + 56, heroY + 74, innerWidth - 360);

  if (content.powerValue) {
    ctx.textAlign = "right";
    ctx.font = `600 16px ${fontFamily}`;
    ctx.fillStyle = palette.muted;
    ctx.fillText(content.powerLabel, pad + innerWidth - 56, heroY + 32);
    ctx.font = `700 28px ${fontFamily}`;
    ctx.fillStyle = palette.primary;
    ctx.fillText(content.powerValue, pad + innerWidth - 56, heroY + 72);
    ctx.textAlign = "left";
  }

  // 5-slot Formation grid (Members + Support Snaps)
  const gridLeft = pad + 32;
  const gridWidth = innerWidth - 64;
  const gap = 14;
  const colW = Math.floor((gridWidth - gap * 4) / 5);

  const memberSectionY = 276;
  ctx.font = `700 17px ${fontFamily}`;
  ctx.fillStyle = palette.muted;
  ctx.fillText(content.membersHeading, gridLeft, memberSectionY);

  const memberCardsY = memberSectionY + 14;
  const artSize = colW - 20;
  const memberCardH = artSize + 92;

  content.slots.slice(0, 5).forEach((slot, idx) => {
    const x = gridLeft + idx * (colW + gap);
    drawRoundedBox(
      ctx,
      x,
      memberCardsY,
      colW,
      memberCardH,
      18,
      slot.isLeader ? palette.primarySoft : palette.cardSubtle,
      slot.isLeader ? palette.primary : palette.border,
      slot.isLeader ? 2 : 1,
    );

    drawSquareArt(ctx, memberImages[idx] ?? null, x + 10, memberCardsY + 10, artSize, 14, slot.memberTitle, fontFamily);

    // Slot / Leader pill on top-left of art
    const tagText = slot.isLeader ? content.leaderTag : `#${slot.slotIndex + 1}`;
    ctx.font = `700 13px ${fontFamily}`;
    const tagW = Math.ceil(ctx.measureText(tagText).width) + 16;
    drawRoundedBox(ctx, x + 16, memberCardsY + 16, tagW, 24, 8, slot.isLeader ? palette.primary : "rgba(25, 28, 34, 0.76)");
    ctx.fillStyle = "#ffffff";
    ctx.fillText(tagText, x + 24, memberCardsY + 33);

    const textY = memberCardsY + 10 + artSize + 24;
    ctx.font = `700 16px ${fontFamily}`;
    ctx.fillStyle = palette.text;
    fitText(ctx, slot.memberTitle, x + 12, textY, colW - 24);

    ctx.font = `500 13px ${fontFamily}`;
    ctx.fillStyle = palette.muted;
    fitText(ctx, slot.memberSubtitle, x + 12, textY + 21, colW - 24);

    ctx.font = `600 13px ${fontFamily}`;
    ctx.fillStyle = palette.primary;
    fitText(ctx, slot.memberMeta, x + 12, textY + 42, colW - 24);
  });

  // Support Snaps row
  const snapSectionY = memberCardsY + memberCardH + 28;
  ctx.font = `700 17px ${fontFamily}`;
  ctx.fillStyle = palette.muted;
  ctx.fillText(content.snapsHeading, gridLeft, snapSectionY);

  const snapCardsY = snapSectionY + 14;
  const snapCardH = 88;
  content.slots.slice(0, 5).forEach((slot, idx) => {
    const x = gridLeft + idx * (colW + gap);
    drawRoundedBox(ctx, x, snapCardsY, colW, snapCardH, 16, palette.cardSubtle, palette.border, 1);
    if (!slot.snapTitle) {
      ctx.font = `500 14px ${fontFamily}`;
      ctx.fillStyle = palette.muted;
      fitText(ctx, content.noSnapLabel, x + 16, snapCardsY + 50, colW - 32);
      return;
    }
    drawSquareArt(ctx, snapImages[idx] ?? null, x + 10, snapCardsY + 10, 68, 12, slot.snapTitle, fontFamily);
    ctx.font = `700 14px ${fontFamily}`;
    ctx.fillStyle = palette.text;
    fitText(ctx, slot.snapTitle, x + 88, snapCardsY + 38, colW - 98);
    ctx.font = `600 13px ${fontFamily}`;
    ctx.fillStyle = palette.muted;
    fitText(ctx, slot.snapMeta, x + 88, snapCardsY + 60, colW - 98);
  });

  let footerBaseY = snapCardsY + snapCardH + 34;

  // Optional multi-song breakdown (e.g. Gekiso Arena shared song pool)
  if (aggregateRows.length > 0) {
    ctx.font = `700 17px ${fontFamily}`;
    ctx.fillStyle = palette.muted;
    ctx.fillText(content.aggregateHeading ?? "", gridLeft, footerBaseY);
    let rowY = footerBaseY + 14;
    for (const row of aggregateRows) {
      drawRoundedBox(ctx, gridLeft, rowY, gridWidth, 44, 12, palette.cardSubtle, palette.border, 1);
      ctx.font = `700 15px ${fontFamily}`;
      ctx.fillStyle = palette.text;
      fitText(ctx, row.title, gridLeft + 16, rowY + 27, 420);
      ctx.font = `500 14px ${fontFamily}`;
      ctx.fillStyle = palette.muted;
      fitText(ctx, row.meta, gridLeft + 450, rowY + 27, 260);
      ctx.textAlign = "right";
      ctx.font = `700 16px ${fontFamily}`;
      ctx.fillStyle = palette.primary;
      ctx.fillText(row.score, gridLeft + gridWidth - 180, rowY + 27);
      ctx.font = `500 13px ${fontFamily}`;
      ctx.fillStyle = palette.muted;
      ctx.fillText(row.range, gridLeft + gridWidth - 16, rowY + 27);
      ctx.textAlign = "left";
      rowY += 52;
    }
    footerBaseY = rowY + 18;
  }

  // Footer
  ctx.font = `500 14px ${fontFamily}`;
  ctx.fillStyle = palette.muted;
  ctx.fillText(content.footerLeft, gridLeft, height - 52);
  ctx.textAlign = "right";
  ctx.fillText(content.footerRight, gridLeft + gridWidth, height - 52);
  ctx.textAlign = "left";

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png");
  });
}
