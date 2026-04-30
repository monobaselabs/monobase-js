# TypeScript Strict Typing Migration

## Executive Summary

This document tracks the migration of the Monobase API service to strict TypeScript typing with `ValidatedContext` for all handlers.

**Status:** Phase 1 Complete, Phase 2 In Progress  
**Progress:** 126 of 423 errors fixed (30% reduction)  
**Current Errors:** 297 remaining

### Migration Goals

1. ✅ Convert all 73 handlers to use `ValidatedContext<TJson, TQuery, TParam>`
2. ✅ Eliminate `any` types from handler signatures
3. ✅ Enable compile-time request validation
4. 🔄 Fix all TypeScript strict mode errors
5. 🔄 Ensure type safety across the codebase

---

## Current Status

### Phase 1: Handler Conversion ✅ COMPLETED

**Achievements:**
- ✅ All 73 handlers converted to strict `ValidatedContext` typing
- ✅ 33 route registration errors resolved
- ✅ Error reduction: 423 → 297 (126 errors fixed, 30% improvement)

**Type Safety Improvements:**
- Request body validation at compile-time
- Query parameter type inference
- URL parameter type checking
- Eliminated `any` from all handler signatures

### Phase 2: Error Resolution 🔄 IN PROGRESS

**Remaining:** 297 errors across 4 categories

---

## Error Breakdown by Category

### Category 1: Index Signature Access (59 errors)
**Issue:** TS4111 - Properties accessed without bracket notation

**Affected Files:**
- `handlers/audit/listAuditLogs.ts` (4 errors)
- `handlers/billing/getMerchantDashboard.ts` (1 error)
- `handlers/billing/handleStripeWebhook.ts` (4 errors)- `handlers/billing/payInvoice.ts` (2 errors)
- `handlers/billing/refundInvoicePayment.ts` (1 error)
- `handlers/booking/createBooking.ts` (1 error)
- `handlers/booking/jobs/confirmationTimer.ts` (12 errors)
- `handlers/booking/repos/booking.repo.ts` (2 errors)
- `handlers/booking/repos/timeSlot.repo.ts` (1 error)
- `handlers/booking/utils/slotGeneration.ts` (15 errors)
- `core/errors.ts` (3 errors)
- `handlers/email/listEmailTemplates.ts` (6 errors)
- `handlers/email/testEmailTemplate.ts` (1 error)
- `handlers/notifs/listNotifications.ts` (6 errors)

**Example Error:**
```typescript
// Error: Property 'startDate' comes from an index signature
const startDate = query.startDate;

// Fix: Use bracket notation
const startDate = query['startDate'];
```

**Fix Strategy:** Bulk replace `.property` with `['property']` for index signature access

---

### Category 2: Missing Schema Properties (43 errors)
**Issue:** Properties don't exist on TypeSpec-generated types

**Affected Modules:**

#### Billing (15 errors)
Missing properties on Invoice/MerchantAccount:
- `issuedAt: utcDateTime?`
- `dueAt: utcDateTime?`
- `amount: numeric`
- `stripeAccountId: string?`
- `stripePaymentIntentId: string?`

#### Booking (8 errors)
Missing properties on BookingEvent:
- `effectiveFrom: utcDateTime?`
- `minBookingHours: integer?`
- `advanceBookingDays: integer?`

Also: Schema type annotations missing (6 errors in booking.schema.ts)

#### Person (1 error)
Missing property on User:
- `adminLevel: string?`

#### Notifications (4 errors)
Missing properties:
- `deliveredAt: utcDateTime?`
- `metadata: Record<unknown>?`
- Person schema missing `email` property (2 errors)

#### Audit (1 error)
Missing query parameter:
- `orderBy: string?`

#### Other (9 errors)
- Protected `db` property access in repositories (5 errors)
- Import errors for non-existent patient/provider modules (2 errors)
- Email type import error (1 error)
- Review FindManyOptions type mismatch (1 error)

**Fix Strategy:** 
1. Update TypeSpec schemas in `specs/api/src/modules/`
2. Regenerate: `cd specs/api && bun run build`
3. Regenerate routes: `cd services/api-ts && bun run generate`
4. Create public repository methods for protected access
5. Remove invalid imports

---

### Category 3: Simple Fixes (40 errors)

#### Method Name Mismatches (7 errors)
- `createNotificationForModule` → `createNotification` (3 files)
- `markNoShow` → `markAsNoShow` (1 file)
- `regenerateOwnerSlots` - doesn't exist (1 file)
- Property name mismatches (2 files)

#### Enum Value Mismatches (8 errors)
Missing enum values:
- **NotificationType**: `payment_authorized`, `payment_failed`, `payment_captured`, `payment_received`, `charge_failed`, `booking_auto_rejected`, `booking_expired`
- **UserType**: Code uses `"user"` but type only has `"patient"|"provider"`

#### Null Safety (25 errors)
Objects possibly undefined:
- Billing handlers: invoice, merchant objects (15 errors)
- Booking handlers: slot, event objects (10 errors)

**Fix Strategy:**
1. Rename method calls
2. Add missing enum values to TypeSpec schemas
3. Add null checks: `if (!object) throw new Error()`

