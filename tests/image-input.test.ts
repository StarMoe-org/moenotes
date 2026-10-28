import { expect, test } from "bun:test";
import { clipboardImageFiles } from "../src/lib/browser/image-input";

function clipboard(files: File[], items: Array<{ kind: string; type: string; getAsFile: () => File | null }>): Pick<DataTransfer, "files" | "items"> {
  return { files, items } as unknown as Pick<DataTransfer, "files" | "items">;
}
test("clipboard import prefers the files list without duplicating the same items", () => {
  const image = new File(["png"], "screen.png", { type: "image/png" });
  const text = new File(["text"], "notes.txt", { type: "text/plain" });
  expect(clipboardImageFiles(clipboard([image, text], [{ kind: "file", type: image.type, getAsFile: () => image }]))).toEqual([image]);
});
test("clipboard import falls back to image items and ignores missing/non-file entries", () => {
  const image = new File(["jpeg"], "screen.jpg", { type: "image/jpeg" });
  expect(clipboardImageFiles(clipboard([], [
    { kind: "string", type: "image/png", getAsFile: () => image },
    { kind: "file", type: "image/png", getAsFile: () => null },
    { kind: "file", type: image.type, getAsFile: () => image },
    { kind: "file", type: "text/plain", getAsFile: () => image },
  ]))).toEqual([image]);
  expect(clipboardImageFiles(null)).toEqual([]);
});
