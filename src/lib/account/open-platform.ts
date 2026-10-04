import { accountApi } from "@/config/account";

export async function openPlatformRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "request");
  return data as T;
}
export function publicAppPath(clientID: string): string { return `${accountApi.publicApps}/${encodeURIComponent(clientID)}`; }
