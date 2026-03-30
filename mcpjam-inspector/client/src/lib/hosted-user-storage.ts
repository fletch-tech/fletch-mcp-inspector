import { HOSTED_MODE } from "@/lib/config";

/**
 * In hosted mode, isolate browser localStorage by signed-in user so API keys and
 * model prefs do not leak across accounts on a shared machine. Desktop keeps a
 * single unscoped key for backward compatibility.
 */
export function scopedLocalStorageKey(
  baseKey: string,
  hostedUserId: string | null | undefined,
): string {
  if (!HOSTED_MODE) return baseKey;
  if (hostedUserId) return `${baseKey}:u:${hostedUserId}`;
  return `${baseKey}:guest`;
}
