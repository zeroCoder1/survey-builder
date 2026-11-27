import type { Request } from 'express';
import { query } from './db.js';

/** Records who did what. Failures are logged but never block the request. */
export async function audit(req: Request, action: string, detail: Record<string, unknown> = {}, studyId?: string) {
  try {
    await query('INSERT INTO audit_log (user_id, workspace_id, action, study_id, detail, ip) VALUES ($1, $2, $3, $4, $5, $6)', [
      req.user?.id ?? null,
      req.workspace?.id ?? null,
      action,
      studyId ?? null,
      JSON.stringify(detail),
      req.ip ?? null,
    ]);
  } catch (err) {
    console.error('audit log write failed', err);
  }
}
