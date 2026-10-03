/**
 * Saving and copying a collectible's artwork (stickers, titles, comics, backgrounds) from its detail overlay. The asset
 * service answers CORS, so the file is fetched as a blob: the download keeps its name and the clipboard gets the image
 * itself. Where that fails (an old browser, a blocked request) the download opens the file and the copy falls back to
 * its URL.
 */

/** The file name a release URL publishes (`…/stamp_illust_tomori_001.webp`), or `fallback`. */
export function imageFileName(url: string, fallback: string): string {
  const name = url.split(/[?#]/)[0]?.split("/").pop();
  return name ? decodeURIComponent(name) : fallback;
}

export async function downloadImage(url: string, fileName: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

/** Copies the image (as PNG where the browser needs it), else its URL; reports which one landed on the clipboard. */
export async function copyImage(url: string): Promise<"image" | "link" | "error"> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      const png = blob.type === "image/png" ? blob : await toPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      return "image";
    }
  } catch {
    // Fall through to the URL.
  }
  try {
    await navigator.clipboard.writeText(url);
    return "link";
  } catch {
    return "error";
  }
}

/** Clipboards take PNG; WebP and other formats are redrawn on a canvas. */
async function toPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((png) => (png ? resolve(png) : reject(new Error("png"))), "image/png"));
}
