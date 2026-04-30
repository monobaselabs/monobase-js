/**
 * Update Schedule Exception Handler
 */

import type { ValidatedContext } from '@/types/app';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import { ScheduleExceptionRepository } from './repos/scheduleException.repo';

export async function updateScheduleException(c: ValidatedContext<any, any, any>) {
  const db = c.get('database') as DatabaseInstance;
  const user = c.get('user') as User;
  const exceptionId = c.req.param('exceptionId');
  const body = await c.req.json();

  const personId = user?.id;
  if (!personId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const repo = new ScheduleExceptionRepository(db, c.var.logger);

  try {
    const exception = await repo.findOneById(exceptionId);
    if (!exception) {
      return c.json({ error: 'Schedule exception not found' }, 404);
    }

    if (exception.owner !== personId) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const updated = await repo.updateOneById(exceptionId, body);

    return c.json(updated);
  } catch (error) {
    c.var.logger?.error({ error, exceptionId }, 'Failed to update schedule exception');
    return c.json({ error: 'Failed to update schedule exception' }, 500);
  }
}