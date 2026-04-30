/**
 * List Booking Events Handler
 * Lists all available booking events for discovery
 */

import type { BaseContext } from '@/types/app';
import type { Context } from 'hono';
import type { DatabaseInstance } from '@/core/database';
import { BookingEventRepository } from './repos/bookingEvent.repo';
import { parsePagination } from '@/utils/query';

export async function listBookingEvents(c: Context) {
  const db = c.get('database') as DatabaseInstance;
  const query = c.req.query();
  const { limit, offset } = parsePagination(query);

  const repo = new BookingEventRepository(db, c.var['logger']);

  try {
    // Get query parameters for filtering
    const status = c.req.query('status') as 'draft' | 'active' | 'paused' | 'archived' | undefined;
    const context = c.req.query('context');
    const effectiveDate = c.req.query('effectiveDate');
    const q = c.req.query('q');

    // Parse tags parameter - supports both CSV (OR) and repeated parameter (AND)
    // Use c.req.queries() (plural) to get all values for repeated parameters
    const tagsParams = c.req.queries('tags');

    let tagsOr: string[] | undefined;
    let tagsAnd: string[] | undefined;

    if (tagsParams && tagsParams.length > 0) {
      // If there's more than one value, it's repeated parameters → AND filtering
      // If there's one value with commas, it's CSV → OR filtering
      if (tagsParams.length > 1) {
        // Repeated parameters: ?tags=a&tags=b → AND filtering
        tagsAnd = tagsParams.filter((t: string) => t.trim().length > 0);
      } else {
        // Single parameter - check if it's CSV
        const singleParam = tagsParams[0];
        if (singleParam && singleParam.includes(',')) {
          // CSV format: ?tags=a,b,c → OR filtering
          tagsOr = singleParam.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        } else if (singleParam) {
          // Single tag → OR filtering with one item
          tagsOr = [singleParam.trim()];
        }
      }
    }

    // Build filters - only show active events by default for discovery
    const filters = {
      status: status || 'active',
      context,
      effectiveDate,
      q,
      tagsOr,
      tagsAnd
    };

    // Get events with pagination (expand handled automatically by middleware)
    const result = await repo.findManyWithPagination(filters, { pagination: { limit, offset } });

    return c.json(result);
  } catch (error) {
    c.var['logger']?.error({ error }, 'Failed to list booking events');
    return c.json({ error: 'Failed to list booking events' }, 500);
  }
}