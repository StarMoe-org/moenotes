/** Shared by screenshot importers: some browsers expose image files only through clipboard items. */
export function clipboardImageFiles(data: Pick<DataTransfer, "files" | "items"> | null): File[] {
  if (!data) return [];
  const files = Array.from(data.files).filter(file => file.type.startsWith("image/"));
  if (!files.length) for (const item of Array.from(data.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}
