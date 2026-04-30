/**
 * Unit tests for the small auth helpers in src/utils/auth.ts.
 * Role-string parsing is the only logic worth covering here; the rest
 * of the auth surface (sign-up, sign-in, admin auto-promotion via
 * Better-Auth hook) goes through the contract suite.
 */

import { describe, it, expect } from 'bun:test';

import { userHasRole, type AuthInstance } from '@/utils/auth';

const stubAuth = {} as AuthInstance;

describe('userHasRole', () => {
  it('returns false when the user has no role', async () => {
    expect(await userHasRole(stubAuth, { role: null }, 'admin')).toBe(false);
    expect(await userHasRole(stubAuth, { role: undefined }, 'admin')).toBe(false);
    expect(await userHasRole(stubAuth, { role: '' }, 'admin')).toBe(false);
  });

  it('matches a single role exactly', async () => {
    expect(await userHasRole(stubAuth, { role: 'admin' }, 'admin')).toBe(true);
    expect(await userHasRole(stubAuth, { role: 'user' }, 'admin')).toBe(false);
  });

  it('matches against any role in the comma-separated value', async () => {
    expect(await userHasRole(stubAuth, { role: 'user,admin' }, 'admin')).toBe(true);
    expect(await userHasRole(stubAuth, { role: 'user , admin' }, 'admin')).toBe(true);
    expect(await userHasRole(stubAuth, { role: 'user,host' }, 'admin')).toBe(false);
  });

  it('treats the second argument as OR when given an array', async () => {
    expect(await userHasRole(stubAuth, { role: 'support' }, ['admin', 'support'])).toBe(true);
    expect(await userHasRole(stubAuth, { role: 'user' }, ['admin', 'support'])).toBe(false);
  });
});
