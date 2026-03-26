/**
 * Mock for Convex's _generated/server module.
 * Extracts handlers from mutation/query definitions for direct testing.
 */
export function mutation(def: { args: any; handler: any }) {
  return def;
}

export function query(def: { args: any; handler: any }) {
  return def;
}

export function internalQuery(def: { args: any; handler: any }) {
  return def;
}

export function httpAction(handler: any) {
  return handler;
}
