import { getDb } from '@hipp0/core/db/index.js';
import { NotFoundError } from '@hipp0/core/types.js';
import type { Context } from 'hono';

/**
 * Verify the authenticated caller has access to the given project.
 * When auth is required, checks project belongs to caller's tenant.
 * In dev mode (HIPP0_AUTH_REQUIRED=false), allows all access.
 */
export async function requireProjectAccess(c: Context, projectId: string): Promise<void> {
  if (process.env.HIPP0_AUTH_REQUIRED === 'false') return;
  if (process.env.NODE_ENV !== 'production' && process.env.HIPP0_AUTH_REQUIRED !== 'true') return;

  const user = (c.get('user') as any) as { tenant_id?: string } | undefined;
  if (!user?.tenant_id) return;

  const db = getDb();
  const result = await db.query(
    'SELECT id FROM projects WHERE id = ? AND tenant_id = ?',
    [projectId, user.tenant_id],
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Project', projectId);
  }
}
