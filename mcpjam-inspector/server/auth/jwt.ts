/**
 * JWT validation: JWKS (RS256) and/or JWT_SECRET (HS256).
 * Supports optional issuer, audience checks. Cognito-compatible.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type ValidateJwtResult =
  | { valid: true; claims: JWTPayload }
  | { valid: false; error: string };

function getJwksUrl(): string | undefined {
  const url = process.env.JWT_JWKS_URL;
  if (url) return url;
  const region = process.env.AWS_REGION;
  const userPoolId = process.env.USER_POOL_ID;
  if (region && userPoolId) {
    return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
  }
  return undefined;
}

export async function validateJwt(
  rawToken: string,
): Promise<ValidateJwtResult> {
  if (!rawToken?.trim()) {
    return { valid: false, error: "no token provided" };
  }

  const token = rawToken.startsWith("Bearer ")
    ? rawToken.slice(7).trim()
    : rawToken.trim();
  if (!token) {
    return { valid: false, error: "no token provided" };
  }

  const issuer = process.env.JWT_ISSUER;
  const audience = process.env.JWT_AUDIENCE;

  const jwksUrl = getJwksUrl();
  if (jwksUrl) {
    try {
      const jwks = createRemoteJWKSet(new URL(jwksUrl));
      const { payload } = await jwtVerify(token, jwks, {
        issuer: issuer ?? undefined,
        audience: audience ?? undefined,
        clockTolerance: 10,
      });
      return { valid: true, claims: payload };
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (!process.env.JWT_SECRET) {
        return { valid: false, error: `token verification failed: ${err}` };
      }
    }
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return {
      valid: false,
      error: "no verification key available (set JWT_JWKS_URL or JWT_SECRET)",
    };
  }

  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer: issuer ?? undefined,
      audience: audience ?? undefined,
      clockTolerance: 10,
    });
    return { valid: true, claims: payload };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { valid: false, error: `token verification failed: ${err}` };
  }
}
