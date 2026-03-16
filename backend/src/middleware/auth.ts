import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

interface AuthenticatedUser {
  id: string;
  email?: string;
}

const supabaseUrl = process.env.SUPABASE_URL;

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL is required for JWT verification middleware.');
}

const issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

function getBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

function setAuthenticatedUser(response: Response, user: AuthenticatedUser): void {
  response.locals.user = user;
}

function unauthorized(response: Response): void {
  response.status(401).json({
    success: false,
    error: 'Unauthorized',
  });
}

export async function verifySupabaseJwt(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getBearerToken(req.header('authorization'));

  if (!token) {
    unauthorized(res);
    return;
  }

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: 'authenticated',
    });

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      unauthorized(res);
      return;
    }

    const authenticatedUser: AuthenticatedUser = {
      id: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
    };

    setAuthenticatedUser(res, authenticatedUser);
    next();
  } catch {
    unauthorized(res);
  }
}