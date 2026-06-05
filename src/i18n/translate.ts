export type MessageValue = string | MessageTree;
export interface MessageTree {
  [key: string]: MessageValue;
}

export function getMessageByPath(messages: MessageTree, key: string): string | undefined {
  const parts = key.split(".");
  let current: MessageValue | undefined = messages;
  for (const part of parts) {
    if (!current || typeof current === "string") return undefined;
    current = current[part];
  }
  return typeof current === "string" ? current : undefined;
}

export function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}