---

### Category 4: Infrastructure Issues (57 errors)

#### Route Handler Overloads (30 errors)
**Files:** `generated/openapi/routes.ts`, `middleware/dependency.ts`

**Issue:** Handler signatures don't match expected overloads

**Investigation needed:** May be fixed by Phase 2 regeneration

#### Core Infrastructure (27 errors)

**Files with errors:**
- `app.ts` (1 error) - DatabaseInstance vs NotificationService type mismatch
- `core/audit.ts` (1 error) - markForPurging initialization
- `core/auth.ts` (1 error) - Logger 'this' context
- `core/billing.ts` (3 errors) - Stripe API usage
- `core/email.ts` (10 errors) - Provider types, Config references
- `core/errors.ts` (5 errors) - Config.env access, ZodError properties
- `core/jobs.ts` (1 error) - Job scheduling overload
- `core/ws.ts` (2 errors) - ConnectionMetadata properties
- `generated/openapi/validators.ts` (4 errors) - digit undefined

**Fix Strategy:** Address each core file individually with proper type annotations

---

## Execution Plan

### Phase 1: Index Signature Fixes ✅
**Status:** Ready to execute  
**Errors:** 59  
**Time:** ~45 minutes  
**Risk:** Low (syntax only)

**Actions:**
1. Edit 15 files with index signature errors
2. Replace `.property` with `['property']`
3. Run typecheck: expect ~238 errors

**Files:**
```
handlers/audit/listAuditLogs.ts
handlers/billing/getMerchantDashboard.ts
handlers/billing/handleStripeWebhook.ts
handlers/billing/payInvoice.ts
handlers/billing/refundInvoicePayment.ts
handlers/booking/createBooking.ts
handlers/booking/jobs/confirmationTimer.ts
handlers/booking/repos/booking.repo.ts
handlers/booking/repos/timeSlot.repo.ts
handlers/booking/utils/slotGeneration.ts
core/errors.ts
handlers/email/listEmailTemplates.ts
handlers/email/testEmailTemplate.ts
handlers/notifs/listNotifications.ts
```

---

### Phase 2: Schema Updates + Regeneration
**Status:** Pending Phase 1  
**Errors:** 43  
**Time:** ~95 minutes  
**Risk:** Medium (requires regeneration)

**Actions:**
1. Update TypeSpec schemas (see Category 2)
2. Regenerate API specs: `cd specs/api && bun run build`
3. Regenerate routes: `cd services/api-ts && bun run generate`
4. Fix repository protected access (5 files)
5. Add explicit schema types (booking.schema.ts)
6. Remove invalid imports (comms, email)
7. Run typecheck: expect ~195 errors

**TypeSpec Schema Changes:**
```typescript
// specs/api/src/modules/billing.tsp
model Invoice {
  // ... existing properties
  issuedAt?: utcDateTime;
  dueAt?: utcDateTime;
  amount: numeric;
  stripePaymentIntentId?: string;
}

model MerchantAccount {
  // ... existing properties
  stripeAccountId?: string;
}

// specs/api/src/modules/booking.tsp
model BookingEvent {
  // ... existing properties
  effectiveFrom?: utcDateTime;
  minBookingHours?: integer;
  advanceBookingDays?: integer;
}

// specs/api/src/modules/person.tsp
model User {
  // ... existing properties
  adminLevel?: string;
}

// specs/api/src/modules/notifs.tsp
model Notification {
  // ... existing properties
  deliveredAt?: utcDateTime;
  metadata?: Record<unknown>;
}

// specs/api/src/modules/audit.tsp
model AuditLogQueryParams {
  // ... existing properties
  orderBy?: string;
}
```

---

### Phase 3: Simple Fixes
**Status:** Pending Phase 2  
**Errors:** 40  
**Time:** ~80 minutes  
**Risk:** Low (straightforward fixes)

**Actions:**
1. Fix method name mismatches (7 files)
2. Add enum values or update code (8 files)
3. Add null safety checks (25 locations)
4. Run typecheck: expect ~155 errors

**Method Renames:**
```typescript
// booking/cancelBooking.ts, rejectBooking.ts
- notificationService.createNotificationForModule(...)
+ notificationService.createNotification(...)

// booking/markNoShowBooking.ts
- bookingRepo.markNoShow(id)
+ bookingRepo.markAsNoShow(id)

// booking/jobs/index.ts
- Remove: slotGenerator.regenerateOwnerSlots call

// notifs/getNotification.ts
- const { notification } = c.req.param()
+ const { notif } = c.req.param()
```

**Null Safety Pattern:**
```typescript
// Before
const amount = invoice.amount;

// After
if (!invoice) {
  throw new NotFoundError('Invoice not found');
}
const amount = invoice.amount;
```

---

### Phase 4: Infrastructure
**Status:** Pending Phase 3  
**Errors:** 57  
**Time:** ~105 minutes  
**Risk:** High (core system changes)

**Actions:**
1. Investigate route handler overload errors (30 errors)
   - Check if Phase 2 regeneration fixed these
   - Update handler signatures if needed
