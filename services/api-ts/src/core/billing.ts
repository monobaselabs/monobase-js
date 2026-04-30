/**
 * Stripe service integration for billing and payments
 * Handles Stripe Connect accounts, payment intents, transfers, and webhooks
 */

import Stripe from 'stripe';
import type { Logger } from 'pino';
import type { DatabaseInstance } from './database';

/**
 * Stripe configuration
 */
export interface StripeConfig {
  secretKey?: string;
  webhookSecret?: string;
  url?: string; // Custom Stripe API URL for testing
}

/**
 * Billing configuration
 */
export interface BillingConfig {
  provider: 'stripe';
  stripe?: StripeConfig;
}

export interface PaymentIntentData {
  amount: number; // Amount in cents
  currency: string;
  metadata?: Record<string, string>;
  connectedAccountId: string;
  platformFeeAmount: number; // Platform fee in cents
  description?: string;
  successUrl?: string; // URL to redirect after successful payment
  cancelUrl?: string; // URL to redirect if payment is cancelled
}

export interface RefundData {
  paymentIntentId: string;
  amount?: number; // Amount in cents, if not provided will refund full amount
  reason?: 'requested_by_customer' | 'duplicate' | 'fraudulent';
  metadata?: Record<string, string>;
  connectedAccountId: string;
}

export interface ConnectAccountData {
  email?: string; // Optional - collected during Stripe onboarding if not provided
  country?: string; // Optional - collected during Stripe onboarding if not provided
  businessType: 'individual' | 'company';
  refreshUrl: string;
  returnUrl: string;
  metadata?: Record<string, string>;
}

export class BillingService {
  private stripe: Stripe | null = null;
  private config: StripeConfig | undefined;
  private logger: Logger;
  private database: DatabaseInstance;

  constructor(billingConfig: BillingConfig, database: DatabaseInstance, logger: Logger) {
    // Extract Stripe config from billing config (can be undefined)
    this.config = billingConfig?.stripe;
    this.database = database;
    this.logger = logger.child({ service: 'billing' });
  }

  /**
   * Lazy initialization of Stripe SDK - only creates instance when first needed
   */
  private ensureStripeInitialized(): Stripe {
    if (this.stripe) {
      return this.stripe;
    }

    if (!this.config) {
      throw new Error(
        'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.'
      );
    }

    if (!this.config.secretKey) {
      throw new Error(
        'Stripe secret key is required for billing operations. Please set STRIPE_SECRET_KEY environment variable.'
      );
    }

    this.logger.debug('Initializing Stripe SDK with lazy loading');
    
    const stripeOptions: Stripe.StripeConfig = {
      apiVersion: '2025-09-30.clover',
      typescript: true,
      timeout: 10000, // 10 second timeout
    };

    // Use custom URL if provided (for testing with mock service)
    if (this.config.url) {
      const url = new URL(this.config.url);
      stripeOptions.host = url.hostname;
      stripeOptions.port = url.port || (url.protocol === 'https:' ? '443' : '80');
      stripeOptions.protocol = url.protocol.replace(':', '') as 'http' | 'https';
      this.logger.info({ url: this.config.url }, 'Using custom Stripe URL');
    }

    this.logger.info({ 
      key: this.config.secretKey,
      stripeOptions
    }, 'stripe.initialize')
    this.stripe = new Stripe(this.config.secretKey, stripeOptions);

    return this.stripe;
  }

  /**
   * Create a Stripe Connect Express account for a provider
   */
  async createConnectAccount(data: ConnectAccountData): Promise<{
    accountId: string;
    onboardingUrl: string;
  }> {
    try {
      const stripe = this.ensureStripeInitialized();
      this.logger.info({ email: data.email, country: data.country }, 'Creating Stripe Connect account');

      const account = await stripe.accounts.create({
        type: 'express',
        // email: data.email,
        // country: data.country,
        // business_type: data.businessType,
        metadata: data.metadata,
        // capabilities: {
        //   card_payments: { requested: true },
        //   transfers: { requested: true },
        // },
      });

      // Create onboarding link
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: data.refreshUrl,
        return_url: data.returnUrl,
        type: 'account_onboarding',
      });

      this.logger.info({ accountId: account.id }, 'Stripe Connect account created successfully');

