import type { Request, Response } from 'express';
import { Router } from 'express';
import { createUserScopedSupabaseClient, createAdminSupabaseClient } from '../lib/supabase.js';

interface AuthenticatedUser { id: string; }

function getAuthenticatedUser(res: Response): AuthenticatedUser | null {
  const user = res.locals.user;
  return user && typeof user.id === 'string' ? { id: user.id } : null;
}

function getVerifiedAccessToken(res: Response): string | null {
  const token = res.locals.accessToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

const ALLOWED_METADATA_FIELDS = new Set([
  'name', 'title', 'primary_dialect', 'translation_target', 'auto_localize',
]);

interface UserProfile {
  email: string;
  name: string;
  title: string;
  primary_dialect: string;
  translation_target: string;
  auto_localize: boolean;
}

function buildProfile(email: string | undefined, metadata: Record<string, unknown>): UserProfile {
  return {
    email: email ?? '',
    name: typeof metadata.name === 'string' ? metadata.name : '',
    title: typeof metadata.title === 'string' ? metadata.title : '',
    primary_dialect: typeof metadata.primary_dialect === 'string' ? metadata.primary_dialect : 'English (UK)',
    translation_target: typeof metadata.translation_target === 'string' ? metadata.translation_target : 'French (Parisian)',
    auto_localize: typeof metadata.auto_localize === 'boolean' ? metadata.auto_localize : false,
  };
}

export const profileRouter = Router();

// GET /users/me
profileRouter.get('/users/me', async (_req: Request, res: Response): Promise<void> => {
  const user = getAuthenticatedUser(res);
  const accessToken = getVerifiedAccessToken(res);
  if (!user || !accessToken) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const profile = buildProfile(data.user.email, (data.user.user_metadata ?? {}) as Record<string, unknown>);
  res.status(200).json({ success: true, data: profile });
});

// PATCH /users/me
profileRouter.patch('/users/me', async (req: Request, res: Response): Promise<void> => {
  const user = getAuthenticatedUser(res);
  const accessToken = getVerifiedAccessToken(res);
  if (!user || !accessToken) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const body = req.body as Record<string, unknown>;

  // Validate: only allowlisted fields
  const unknownFields = Object.keys(body).filter((k) => !ALLOWED_METADATA_FIELDS.has(k));
  if (unknownFields.length > 0) {
    res.status(400).json({ success: false, error: `Invalid field(s): ${unknownFields.join(', ')}` });
    return;
  }

  // Validate types
  if ('auto_localize' in body && typeof body.auto_localize !== 'boolean') {
    res.status(400).json({ success: false, error: 'auto_localize must be a boolean' });
    return;
  }
  for (const field of ['name', 'title', 'primary_dialect', 'translation_target'] as const) {
    if (field in body && typeof body[field] !== 'string') {
      res.status(400).json({ success: false, error: `${field} must be a string` });
      return;
    }
  }

  const adminClient = createAdminSupabaseClient();
  const { data, error } = await adminClient.auth.admin.updateUserById(user.id, {
    user_metadata: body,
  });

  if (error || !data.user) {
    res.status(500).json({ success: false, error: error?.message ?? 'Failed to update profile' });
    return;
  }

  const profile = buildProfile(data.user.email, (data.user.user_metadata ?? {}) as Record<string, unknown>);
  res.status(200).json({ success: true, data: profile });
});