2. Fix core infrastructure files (27 errors)
   - Address each file individually
   - Ensure proper type annotations
3. Run final typecheck: expect 0 errors

**Core File Fixes:**
- `app.ts` - Fix service type mismatch
- `core/audit.ts` - Initialize markForPurging
- `core/auth.ts` - Fix logger context
- `core/billing.ts` - Fix Stripe API calls
- `core/email.ts` - Fix provider types and Config usage
- `core/errors.ts` - Fix Config.env and ZodError
- `core/jobs.ts` - Fix job scheduling
- `core/ws.ts` - Fix ConnectionMetadata
- `middleware/dependency.ts` - Fix overload
- `generated/openapi/validators.ts` - Handle digit undefined

---

## Progress Tracking

| Phase | Status | Errors Fixed | Errors Remaining | Time Spent | Notes |
|-------|--------|--------------|------------------|------------|-------|
| Handler Conversion | ✅ Complete | 126 | 297 | ~3 hours | All handlers using ValidatedContext |
| Phase 1: Index Signatures | 🔄 Pending | 0 | 59 | - | Syntax fixes only |
| Phase 2: Schema Updates | 🔄 Pending | 0 | 43 | - | Requires regeneration |
| Phase 3: Simple Fixes | 🔄 Pending | 0 | 40 | - | Method names + null checks |
| Phase 4: Infrastructure | 🔄 Pending | 0 | 57 | - | Core file fixes |
| **Total** | **30% Complete** | **126** | **297** | **~3 hours** | **Target: 0 errors** |

---

## Commands Reference

### Run Type Check
```bash
cd services/api-ts
bun run typecheck
```

### Save Errors to File
```bash
cd services/api-ts
bun run typecheck 2>&1 | tee /tmp/typecheck-errors.txt
```

### Count Errors
```bash
cd services/api-ts
bun run typecheck 2>&1 | grep "error TS" | wc -l
```

### Regenerate API Specs
```bash
# 1. Regenerate OpenAPI from TypeSpec
cd specs/api
bun run build

# 2. Regenerate routes/validators from OpenAPI
cd ../../services/api-ts
bun run generate
```

### Run Full Build
```bash
cd services/api-ts
bun run build
```

---

## Key Findings

### Real Bugs Discovered

The strict typing migration has surfaced **real bugs** in the codebase:

1. **Schema Inconsistencies**
   - TypeSpec schemas missing properties used by handlers
   - Database schemas out of sync with API definitions
   - Example: Invoice missing `issuedAt`, `dueAt`, `amount` fields

2. **Incorrect Enum Values**
   - Code uses notification types not defined in schemas
   - Example: `payment_authorized`, `booking_expired` not in enum

3. **Repository Method Errors**
   - Methods called with wrong names or signatures
   - Example: `markNoShow` vs `markAsNoShow`

4. **Missing Null Checks**
   - Critical paths not checking for undefined objects
   - Example: Accessing `invoice.amount` without null check

5. **Protected Property Access**
   - Direct access to protected repository internals
   - Example: `this.db` accessed from outside repository class

### Type Safety Wins

1. **Compile-Time Validation**
   - Request body validation at compile-time
   - No more runtime surprises from invalid data

2. **Developer Experience**
   - Autocomplete for request data
   - Type inference for query/params
   - Self-documenting handler signatures

3. **Error Prevention**
   - 126 potential runtime errors caught
   - Type mismatches caught before deployment

---

## Success Criteria

- [ ] All 297 TypeScript errors resolved
- [ ] `bun run typecheck` passes with 0 errors
- [ ] `bun run build` succeeds
- [ ] All tests still pass: `bun test`
- [ ] No regression in existing functionality
- [ ] Documentation updated

---

## Notes

### Do Not Edit Generated Files

These files are regenerated and should not be manually edited:
- `src/generated/openapi/routes.ts`
- `src/generated/openapi/validators.ts`
- `src/generated/openapi/registry.ts`
- `src/generated/better-auth/*`
- `src/generated/migrations/*`

If these files have errors, fix the source (TypeSpec, schemas, or generator scripts).

### TypeSpec Workflow

Always follow this workflow for API changes:
1. Edit TypeSpec definitions in `specs/api/src/modules/`
2. Generate OpenAPI: `cd specs/api && bun run build`
3. Generate routes: `cd services/api-ts && bun run generate`
4. Implement handlers in `services/api-ts/src/handlers/`
5. Run typecheck: `bun run typecheck`

### Testing Strategy

After each phase:
1. Run typecheck to verify error count
2. Run build to ensure no compilation errors
3. Run tests to ensure no regressions
4. Update progress tracking table

---

## Timeline Estimate

- **Phase 1:** ~45 minutes
- **Phase 2:** ~95 minutes
- **Phase 3:** ~80 minutes
- **Phase 4:** ~105 minutes

**Total:** ~5.5 hours to complete all phases

**Actual progress will be tracked in the Progress Tracking table above.**

---

*Last Updated: 2025-10-14*
*Status: Phase 2 Planning Complete, Ready to Execute Phase 1*
