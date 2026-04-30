import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "../common/models.tsp";
import "../common/errors.tsp";
import "../common/pagination.tsp";
import "../common/security.tsp";
import "./person.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

/**
 * Billing Module - Invoice-based payment processing
 * 
 * Provides invoice management, payment processing, and merchant accounts
 * with Stripe integration support.
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Invoice lifecycle status (Stripe-aligned)
 */
@doc("Invoice lifecycle status")
enum InvoiceStatus {
  @doc("Invoice is being edited")
  draft: "draft",
  
  @doc("Invoice is finalized and awaiting payment")
  open: "open",
  
  @doc("Invoice has been paid")
  paid: "paid",
  
  @doc("Invoice has been cancelled")
  voided: "void",
  
  @doc("Invoice is unlikely to be paid")
  uncollectible: "uncollectible",
}

/**
 * Payment processing status
 */
@doc("Payment processing status")
enum PaymentStatus {
  @doc("Payment is pending")
  pending: "pending",
  
  @doc("Payment requires manual capture")
  requires_capture: "requires_capture",
  
  @doc("Payment is being processed")
  processing: "processing",
  
  @doc("Payment succeeded")
  succeeded: "succeeded",
  
  @doc("Payment failed")
  failed: "failed",
  
  @doc("Payment was cancelled")
  canceled: "canceled",
}

/**
 * Payment capture method
 */
@doc("Payment capture method")
enum CaptureMethod {
  @doc("Charge immediately when payment method provided")
  automatic: "automatic",
  
  @doc("Authorize only, capture separately")
  manual: "manual",
}

/**
 * Currency code type
 */
@doc("Three-letter ISO 4217 currency code")
@pattern("^[A-Z]{3}$")
scalar CurrencyCode extends string;

// ============================================================================
// MODELS
// ============================================================================

/**
 * Invoice line item
 */
@doc("Invoice line item")
model InvoiceLineItem {
  @doc("Item description")
  @maxLength(500)
  description: string;
  
  @doc("Quantity")
  @minValue(1)
  quantity: int32 = 1;
  
  @doc("Unit price in cents")
  @minValue(0)
  unitPrice: CurrencyAmount;
  
  @doc("Total amount in cents (quantity * unitPrice)")
  @minValue(0)
  amount: CurrencyAmount;
  
  @doc("Metadata for tracking (e.g., {type: 'booking', reference: UUID})")
  metadata?: Record<unknown>;
}

/**
 * Invoice model
 */