      return {
        accountId: account.id,
        onboardingUrl: accountLink.url,
      };
    } catch (error) {
      this.logger.error({ error, data }, 'Failed to create Stripe Connect account');
      throw new Error(`Failed to create Stripe Connect account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a new onboarding link for an existing Stripe Connect account
   */
  async generateOnboardingLink(accountId: string, refreshUrl: string, returnUrl: string): Promise<{
    onboardingUrl: string;
  }> {
    try {
      const stripe = this.ensureStripeInitialized();
      this.logger.info({ accountId }, 'Generating Stripe Connect onboarding link');

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      this.logger.info({ accountId, url: accountLink.url }, 'Onboarding link generated successfully');

      return {
        onboardingUrl: accountLink.url,
      };
    } catch (error) {
      this.logger.error({ error, accountId }, 'Failed to generate onboarding link');
      throw new Error(`Failed to generate onboarding link: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the status and details of a Stripe Connect account
   */
  async getConnectAccountStatus(accountId: string): Promise<{
    status: 'pending' | 'active' | 'restricted';
    onboardingComplete: boolean;
    dashboardUrl?: string;
  }> {
    try {
      const stripe = this.ensureStripeInitialized();
      const account = await stripe.accounts.retrieve(accountId);

      let status: 'pending' | 'active' | 'restricted' = 'pending';
      if (account.charges_enabled && account.payouts_enabled) {
        status = 'active';
      } else if (account.requirements?.disabled_reason) {
        status = 'restricted';
      }

      const onboardingComplete = !account.requirements?.currently_due?.length;
      
      let dashboardUrl: string | undefined;
      if (status === 'active') {
        const loginLink = await stripe.accounts.createLoginLink(accountId);
        dashboardUrl = loginLink.url;
      }

      return {
        status,
        onboardingComplete,
        dashboardUrl,
      };
    } catch (error) {
      this.logger.error({ error, accountId }, 'Failed to get Connect account status');
      throw new Error(`Failed to get Connect account status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a payment intent with application fee (platform fee)
   * Uses the "Hold & Decide" model - authorizes payment but doesn't capture
   * 
   * If successUrl and cancelUrl are provided, creates a Checkout Session instead
   * for hosted payment page experience
   */
  async createPaymentIntent(data: PaymentIntentData): Promise<{
    paymentIntentId: string;
    clientSecret: string;
    status: string;
    checkoutUrl?: string;
  }> {
    try {
      const stripe = this.ensureStripeInitialized();
      this.logger.info(
        { 
          amount: data.amount, 
          currency: data.currency, 
          connectedAccountId: data.connectedAccountId,
          platformFee: data.platformFeeAmount,
          hasCheckoutUrls: !!(data.successUrl && data.cancelUrl)
        }, 
        'Creating payment intent'
      );

      // If success/cancel URLs provided, create Checkout Session for hosted payment page
      if (data.successUrl && data.cancelUrl) {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          success_url: data.successUrl,
          cancel_url: data.cancelUrl,
          line_items: [
            {
              price_data: {
                currency: data.currency,
                product_data: {
                  name: data.description || 'Service Payment',
                },
                unit_amount: data.amount,
              },
              quantity: 1,
            },
          ],
          payment_intent_data: {
            application_fee_amount: data.platformFeeAmount,
            capture_method: 'manual', // Hold & Decide model
            metadata: data.metadata || {},
            description: data.description,
          },
          metadata: data.metadata || {},
        }, {
          stripeAccount: data.connectedAccountId,
        });

        this.logger.info(
          { 
            sessionId: session.id,
            paymentIntentId: session.payment_intent,
            checkoutUrl: session.url 
          }, 
          'Checkout session created successfully'
        );

        return {
          paymentIntentId: session.payment_intent as string,
          clientSecret: '', // Not needed for checkout sessions
          status: 'pending',
          checkoutUrl: session.url!,
        };
      }

      // Otherwise, create regular Payment Intent for custom integration
      const paymentIntent = await stripe.paymentIntents.create({
        amount: data.amount,
        currency: data.currency,
        capture_method: 'manual', // Hold & Decide model
        confirmation_method: 'automatic',
        application_fee_amount: data.platformFeeAmount,
        metadata: data.metadata || {},
        description: data.description,
      }, {
        stripeAccount: data.connectedAccountId,
      });

      this.logger.info(
        { paymentIntentId: paymentIntent.id, status: paymentIntent.status }, 
        'Payment intent created successfully'
      );

      return {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret!,
        status: paymentIntent.status,
      };
    } catch (error) {
      this.logger.error({ error, data }, 'Failed to create payment intent');
      throw new Error(`Failed to create payment intent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Capture a previously authorized payment intent.
   * Host decision: capture payment after the service is delivered.
   */
  async capturePaymentIntent(
    paymentIntentId: string, 
    connectedAccountId: string,
    metadata?: Record<string, string>
  ): Promise<{
    paymentIntentId: string;
    status: string;
    chargeId: string;
    transferId?: string;
  }> {
    try {
      const stripe = this.ensureStripeInitialized();
      this.logger.info({ paymentIntentId, connectedAccountId }, 'Capturing payment intent');

      const paymentIntent = await stripe.paymentIntents.capture(
        paymentIntentId,
        { metadata },
        { stripeAccount: connectedAccountId } as any
      );

      const chargeId = typeof paymentIntent.latest_charge === 'string' 
        ? paymentIntent.latest_charge 
        : paymentIntent.latest_charge?.id || '';
      let transferId: string | undefined;

      // Get transfer ID if payment was captured successfully
      if (paymentIntent.status === 'succeeded' && chargeId) {
        const charge = await stripe.charges.retrieve(chargeId, {
          stripeAccount: connectedAccountId,
        });
        transferId = charge.transfer as string;
      }

      this.logger.info(
        { 
          paymentIntentId, 
          status: paymentIntent.status, 
          chargeId,
          transferId 
        }, 
        'Payment intent captured successfully'
      );

      return {
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        chargeId,
        transferId,
      };
    } catch (error) {
      this.logger.error({ error, paymentIntentId, connectedAccountId }, 'Failed to capture payment intent');
      throw new Error(`Failed to capture payment intent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cancel a payment intent instead of capturing it.
   * Host decision: waive payment after the service is delivered.
   */
  async cancelPaymentIntent(
    paymentIntentId: string, 
    connectedAccountId: string,
    reason?: string
  ): Promise<{
    paymentIntentId: string;
    status: string;
  }> {
    try {
      const stripe = this.ensureStripeInitialized();
      this.logger.info({ paymentIntentId, connectedAccountId, reason }, 'Cancelling payment intent');

      const paymentIntent = await stripe.paymentIntents.cancel(
        paymentIntentId,
        { cancellation_reason: 'requested_by_customer' },
        { stripeAccount: connectedAccountId }
      );

      this.logger.info(
        { paymentIntentId, status: paymentIntent.status }, 
        'Payment intent cancelled successfully'
      );

      return {
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      };
    } catch (error) {
      this.logger.error({ error, paymentIntentId, connectedAccountId }, 'Failed to cancel payment intent');
      throw new Error(`Failed to cancel payment intent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a refund for a captured payment
   */
  async createRefund(data: RefundData): Promise<{
    refundId: string;
    status: string;
    amount: number;
  }> {
    try {
      const stripe = this.ensureStripeInitialized();
      this.logger.info(
        { 
          paymentIntentId: data.paymentIntentId, 
          amount: data.amount,
          reason: data.reason,
          connectedAccountId: data.connectedAccountId
        }, 
        'Creating refund'
      );

      const refund = await stripe.refunds.create({
        payment_intent: data.paymentIntentId,
        amount: data.amount,
        reason: data.reason,
        metadata: data.metadata || {},
      }, {
        stripeAccount: data.connectedAccountId,
      });

      this.logger.info(
        { refundId: refund.id, status: refund.status, amount: refund.amount }, 
        'Refund created successfully'
      );

      return {
        refundId: refund.id || '',
        status: refund.status || '',
        amount: refund.amount || 0,
      };
    } catch (error) {
      this.logger.error({ error, data }, 'Failed to create refund');
      throw new Error(`Failed to create refund: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify webhook signature and return the event
   */
  async verifyWebhookSignature(payload: string | Buffer, signature: string): Promise<Stripe.Event> {
    try {
      const stripe = this.ensureStripeInitialized();

      if (!this.config) {
        throw new Error('Stripe configuration not initialized');
      }

      const webhookSecret = this.config.webhookSecret;
      if (!webhookSecret) {
        throw new Error(
          'Stripe webhook secret is required for webhook verification. Please set STRIPE_WEBHOOK_SECRET environment variable.'
        );
      }

      if (!stripe.webhooks) {
        throw new Error('Stripe webhooks API not available');
      }

      const event = await stripe.webhooks!.constructEventAsync(
        payload,
        signature,
        webhookSecret
      );
      
      if (!event) {
        throw new Error('Failed to construct Stripe webhook event');
      }
      
      return event;
    } catch (error) {
      this.logger.error({ error }, 'Invalid webhook signature');
      throw new Error(`Invalid webhook signature: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get payment intent status and details
   */
  async getPaymentIntent(
    paymentIntentId: string, 
    connectedAccountId: string
  ): Promise<{
    id: string;
    status: string;
    amount: number;
    currency: string;
    charges: Array<{
      id: string;
      status: string;
      amount: number;
    }>;
  }> {
    try {
      const stripe = this.ensureStripeInitialized();
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        { expand: ['latest_charge'] },
        { stripeAccount: connectedAccountId }
      );

      // In newer Stripe API versions, we need to fetch charges separately or use latest_charge
      const latestCharge = typeof paymentIntent.latest_charge === 'string' 
        ? await stripe.charges.retrieve(paymentIntent.latest_charge, { stripeAccount: connectedAccountId })
        : paymentIntent.latest_charge;

      return {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        charges: latestCharge ? [{
          id: latestCharge.id,
          status: latestCharge.status,
          amount: latestCharge.amount,
        }] : [],
      };
    } catch (error) {
      this.logger.error({ error, paymentIntentId, connectedAccountId }, 'Failed to get payment intent');
      throw new Error(`Failed to get payment intent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Create billing service instance
 */
export function createBillingService(
  billingConfig: BillingConfig,
  database: DatabaseInstance,
  logger: Logger
): BillingService {
  return new BillingService(billingConfig, database, logger);
}
