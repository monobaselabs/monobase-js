import { http, HttpResponse } from 'msw';
import { faker } from '@faker-js/faker';
import { getUnixTime } from 'date-fns';

// Type for captured Postmark emails
export interface PostmarkEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  messageStream: string;
  timestamp: Date;
  tag?: string;
  metadata?: Record<string, any>;
}

// Global variable to capture test data for verification
export const mswTestData = {
  stripeAccountId: null as string | null,
  paymentIntentId: null as string | null,
  onboardingUrl: null as string | null,
  oneSignalNotifications: [] as any[],
  emails: [] as PostmarkEmail[],
  reset() {
    this.stripeAccountId = null;
    this.paymentIntentId = null;
    this.onboardingUrl = null;
    this.oneSignalNotifications = [];
    this.emails = [];
  }
};

export const handlers = [
  // Postmark Email API - Send Single Email
  http.post('https://api.postmarkapp.com/email', async ({ request }) => {
    const body = await request.json() as any;

    const emailId = faker.string.uuid();
    const email: PostmarkEmail = {
      id: emailId,
      from: body.From || 'test@test.com',
      to: body.To,
      subject: body.Subject || 'Test Email',
      htmlBody: body.HtmlBody,
      textBody: body.TextBody,
      messageStream: body.MessageStream || 'outbound',
      timestamp: new Date(),
      tag: body.Tag,
      metadata: body.Metadata
    };

    // Store email for test verification
    mswTestData.emails.push(email);

    // Return Postmark success response
    return HttpResponse.json({
      To: email.to,
      SubmittedAt: email.timestamp.toISOString(),
      MessageID: emailId,
      ErrorCode: 0,
      Message: 'OK'
    });
  }),

  // Postmark Email API - Send Batch Emails
  http.post('https://api.postmarkapp.com/email/batch', async ({ request }) => {
    const emails = await request.json() as any[];

    const responses = emails.map(body => {
      const emailId = faker.string.uuid();
      const email: PostmarkEmail = {
        id: emailId,
        from: body.From || 'test@test.com',
        to: body.To,
        subject: body.Subject || 'Test Email',
        htmlBody: body.HtmlBody,
        textBody: body.TextBody,
        messageStream: body.MessageStream || 'outbound',
        timestamp: new Date(),
        tag: body.Tag,
        metadata: body.Metadata
      };

      // Store email for test verification
      mswTestData.emails.push(email);

      return {
        To: email.to,
        SubmittedAt: email.timestamp.toISOString(),
        MessageID: emailId,
        ErrorCode: 0,
        Message: 'OK'
      };
    });

    return HttpResponse.json(responses);
  }),

  // Postmark Email API - Send with Template
  http.post('https://api.postmarkapp.com/email/withTemplate', async ({ request }) => {
    const body = await request.json() as any;

    const emailId = faker.string.uuid();
    const email: PostmarkEmail = {
      id: emailId,
      from: body.From || 'test@test.com',
      to: body.To,
      subject: `Template ${body.TemplateId || 'Unknown'}`,
      htmlBody: `<p>Template email with model: ${JSON.stringify(body.TemplateModel || {})}</p>`,
      textBody: `Template email with model: ${JSON.stringify(body.TemplateModel || {})}`,
      messageStream: body.MessageStream || 'outbound',
      timestamp: new Date(),
      tag: body.Tag,
      metadata: {
        templateId: body.TemplateId,
        templateModel: body.TemplateModel,
        ...body.Metadata
      }
    };

    // Store email for test verification
    mswTestData.emails.push(email);

    // Return Postmark success response
    return HttpResponse.json({
      To: email.to,
      SubmittedAt: email.timestamp.toISOString(),
      MessageID: emailId,
      ErrorCode: 0,
      Message: 'OK'
    });
  }),

  // Postmark Server Info (for health checks)
  http.get('https://api.postmarkapp.com/server', async () => {
    return HttpResponse.json({
      ID: 1,
      Name: 'Test Server',
      ApiTokens: ['test-token'],
      Color: 'purple',
      SmtpApiActivated: true,
      InboundAddress: 'test@inbound.postmarkapp.com',
      InboundHookUrl: '',
      BounceHookUrl: '',
      OpenHookUrl: '',
      PostFirstOpenOnly: false,
      TrackOpens: false,
      TrackLinks: 'None',
      IncludeBounceContentInHook: true,
      EnableSmtpApiErrorHooks: false
    });
  }),

  // Stripe Express Account Creation
  http.post('https://api.stripe.com/v1/accounts', async ({ request }) => {
    const formData = await request.formData();
    const accountId = `acct_${faker.string.alphanumeric(16)}`;

    mswTestData.stripeAccountId = accountId;

    return HttpResponse.json({
      id: accountId,
      object: 'account',
      business_profile: {
        url: null,
      },
      capabilities: {
        card_payments: {
          requested: true,
          status: 'active'
        },
        transfers: {
          requested: true,
          status: 'active'
        }
      },
      charges_enabled: true,
      country: formData.get('country') || 'US',
      created: getUnixTime(new Date()),
      default_currency: 'usd',
      details_submitted: false,
      email: formData.get('email') || faker.internet.email(),
      external_accounts: {
        object: 'list',
        data: [],
        has_more: false,
        total_count: 0,
        url: `/v1/accounts/${accountId}/external_accounts`
      },
      metadata: {},
      payouts_enabled: false,
      requirements: {
        alternatives: [],
        current_deadline: null,
        currently_due: ['business_profile.url', 'external_account'],
        disabled_reason: 'requirements.past_due',
        errors: [],
        eventually_due: ['business_profile.url', 'external_account'],
        past_due: [],
        pending_verification: []
      },
      settings: {
        bacs_debit_payments: {},
        branding: {
          icon: null,
          logo: null,
          primary_color: null,
          secondary_color: null
        },
        card_issuing: {
          tos_acceptance: {
            date: null,
            ip: null
          }
        },
        card_payments: {
          decline_on: {
            avs_failure: false,
            cvc_failure: false
          },
          statement_descriptor_prefix: null,
          statement_descriptor_prefix_kana: null,
          statement_descriptor_prefix_kanji: null
        },
        dashboard: {
          display_name: formData.get('business_profile[name]') || 'Test Business',
          timezone: 'Etc/UTC'
        },
        payments: {
          statement_descriptor: null,
          statement_descriptor_kana: null,
          statement_descriptor_kanji: null
        },
        payouts: {
          debit_negative_balances: false,
          schedule: {
            delay_days: 2,
            interval: 'daily'
          },
          statement_descriptor: null
        },
        sepa_debit_payments: {}
      },
      tos_acceptance: {
        date: null,
        ip: null,
        user_agent: null
      },
      type: 'express'
    });
  }),

  // Stripe Account Retrieval
  http.get(/https:\/\/api\.stripe\.com\/v1\/accounts\/acct_.*/, async ({ params }) => {
    const accountId = params[0] as string;

    return HttpResponse.json({
      id: accountId,
      object: 'account',
      business_profile: {
        url: 'https://example.com',
      },
      capabilities: {
        card_payments: {
          requested: true,
          status: 'active'
        },
        transfers: {
          requested: true,
          status: 'active'
        }
      },
      charges_enabled: true,
      country: 'US',
      created: getUnixTime(new Date()),
      default_currency: 'usd',
      details_submitted: true,
      email: faker.internet.email(),
      payouts_enabled: true,
      requirements: {
        alternatives: [],
        current_deadline: null,
        currently_due: [],
        disabled_reason: null,
        errors: [],
        eventually_due: [],
        past_due: [],
        pending_verification: []
      },
      type: 'express'
    });
  }),

  // Stripe Account Links (Onboarding URLs)
  http.post('https://api.stripe.com/v1/account_links', async ({ request }) => {
    const formData = await request.formData();
    const onboardingUrl = `https://connect.stripe.com/setup/e/${faker.string.alphanumeric(32)}`;

    mswTestData.onboardingUrl = onboardingUrl;

    return HttpResponse.json({
      object: 'account_link',
      created: getUnixTime(new Date()),
      expires_at: getUnixTime(new Date()) + 300, // 5 minutes
      url: onboardingUrl
    });
  }),

  // Stripe Account Login Links (Dashboard URLs)
  http.post(/https:\/\/api\.stripe\.com\/v1\/accounts\/acct_[^/]+\/login_links/, async () => {
    return HttpResponse.json({
      object: 'login_link',
      created: getUnixTime(new Date()),
      url: `https://connect.stripe.com/express/${faker.string.alphanumeric(32)}`
    });
  }),

  // Stripe Payment Intent Creation
  http.post('https://api.stripe.com/v1/payment_intents', async ({ request }) => {
    const formData = await request.formData();
    const paymentIntentId = `pi_${faker.string.alphanumeric(24)}`;

    mswTestData.paymentIntentId = paymentIntentId;

    return HttpResponse.json({
      id: paymentIntentId,
      object: 'payment_intent',
      amount: parseInt(formData.get('amount') as string) || 2000,
      amount_capturable: 0,
      amount_details: {
        tip: {}
      },
      amount_received: 0,
      application: null,
      application_fee_amount: null,
      automatic_payment_methods: null,
      canceled_at: null,
      cancellation_reason: null,
      capture_method: formData.get('capture_method') || 'automatic',
      client_secret: `${paymentIntentId}_secret_${faker.string.alphanumeric(16)}`,
      confirmation_method: 'automatic',
      created: getUnixTime(new Date()),
      currency: formData.get('currency') || 'usd',
      customer: formData.get('customer') || null,
      description: formData.get('description') || null,
      invoice: null,
      last_payment_error: null,
      latest_charge: null,
      livemode: false,
      metadata: {},
      next_action: null,
      on_behalf_of: formData.get('on_behalf_of') || null,
      payment_method: null,
      payment_method_options: {},
      payment_method_types: ['card'],
      processing: null,
      receipt_email: null,
      review: null,
      setup_future_usage: null,
      shipping: null,
      statement_descriptor: null,
      statement_descriptor_suffix: null,
      status: 'requires_payment_method',
      transfer_data: null,
      transfer_group: null
    });
  }),

  // Stripe Payment Intent Capture
  http.post(/https:\/\/api\.stripe\.com\/v1\/payment_intents\/(pi_[^/]+)\/capture/, async ({ params }) => {
    const paymentIntentId = params[0] as string;
    const chargeId = `ch_${faker.string.alphanumeric(24)}`;

    return HttpResponse.json({
      id: paymentIntentId,
      object: 'payment_intent',
      amount: 2000,
      amount_capturable: 0,
      amount_received: 2000,
      capture_method: 'manual',
      latest_charge: chargeId,
      charges: {
        object: 'list',
        data: [
          {
            id: chargeId,
            object: 'charge',
            amount: 2000,
            captured: true,
            created: getUnixTime(new Date()),
            currency: 'usd',
            paid: true,
            status: 'succeeded',
            transfer: `tr_${faker.string.alphanumeric(24)}`
          }
        ]
      },
      created: getUnixTime(new Date()),
      currency: 'usd',
      status: 'succeeded'
    });
  }),

  // Stripe Refunds
  http.post('https://api.stripe.com/v1/refunds', async ({ request }) => {
    const formData = await request.formData();

    return HttpResponse.json({
      id: `re_${faker.string.alphanumeric(24)}`,
      object: 'refund',
      amount: parseInt(formData.get('amount') as string) || 2000,
      charge: formData.get('charge') || `ch_${faker.string.alphanumeric(24)}`,
      created: getUnixTime(new Date()),
      currency: 'usd',
      metadata: {},
      payment_intent: formData.get('payment_intent') || null,
      reason: formData.get('reason') || null,
      receipt_number: null,
      source_transfer_reversal: null,
      status: 'succeeded',
      transfer_reversal: null
    });
  }),

  // Stripe Payment Intent Cancel (for waiving payments)
  http.post(/https:\/\/api\.stripe\.com\/v1\/payment_intents\/(pi_[^/]+)\/cancel/, async ({ params }) => {
    const paymentIntentId = params[0] as string;

    return HttpResponse.json({
      id: paymentIntentId,
      object: 'payment_intent',
      amount: 2000,
      amount_capturable: 0,
      amount_received: 0,
      canceled_at: getUnixTime(new Date()),
      cancellation_reason: 'requested_by_customer',
      capture_method: 'manual',
      created: getUnixTime(new Date()),
      currency: 'usd',
      status: 'canceled'
    });
  }),

  // Stripe Charge Retrieval (for getting transfer ID after capture)
  http.get(/https:\/\/api\.stripe\.com\/v1\/charges\/(ch_[^?]+)/, async ({ params }) => {
    const chargeId = params[0] as string;

    return HttpResponse.json({
      id: chargeId,
      object: 'charge',
      amount: 2000,
      amount_captured: 2000,
      amount_refunded: 0,
      captured: true,
      created: getUnixTime(new Date()),
      currency: 'usd',
      paid: true,
      status: 'succeeded',
      transfer: `tr_${faker.string.alphanumeric(24)}`
    });
  }),

  // Stripe Checkout Session Creation
  http.post('https://api.stripe.com/v1/checkout/sessions', async ({ request }) => {
    const formData = await request.formData();
    const paymentMethodTypes = formData.get('payment_method_types[]');
    const successUrl = formData.get('success_url') as string;
    const cancelUrl = formData.get('cancel_url') as string;
    const paymentIntentData = formData.get('payment_intent_data[metadata][invoiceId]') as string;

    // Validate payment method (should reject invalid formats)
    const invalidPaymentMethods = ['invalid_pm', 'test_invalid'];
    if (invalidPaymentMethods.includes(paymentMethodTypes as string)) {
      return HttpResponse.json({
        error: {
          type: 'invalid_request_error',
          message: 'Invalid payment method type provided'
        }
      }, { status: 400 });
    }

    const sessionId = `cs_${faker.string.alphanumeric(32)}`;

    return HttpResponse.json({
      id: sessionId,
      object: 'checkout.session',
      after_expiration: null,
      allow_promotion_codes: null,
      amount_subtotal: 2000,
      amount_total: 2000,
      automatic_tax: {
        enabled: false,
        status: null
      },
      billing_address_collection: null,
      cancel_url: cancelUrl,
      client_reference_id: null,
      consent: null,
      consent_collection: null,
      created: getUnixTime(new Date()),
      currency: 'usd',
      currency_conversion: null,
      custom_fields: [],
      custom_text: {
        shipping_address: null,
        submit: null
      },
      customer: null,
      customer_creation: 'if_required',
      customer_details: null,
      customer_email: null,
      expires_at: getUnixTime(new Date()) + 86400, // 24 hours
      invoice: null,
      invoice_creation: null,
      livemode: false,
      locale: null,
      metadata: {
        invoiceId: paymentIntentData
      },
      mode: 'payment',
      payment_intent: null,
      payment_link: null,
      payment_method_collection: 'if_required',
      payment_method_options: {},
      payment_method_types: [paymentMethodTypes || 'card'],
      payment_status: 'unpaid',
      phone_number_collection: {
        enabled: false
      },
      recovered_from: null,
      setup_intent: null,
      shipping_address_collection: null,
      shipping_cost: null,
      shipping_details: null,
      shipping_options: [],
      status: 'open',
      submit_type: null,
      subscription: null,
      success_url: successUrl,
      total_details: {
        amount_discount: 0,
        amount_shipping: 0,
        amount_tax: 0
      },
      ui_mode: 'hosted',
      url: `https://checkout.stripe.com/c/pay/${sessionId}`
    });
  }),

  // Stripe Webhooks (for webhook testing)
  http.post(/https:\/\/hooks\.stripe\.com\/.*/, async ({ request }) => {
    return HttpResponse.json({ received: true }, { status: 200 });
  }),

  // OneSignal Notification Creation
  http.post('https://onesignal.com/api/v1/notifications', async ({ request }) => {
    const body = await request.json() as any;

    // Store notification data for test verification
    mswTestData.oneSignalNotifications.push(body);

    // Return mock OneSignal response
    return HttpResponse.json({
      id: faker.string.uuid(),
      recipients: 1,
      external_id: body.include_aliases?.external_id || [],
      errors: {}
    });
  }),

  // OneSignal User creation/update
  http.put(/https:\/\/onesignal\.com\/api\/v1\/apps\/.*\/users\/.*/, async () => {
    return HttpResponse.json({
      properties: {
        tags: {},
        language: 'en'
      },
      identity: {
        external_id: faker.string.uuid()
      }
    });
  }),

  // OneSignal App retrieval
  http.get(/https:\/\/onesignal\.com\/api\/v1\/apps\/.*/, async () => {
    return HttpResponse.json({
      id: 'test-app-id',
      name: 'Test App',
      players: 0,
      messageable_players: 0,
      created_at: '2024-01-01T00:00:00.000Z'
    });
  }),

  // Generic OneSignal API fallback for unhandled endpoints
  http.get(/https:\/\/onesignal\.com\/.*/, () => {
    return HttpResponse.json({
      errors: ['Unhandled OneSignal API endpoint in MSW mock']
    }, { status: 400 });
  }),

  http.post(/https:\/\/onesignal\.com\/.*/, () => {
    return HttpResponse.json({
      errors: ['Unhandled OneSignal API endpoint in MSW mock']
    }, { status: 400 });
  }),

  // Generic Stripe API fallback
  http.get(/https:\/\/api\.stripe\.com\/.*/, () => {
    return HttpResponse.json({
      error: {
        type: 'invalid_request_error',
        message: 'Unhandled Stripe API endpoint in MSW mock'
      }
    }, { status: 400 });
  }),

  http.post(/https:\/\/api\.stripe\.com\/.*/, () => {
    return HttpResponse.json({
      error: {
        type: 'invalid_request_error',
        message: 'Unhandled Stripe API endpoint in MSW mock'
      }
    }, { status: 400 });
  })
];