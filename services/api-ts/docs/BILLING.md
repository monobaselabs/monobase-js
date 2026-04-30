# Billing Module Documentation

## Overview

The billing module implements invoice-based payments with Stripe Connect integration. It uses a **two-phase payment model**: authorization (hold) → capture (charge), giving providers control over payment timing.

**Key Pattern**: Payments are authorized upfront, held by Stripe, and captured only when the provider confirms service completion.

**For Stripe API details**, see [Stripe Connect docs](https://stripe.com/docs/connect) and [Payment Intents docs](https://stripe.com/docs/payments/payment-intents).

---

## Architecture

### Payment Flow

```
1. Invoice Creation → Create Stripe Payment Intent (authorize)
2. Payment Authorization → Funds held (not charged)
3. Provider Decision → Capture or cancel payment
4. Payment Capture → Funds transferred to provider
```

###  Merchant Account Onboarding

Providers must complete Stripe Connect onboarding before receiving payments:

```
1. Create Merchant Account → Register with Stripe Connect
2. Onboarding Link → Provider completes Stripe onboarding
3. Account Verification → Stripe enables charges & payouts
4. Ready for Payments → Can receive invoice payments
```

---

## Invoice State Machine

### Status Field
```typescript
status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
```

- **draft**: Invoice created but not finalized
- **open**: Finalized and sent to customer (payment authorized)
- **paid**: Payment captured successfully
- **void**: Invoice canceled (payment released)
- **uncollectible**: Marked as uncollectible

### Payment Status Field
```typescript
paymentStatus: 'unpaid' | 'processing' | 'requires_capture' | 'succeeded' | 'failed' | 'canceled'
```

- **unpaid**: No payment attempt
- **processing**: Payment being processed
- **requires_capture**: Authorized, awaiting provider decision
- **succeeded**: Payment captured
- **failed**: Payment authorization/capture failed
- **canceled**: Payment canceled

### State Transitions

```typescript
// Valid transitions
draft → open (finalize invoice)
open → paid (capture payment)
open → void (cancel before capture)
open → uncollectible (mark as uncollectible)
```

---

## Stripe Webhook Integration

### Custom Webhook Handler

Location: `src/handlers/billing/handleStripeWebhook.ts`

**Purpose**: Synchronize Stripe events with local database and trigger notifications.

### Handled Events

#### Payment Events
- **payment_intent.succeeded** → Mark invoice as `requires_capture`
- **payment_intent.payment_failed** → Mark as `failed`, notify customer
- **payment_intent.canceled** → Mark as `canceled` and void invoice
- **payment_intent.requires_action** → Mark as `processing` (3D Secure, etc.)

#### Charge Events
- **charge.succeeded** → Mark invoice as `paid`, notify both parties
- **charge.failed** → Mark as `failed`, notify customer
- **charge.refunded** → Update metadata with refund details

#### Connect Account Events
- **account.updated** → Update merchant account status and onboarding state
- **account.application.deauthorized** → Deactivate merchant account

#### Transfer Events
- **transfer.created** → Log successful transfer to merchant
- **transfer.failed** → Log failed transfer (requires manual review)

### Custom Logic Highlights

**1. Invoice Lookup by Payment Intent**
```typescript
// Webhooks reference payment intent IDs
// Custom JSONB search to find invoice
const allInvoices = await invoiceRepo.db.select().from(invoices);
const invoice = allInvoices.find((inv: any) => {
  const metadata = inv.metadata as any;
  return metadata?.stripePaymentIntentId === paymentIntentId;
});
```

**2. Notification Integration**
```typescript
// Dual notifications on charge success
await notificationService.createNotification({
  recipientId: invoice.customer,
  type: 'payment_captured',
  channels: ['in-app', 'email']
});

await notificationService.createNotification({
  recipientId: invoice.merchant,
  type: 'payment_received',
  channels: ['in-app', 'email']
});
```

**3. Metadata Tracking**
```typescript
// Store Stripe IDs in JSONB metadata for correlation
const updatedMetadata = {
  stripePaymentIntentId: paymentIntent.id,
  stripeChargeId: charge.id,
  stripeTransferId: transfer.id,
  refundAmount: refundAmountDecimal,
  refundedAt: new Date().toISOString()
};
```

---

## Two-Phase Payment Model

### Phase 1: Authorization (Hold)

**Endpoint**: `POST /billing/invoices` → `finalizeInvoice`

```typescript
// Customer pays → Stripe authorizes payment
// Funds are HELD, not charged
// Invoice status: open
// Payment status: requires_capture
```

**Benefits**:
- Provider can verify service completion before charging
- Customer sees authorization on statement
- No charge if service is canceled

### Phase 2: Capture (Charge)

**Endpoint**: `POST /billing/invoices/:id/capture`

```typescript
// Provider confirms service → Capture payment
// Funds transferred to provider account
// Invoice status: paid
// Payment status: succeeded
```

**Alternative**: Cancel Instead
```typescript
// Service canceled → Release authorization
// POST /billing/invoices/:id/void
// Invoice status: void
// Payment status: canceled
```

---

## Merchant Account Flow

### 1. Create Merchant Account

**Endpoint**: `POST /billing/merchant-accounts`

Creates Stripe Connect account for provider.

### 2. Generate Onboarding Link

**Endpoint**: `POST /billing/merchant-accounts/:id/onboard`

Returns Stripe-hosted onboarding URL.

```typescript
{
  "onboardingUrl": "https://connect.stripe.com/setup/s/...",
  "expiresAt": "2024-01-15T10:00:00Z"
}
```

### 3. Monitor Onboarding Status

**Via Webhooks**: `account.updated` events update `metadata.onboardingComplete`

**Via API**: `GET /billing/merchant-accounts/:id`

```typescript
{
  "active": boolean,
  "metadata": {
    "onboardingComplete": boolean,
    "accountChargesEnabled": boolean,
    "accountPayoutsEnabled": boolean,
    "requirementsCurrentlyDue": string[]
  }
}
```

### 4. Access Merchant Dashboard

**Endpoint**: `POST /billing/merchant-accounts/:id/dashboard`

Returns Stripe Express Dashboard login link.

---

## Error Handling

### Business Logic Errors

```typescript
// Invoice must be in correct state
if (invoice.status !== 'open') {
  throw new BusinessLogicError(
    'Cannot capture payment: invoice is not open',
    'INVALID_INVOICE_STATUS'
  );
}

// Merchant must be onboarded
if (!merchantAccount.active) {
  throw new BusinessLogicError(
    'Merchant account not active',
    'MERCHANT_ACCOUNT_INACTIVE'
  );
}
```

### Webhook Error Handling

```typescript
// Always return 200 to prevent retries
try {
  await processWebhookEvent(event);
  return ctx.json({ received: true }, 200);
} catch (error) {
  logger.error({ error, eventType: event.type }, 'Webhook processing failed');
  
  // Still return 200 for business logic errors
  if (error instanceof BusinessLogicError) {
    return ctx.json({ received: true, error: error.message }, 200);
  }
  
  throw error;
}
```

---

## Implementation Files

**Handlers**:
- `createInvoice.ts` - Create draft invoice
- `finalizeInvoice.ts` - Finalize and authorize payment
- `captureInvoicePayment.ts` - Capture authorized payment
- `payInvoice.ts` - Direct payment (skip authorization)
- `refundInvoicePayment.ts` - Refund captured payment
- `voidInvoice.ts` - Cancel invoice and release authorization
- `handleStripeWebhook.ts` - Webhook event handler
- `onboardMerchantAccount.ts` - Generate onboarding link
- `getMerchantDashboard.ts` - Generate dashboard link

**Repositories**:
- `repos/billing.repo.ts` - Database operations
- `repos/billing.schema.ts` - Drizzle schema and types

---

## Testing

### Webhook Testing

Use Stripe CLI to forward webhooks:

```bash
stripe listen --forward-to localhost:7213/billing/stripe-webhook

# Trigger test events
stripe trigger payment_intent.succeeded
stripe trigger charge.succeeded
stripe trigger account.updated
```

### Test Cards

```
4242 4242 4242 4242  # Successful payment
4000 0000 0000 9995  # Declined payment
4000 0025 0000 3155  # Requires authentication (3D Secure)
```

See [Stripe test cards](https://stripe.com/docs/testing) for complete list.

---

## Security Considerations

1. **Webhook Signature Verification**: Always verify Stripe signatures
2. **Idempotency**: Webhooks may be delivered multiple times
3. **Metadata Privacy**: Don't store PHI in Stripe metadata
4. **Audit Logging**: All payment operations logged with Pino
5. **Authorization Timing**: Authorizations expire after 7 days

---

## Common Patterns

### Creating Invoice with Authorization

```typescript
// 1. Create draft invoice
const invoice = await invoiceRepo.createOne({
  customer: patientId,
  merchant: providerId,
  items: invoiceItems,
  status: 'draft'
});

// 2. Finalize invoice (authorizes payment)
await finalizeInvoice({ invoiceId: invoice.id });

// Result: Payment authorized, funds held
// Invoice status: open
// Payment status: requires_capture
```

### Capturing Payment After Service

```typescript
// Provider confirms service completion
await captureInvoicePayment({ invoiceId: invoice.id });

// Result: Payment captured, funds transferred
// Invoice status: paid
// Payment status: succeeded
```

### Canceling Before Capture

```typescript
// Service canceled before completion
await voidInvoice({ invoiceId: invoice.id });

// Result: Authorization released, no charge
// Invoice status: void
// Payment status: canceled
```

---

## Future Enhancements

- Partial payment capture
- Recurring billing/subscriptions
- Multi-currency support
- Platform fee configuration
- Automated dunning for failed payments

---

**For complete Stripe API reference**, see [Stripe Documentation](https://stripe.com/docs).
