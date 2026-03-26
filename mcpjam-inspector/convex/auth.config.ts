/// <reference types="node" />

/**
 * Accept JWTs from the main application (Cognito or any RS256/HS256 issuer).
 * Required Convex env vars: JWT_ISSUER, JWT_JWKS_URL (or AWS_REGION + USER_POOL_ID).
 * Optional: JWT_AUDIENCE → maps to applicationID so Convex checks the `aud` claim.
 */

function normalizeIssuer(domain: string): string {
  const trimmed = domain.replace(/\/+$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function getJwksUrl(): string {
  const url = process.env.JWT_JWKS_URL;
  if (url) return url;
  const region = process.env.AWS_REGION;
  const userPoolId = process.env.USER_POOL_ID;
  if (region && userPoolId) {
    return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
  }
  throw new Error(
    "Missing JWT config: set JWT_JWKS_URL or (AWS_REGION + USER_POOL_ID).",
  );
}

const issuerEnv = process.env.JWT_ISSUER;
if (!issuerEnv) {
  throw new Error("Missing JWT_ISSUER env var.");
}

const issuer = normalizeIssuer(issuerEnv);
const jwksUrl = getJwksUrl();

export default {
  providers: [
    {
      type: "customJwt" as const,
      issuer,
      algorithm: "RS256" as const,
      jwks: jwksUrl,
    },
  ],
};
