/**
 * Localhost Check Utility
 *
 * Validates Host header to ensure tokens are only served to localhost requests.
 * Protects against DNS rebinding attacks where a malicious domain resolves to
 * 127.0.0.1 - the browser sends the malicious domain as the Host header, which
 * this check rejects.
 *
 * Security model:
 * - Native: Server binds to 127.0.0.1 (network attacks impossible)
 * - Docker: Server binds to 0.0.0.0, but users MUST use -p 127.0.0.1:6274:6274
 * - Host header check blocks DNS rebinding in both cases
 */

/**
 * Check if the request is from localhost based on Host header.
 *
 * Supports:
 * - localhost (with/without port)
 * - 127.0.0.1 (IPv4 loopback, with/without port)
 * - [::1] (IPv6 loopback, with/without port)
 *
 * @param hostHeader - The Host header value from the request
 * @returns true if the request is from localhost, false otherwise
 */
export function isLocalhostRequest(hostHeader: string | undefined): boolean {
  if (!hostHeader) {
    return false;
  }

  // Normalize to lowercase for comparison
  const host = hostHeader.toLowerCase();

  // Check for localhost variants (with or without port)
  // IPv4: localhost, 127.0.0.1
  // IPv6: [::1] (brackets required in Host header for IPv6)
  // local.fletch.co: custom local development domain
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "local.fletch.co" ||
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1:") ||
    host.startsWith("[::1]:") ||
    host.startsWith("local.fletch.co:")
  );
}

/**
 * Check if a hostname matches an allowed host pattern.
 * Supports exact match and wildcard subdomains (e.g. "*.fletch.co").
 */
function matchesPattern(hostname: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const domain = pattern.slice(2);
    return hostname === domain || hostname.endsWith(`.${domain}`);
  }
  return hostname === pattern;
}

/**
 * Check if the request is from an allowed host.
 *
 * Allows localhost, configured allowed hosts (MCPJAM_ALLOWED_HOSTS),
 * and in hosted mode extends this to cloud deployment domains.
 *
 * @param hostHeader - The Host header value from the request
 * @param allowedHosts - List of additional allowed hosts (supports wildcards like "*.fletch.co")
 * @param hostedMode - Whether hosted mode is enabled
 * @returns true if the request is from an allowed host, false otherwise
 */
export function isAllowedHost(
  hostHeader: string | undefined,
  allowedHosts: string[],
  hostedMode: boolean,
): boolean {
  if (isLocalhostRequest(hostHeader)) {
    return true;
  }

  if (hostHeader && allowedHosts.length > 0) {
    const host = hostHeader.toLowerCase();
    const hostWithoutPort = host.split(":")[0];
    return allowedHosts.some((pattern) => matchesPattern(hostWithoutPort, pattern));
  }

  return false;
}