@doc("Invoice for billing and payments")
model Invoice extends BaseEntity {
  @doc("Auto-generated invoice number")
  @maxLength(50)
  invoiceNumber: string;

  @doc("Customer (person who pays)")
  @extension("x-expandable-field", #{ opId: "getPerson" })
  customer: string | Person;

  @doc("Merchant (person who receives payment)")
  @extension("x-expandable-field", #{ opId: "getPerson" })
  merchant: string | Person;

  @doc("Optional merchant account for payment processing")
  @extension("x-expandable-field", #{ opId: "getMerchantAccount" })
  merchantAccount?: string | MerchantAccount;
  
  @doc("Unique context for idempotency (e.g., 'booking:123')")
  @maxLength(255)
  context?: string;
  
  @doc("Invoice status")
  status: InvoiceStatus;
  
  @doc("Subtotal amount in cents")
  @minValue(0)
  subtotal: CurrencyAmount;
  
  @doc("Tax amount in cents")
  @minValue(0)
  tax?: CurrencyAmount;
  
  @doc("Total amount to charge in cents")
  @minValue(0)
  total: CurrencyAmount;
  
  @doc("Currency code")
  currency: CurrencyCode;
  
  @doc("Payment capture method")
  paymentCaptureMethod: CaptureMethod;
  
  @doc("Date when invoice was issued")
  issuedAt?: utcDateTime;
  
  @doc("Payment due date")
  paymentDueAt?: utcDateTime;
  
  @doc("Line items")
  lineItems: InvoiceLineItem[];
  
  @doc("Payment status")
  paymentStatus?: PaymentStatus;
  
  @doc("Timestamp when paid")
  paidAt?: utcDateTime;
  
  @doc("Person who processed the payment")
  paidBy?: UUID;
  
  @doc("Timestamp when voided")
  voidedAt?: utcDateTime;
  
  @doc("Person who voided the invoice")
  voidedBy?: UUID;
  
  @doc("Void threshold in minutes for charge protection")
  voidThresholdMinutes?: int32;
  
  @doc("Timestamp when payment was authorized")
  authorizedAt?: utcDateTime;
  
  @doc("Person who authorized the payment")
  authorizedBy?: UUID;
  
  @doc("Metadata (includes Stripe IDs, etc.)")
  metadata?: Record<unknown>;
}

/**
 * Merchant account model
 */
@doc("Merchant account for payment processing")
model MerchantAccount extends BaseEntity {
  @doc("Person who owns this merchant account")
  @extension("x-expandable-field", #{ opId: "getPerson" })
  person: string | Person;

  @doc("Whether account is active")
  active: boolean;

  @doc("Metadata (includes Stripe account ID, onboardingComplete, etc.)")
  metadata: Record<unknown>;
}

// ============================================================================
// REQUEST/RESPONSE MODELS
// ============================================================================

/**
 * Create invoice request
 */
@doc("Request to create an invoice")
model CreateInvoiceRequest {
  @doc("Customer (person who pays)")
  customer: UUID;
  
  @doc("Merchant (person who receives payment)")
  merchant: UUID;
  
  @doc("Context for idempotency (e.g., 'booking:123')")
  @maxLength(255)
  context?: string;
  
  @doc("Currency code")
  currency?: CurrencyCode = "USD";
  
  @doc("Payment capture method")
  paymentCaptureMethod?: CaptureMethod = CaptureMethod.automatic;
  
  @doc("Payment due date")
  paymentDueAt?: utcDateTime;
  
  @doc("Void threshold in minutes for charge protection")
  voidThresholdMinutes?: int32;
  
  @doc("Line items")
  lineItems: CreateLineItemRequest[];
  
  @doc("Additional metadata")
  metadata?: Record<unknown>;
}

/**
 * Create line item request
 */
@doc("Request to create a line item")
model CreateLineItemRequest {
  @doc("Item description")
  @maxLength(500)
  description: string;
  
  @doc("Quantity")
  @minValue(1)
  quantity?: int32 = 1;
  
  @doc("Unit price in cents")
  @minValue(0)
  unitPrice: CurrencyAmount;
  
  @doc("Metadata for tracking")
  metadata?: Record<unknown>;
}

/**
 * Update invoice request
 */
@doc("Request to update an invoice")
model UpdateInvoiceRequest {
  @doc("Payment capture method (draft only)")
  paymentCaptureMethod?: CaptureMethod;
  
  @doc("Payment due date (draft only). Pass null to clear an existing due date.")
  paymentDueAt?: utcDateTime | null;
  
  @doc("Void threshold in minutes (draft only)")
  voidThresholdMinutes?: int32;
  
  @doc("Replace all line items (draft only)")
  lineItems?: CreateLineItemRequest[];
  
  @doc("Additional metadata")
  metadata?: Record<unknown>;
}

/**
 * Payment request
 */
@doc("Request to initiate payment")
model PaymentRequest {
  @doc("Payment method (provider-specific)")
  @maxLength(255)
  paymentMethod?: string;
  
  @doc("Additional metadata")
  metadata?: Record<unknown>;
}

/**
 * Payment response
 */
@doc("Response after initiating payment")
model PaymentResponse {
  @doc("URL to redirect user for payment")
  checkoutUrl: string;
  
  @doc("Additional metadata (status, clientSecret, etc.)")
  metadata?: Record<unknown>;
}

/**
 * Create merchant account request
 */
@doc("Request to create a merchant account")
model CreateMerchantAccountRequest {
  @doc("Person who owns this merchant account (defaults to authenticated user)")
  person?: UUID;

  @doc("URL to redirect to if onboarding needs to be refreshed")
  refreshUrl: url;

  @doc("URL to redirect to after successful onboarding")
  returnUrl: url;

  @doc("Additional provider-specific data")
  metadata?: Record<unknown>;
}

/**
 * Onboarding request
 */
@doc("Request to generate onboarding URL")
model OnboardingRequest {
  @doc("URL to redirect to if onboarding needs to be refreshed")
  refreshUrl: url;

  @doc("URL to redirect to after successful onboarding")
  returnUrl: url;
}

/**
 * Onboarding response
 */
@doc("Response with onboarding URL")
model OnboardingResponse {
  @doc("URL for merchant onboarding")
  onboardingUrl: string;

  @doc("Additional metadata")
  metadata?: Record<unknown>;
}

/**
 * Refund request
 */
@doc("Request to refund a payment")
model RefundRequest {
  @doc("Amount to refund in cents (partial refund if less than total)")
  @minValue(0)
  amount?: CurrencyAmount;
  
  @doc("Refund reason")
  @maxLength(500)
  reason?: string;
  
  @doc("Additional metadata")
  metadata?: Record<unknown>;
}

/**
 * Refund response
 */
@doc("Response after processing refund")
model RefundResponse {
  @doc("Amount refunded in cents")
  @minValue(0)
  refundedAmount: CurrencyAmount;
  
  @doc("Additional metadata")
  metadata?: Record<unknown>;
}

/**
 * Dashboard response
 */
@doc("Response with Stripe dashboard login link")
model DashboardResponse {
  @doc("Stripe Express dashboard login URL (expires in 5 minutes)")
  dashboardUrl: url;
  
  @doc("When the dashboard link expires")
  expiresAt: utcDateTime;
}

// ============================================================================
// API INTERFACES
// ============================================================================

/**
 * Billing module namespace
 */
@tag("Billing")
namespace BillingModule {
  
  /**
   * Invoice management interface
   */
  interface InvoiceManagement {
    @doc("Create a new invoice")
    @operationId("createInvoice")
    @post
    @route("/invoices")
    @useAuth(bearerAuth)
    createInvoice(
      @body request: CreateInvoiceRequest
    ): ApiCreatedResponse<Invoice>
      | ApiConflictResponse
      | ApiBadRequestResponse
      | ApiUnauthorizedResponse;
    
    @doc("Get invoice by ID")
    @operationId("getInvoice")
    @get
    @route("/invoices/{invoice}")
    @useAuth(bearerAuth)
    getInvoice(
      @path invoice: UUID,
      ...ExpandParams
    ): ApiOkResponse<Invoice>
      | ApiNotFoundResponse
      | ApiUnauthorizedResponse;
    
    @doc("Update invoice (draft only)")
    @operationId("updateInvoice")
    @patch(#{implicitOptionality: true})
    @route("/invoices/{invoice}")
    @useAuth(bearerAuth)
    updateInvoice(
      @path invoice: UUID,
      @body request: UpdateInvoiceRequest
    ): ApiOkResponse<Invoice>
      | ApiNotFoundResponse
      | ApiBadRequestResponse
      | ApiUnauthorizedResponse;
    
    @doc("Delete draft invoice")
    @operationId("deleteInvoice")
    @delete
    @route("/invoices/{invoice}")
    @useAuth(bearerAuth)
    deleteInvoice(
      @path invoice: UUID
    ): ApiNoContentResponse
      | ApiNotFoundResponse
      | ApiBadRequestResponse
      | ApiUnauthorizedResponse;
    
    @doc("List invoices with filtering")
    @operationId("listInvoices")
    @get
    @route("/invoices")
    @useAuth(bearerAuth)
    listInvoices(
      @query customer?: UUID,
      @query merchant?: UUID,
      @query status?: InvoiceStatus,
      @query context?: string,
      ...PaginationQuery
    ): ApiOkResponse<PaginatedResponse<Invoice>>
      | ApiUnauthorizedResponse;
    
    @doc("Finalize invoice (draft to open)")
    @operationId("finalizeInvoice")
    @post
    @route("/invoices/{invoice}/finalize")
    @useAuth(bearerAuth)
    finalizeInvoice(
      @path invoice: UUID
    ): ApiOkResponse<Invoice>
      | ApiNotFoundResponse
      | ApiBadRequestResponse
      | ApiUnauthorizedResponse;
    
    @doc("Void invoice (may capture payment if within void threshold)")
    @operationId("voidInvoice")
    @post
    @route("/invoices/{invoice}/void")
    @useAuth(bearerAuth)
    voidInvoice(
      @path invoice: UUID
    ): ApiOkResponse<Invoice>
      | ApiNotFoundResponse
      | ApiBadRequestResponse
      | ApiUnauthorizedResponse;
    
    @doc("Mark invoice as uncollectible")
    @operationId("markInvoiceUncollectible")
    @post
    @route("/invoices/{invoice}/mark-uncollectible")
    @useAuth(bearerAuth)
    markInvoiceUncollectible(
      @path invoice: UUID
    ): ApiOkResponse<Invoice>
      | ApiNotFoundResponse
      | ApiBadRequestResponse
      | ApiUnauthorizedResponse;
  }
  
  /**
   * Payment processing interface
   */
  interface PaymentProcessing {
    @doc("Initiate payment for invoice")
    @operationId("payInvoice")
    @post
    @route("/invoices/{invoice}/pay")
    @useAuth(bearerAuth)
    payInvoice(
      @path invoice: UUID,
      @body request: PaymentRequest
    ): ApiOkResponse<PaymentResponse>
      | ApiNotFoundResponse
      | ApiBadRequestResponse
      | ApiUnauthorizedResponse;
    
    @doc("Capture payment (for manual capture)")
    @operationId("captureInvoicePayment")
    @post
    @route("/invoices/{invoice}/capture")
    @useAuth(bearerAuth)
    captureInvoicePayment(
      @path invoice: UUID
    ): ApiOkResponse<Invoice>
      | ApiNotFoundResponse
      | ApiBadRequestResponse
      | ApiUnauthorizedResponse;
    
    @doc("Refund payment")
    @operationId("refundInvoicePayment")
    @post
    @route("/invoices/{invoice}/refund")
    @useAuth(bearerAuth)
    refundInvoicePayment(
      @path invoice: UUID,
      @body request: RefundRequest
    ): ApiOkResponse<RefundResponse>
      | ApiNotFoundResponse
      | ApiBadRequestResponse
      | ApiUnauthorizedResponse;
    
    @doc("Handle Stripe webhook events")
    @operationId("handleStripeWebhook")
    @post
    @route("/webhooks/stripe")
    handleStripeWebhook(
      @header("stripe-signature") signature: string,
      @body body: unknown
    ): ApiOkResponse<unknown>
      | ApiBadRequestResponse;
  }
  
  /**
   * Merchant account management interface
   */
  interface MerchantAccountManagement {
    @doc("Create merchant account")
    @operationId("createMerchantAccount")
    @post
    @route("/merchant-accounts")
    @useAuth(bearerAuth)
    createMerchantAccount(
      @body request: CreateMerchantAccountRequest
    ): ApiCreatedResponse<MerchantAccount>
      | ApiConflictResponse
      | ApiBadRequestResponse
      | ApiUnauthorizedResponse;
    
    @doc("Get merchant account by ID")
    @operationId("getMerchantAccount")
    @get
    @route("/merchant-accounts/{merchantAccount}")
    @useAuth(bearerAuth)
    getMerchantAccount(
      @path @doc("Merchant Account ID (UUID) or 'me' for current user's account") merchantAccount: UUID | "me",
      ...ExpandParams
    ): ApiOkResponse<MerchantAccount>
      | ApiNotFoundResponse
      | ApiUnauthorizedResponse;
    
    @doc("Get merchant onboarding URL")
    @operationId("onboardMerchantAccount")
    @post
    @route("/merchant-accounts/{merchantAccount}/onboard")
    @useAuth(bearerAuth)
    onboardMerchantAccount(
      @path merchantAccount: UUID,
      @body request: OnboardingRequest
    ): ApiOkResponse<OnboardingResponse>
      | ApiNotFoundResponse
      | ApiBadRequestResponse
      | ApiUnauthorizedResponse;
    
    @doc("Generate Stripe dashboard login link")
    @operationId("getMerchantDashboard")
    @post
    @route("/merchant-accounts/{merchantAccount}/dashboard")
    @useAuth(bearerAuth)
    getMerchantDashboard(
      @path @doc("Merchant Account ID (UUID) or 'me' for current user's account") merchantAccount: UUID | "me"
    ): ApiOkResponse<DashboardResponse>
      | ApiNotFoundResponse
      | ApiBadRequestResponse
      | ApiForbiddenResponse
      | ApiUnauthorizedResponse;
  }
}
