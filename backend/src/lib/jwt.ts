import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface JwtPayload {
  userId: string;
  orgId: string;
  role: string;
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function signMagicToken(payload: object, ttlSeconds = 3600): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ttlSeconds });
}

export interface SsoAssertion {
  email: string;
  name: string;
  sub: string;
}

// Verifies the short-lived handshake assertion the CRM backend signs (GET
// /auth/growth-rhythm-sso-token) — a deliberately different secret from
// JWT_SECRET above, so a leaked CRM SSO secret can't be used to forge a
// full GrowthRhythm session token directly.
export function verifySsoAssertion(token: string): SsoAssertion {
  return jwt.verify(token, process.env.GROWTH_RHYTHM_SSO_SECRET!) as SsoAssertion;
}
