/// <reference types="node" />

/**
 * Accept JWTs from the main application (external issuer).
 * Set Convex env: JWT_ISSUER, and either JWT_JWKS_URL or (AWS_REGION + USER_POOL_ID for Cognito).
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
    "Missing JWT config: set JWT_ISSUER and either JWT_JWKS_URL or (AWS_REGION + USER_POOL_ID).",
  );
}

const issuerEnv = process.env.JWT_ISSUER;
if (!issuerEnv) {
  throw new Error("Missing JWT_ISSUER.");
}

const issuer = normalizeIssuer(issuerEnv);
const jwksUrl = getJwksUrl();

export default {
  providers: [
    {
      type: "customJwt",
      issuer,
      algorithm: "RS256",
      jwks: jwksUrl,
      ...(process.env.JWT_AUDIENCE && { applicationID: process.env.JWT_AUDIENCE }),
    },
  ],
};
