/**
 * Browser-side empty shim referenced by `next.config.ts` (`turbopack.resolveAlias`) for Node-only modules
 * inside dead-code `if (ENVIRONMENT_IS_NODE)` guards and server-only `staticParams` loaders.
 */
const empty: Record<string, never> = {};
export default empty;

export function createRequire(): () => never {
  return () => {
    throw new Error("Node built-in module is not available in the browser");
  };
}

export function fileURLToPath(url: string): string {
  return url;
}

export function dirname(): string {
  return "";
}

export function detailParamsFromRows(): never[] {
  return [];
}

export async function getMasterdataDetailParams(): Promise<never[]> {
  return [];
}

export async function getMasterdataStoryParams(): Promise<never[]> {
  return [];
}

export async function getMasterdataExchangeParams(): Promise<never[]> {
  return [];
}

export async function getMasterdataShopParams(): Promise<never[]> {
  return [];
}

export async function getMasterdataRewardParams(): Promise<never[]> {
  return [];
}

export async function getMasterdataItemParams(): Promise<never[]> {
  return [];
}

export async function getMasterdataHelpParams(): Promise<never[]> {
  return [];
}
