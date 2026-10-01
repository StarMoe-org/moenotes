/** Transport only; source.ts validates the exported prefab closure. */
export async function fetchNativeUiResource(url: string | URL): Promise<Response> {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`UI resource: ${response.status}`);
  return response;
}
