import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError,
  ConflictError
} from '@/core/errors';
import type { ValidatedContext } from '@/types/app';
import type { PayInvoiceBody, PayInvoiceParams } from '@/generated/openapi/validators';
import type { Session } from '@/types/auth';
import { InvoiceRepository, MerchantAccountRepository } from './repos/billing.repo';
import { PersonRepository } from '../person/repos/person.repo';
// Customer and merchant are both persons in monobase

/**
 * payInvoice
 * 
 * Path: POST /invoices/{id}/pay
 * OperationId: payInvoice
 * 
 * Create payment intent for invoice (Hold & Decide model)
 */
export async function payInvoice(
  ctx: ValidatedContext<PayInvoiceBody, never, PayInvoiceParams>
): Promise<Response> {
  const database = ctx.get('database');
  const logger = ctx.get('logger');
  const billing = ctx.get('billing');
  
  // Get authenticated session (guaranteed by middleware)
  const session = ctx.get('session') as Session;
  
  // Extract validated parameters and request body
  const params = ctx.req.valid('param');
  const body = ctx.req.valid('json');

  const invoiceId = params.invoice;
  const { paymentMethod, metadata } = body;

  // Extract return URLs from metadata if provided
  const successUrl = metadata?.['successUrl'] as string | undefined;
  const cancelUrl = metadata?.['cancelUrl'] as string | undefined;

  // Validate payment method ID format (Stripe format: pm_*)
  if (paymentMethod && !paymentMethod.startsWith('pm_')) {
    throw new ValidationError('Invalid payment method ID format. Expected format: pm_*');
  }

  logger.info({ invoiceId, paymentMethod, hasReturnUrls: !!(successUrl && cancelUrl) }, 'Creating payment intent for invoice');
  
  // Create repository instances
  const invoiceRepo = new InvoiceRepository(database, logger);
  const merchantAccountRepo = new MerchantAccountRepository(database, logger);
  const personRepo = new PersonRepository(database, logger);
  

  // Get the invoice record
  const invoice = await invoiceRepo.findOneById(invoiceId);
  if (!invoice) {
    throw new NotFoundError('Invoice not found', {
      resourceType: 'invoice',
      resource: invoiceId,
      suggestions: ['Check invoice ID', 'Verify invoice exists', 'Check invoice status']
    });
  }

  // Authorization check: patient:owner means the authenticated user must be the patient
  const user = session.user;
  logger.info({ userId: user.id, invoiceCustomer: invoice.customer }, 'Authorization check starting');

  const customerPerson = await personRepo.findOneById(invoice.customer);
  if (!customerPerson) {
    throw new NotFoundError('Customer person not found', {
      resourceType: 'person',
      resource: invoice.customer,
      suggestions: ['Check customer person ID format', 'Verify customer person exists in system']
    });
  }

  logger.info({
    customerId: invoice.customer,
    userId: user.id,
    match: invoice.customer === user.id
  }, 'Customer authorization check');

  if (invoice.customer !== user.id) {
    throw new ForbiddenError('You can only pay your own invoices');
  }
  
  // Check if payment already exists
  if (invoice.paymentStatus && invoice.paymentStatus !== 'pending') {
    throw new ConflictError('Payment already exists for this invoice');
  }
  
  // Get the merchant account for the merchant person
  const merchantAccount = await merchantAccountRepo.findByPerson(invoice.merchant);
  if (!merchantAccount) {
    throw new NotFoundError('Merchant account not found', {
      resourceType: 'merchant-account',
      resource: invoice.merchant,
      suggestions: ['Check merchant person ID format', 'Verify merchant person exists in system', 'Complete billing setup']
    });
  }
  
  const merchantMetadata = merchantAccount.metadata as any;
  if (!merchantMetadata?.stripeAccountId || !merchantMetadata?.onboardingComplete) {
    throw new BusinessLogicError(
      'Provider has not completed billing setup',
      'PROVIDER_BILLING_INCOMPLETE'
    );
  }
  
  try {
    // Get pricing from invoice (already in cents as integers)
    const amount = invoice.total;
    const platformAmount = 0; // TODO: Calculate platform fee
    const currency = invoice.currency;
    
    // Create payment intent with Stripe
    const paymentIntent = await billing.createPaymentIntent({
      amount: amount,
      currency: currency.toLowerCase(),
      connectedAccountId: merchantMetadata.stripeAccountId,
      platformFeeAmount: platformAmount,
      description: `Invoice ${invoice.invoiceNumber}`,
      successUrl: successUrl,
      cancelUrl: cancelUrl,
      metadata: {
        invoiceId,
        customerId: invoice.customer,
        merchantId: invoice.merchant,
        createdBy: user.id,
      },
    });
    
    // Update invoice with payment details
    // Store Stripe payment intent ID in metadata since it's not in the schema
    const updatedMetadata = {
      ...(invoice.metadata || {}),
      stripePaymentIntentId: paymentIntent.paymentIntentId,
    };
    await invoiceRepo.updateOneById(invoiceId, {
      paymentStatus: 'pending',
      metadata: updatedMetadata,
    });
    
    logger.info(
      {
        invoiceId,
        paymentIntentId: paymentIntent.paymentIntentId,
        amount: amount,
        currency,
        hasCheckoutUrl: !!paymentIntent.checkoutUrl
      },
      'Payment intent created successfully for invoice'
    );

    // Return the response as defined in TypeSpec
    // Use Stripe Checkout URL if available (when success/cancel URLs provided)
    // Otherwise fall back to Payment Intent client secret
    const checkoutUrl = paymentIntent.checkoutUrl || 
      `https://checkout.stripe.com/pay/${paymentIntent.clientSecret}`;

    return ctx.json({
      checkoutUrl,
      metadata: {
        paymentIntentId: paymentIntent.paymentIntentId,
        clientSecret: paymentIntent.clientSecret,
        amount: amount,
        currency,
        status: paymentIntent.status,
      }
    }, 200);
    
  } catch (error) {
    logger.error({ error, invoiceId, paymentMethod }, 'Failed to create payment intent');
    
    if (error instanceof ValidationError || error instanceof ConflictError || error instanceof BusinessLogicError) {
      throw error;
    }
    
    throw new BusinessLogicError(
      'Failed to create payment intent. Please try again later.',
      'PAYMENT_INTENT_ERROR'
    );
  }
}