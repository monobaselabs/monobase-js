# Email System Documentation

## Overview

The Monobase Healthcare Platform implements a sophisticated email system that handles both direct authentication emails and notification-driven healthcare communications. The system uses a template-based approach with queue processing, priority handling, and comprehensive audit trails.

## Architecture

### Core Components

- **EmailService** (`@/core/email`): Direct email service for authentication workflows
- **NotificationService** (`@/core/notifs`): Handles healthcare notifications with email delivery
- **Template System**: Handlebars-based templates with JSON schema validation
- **Email Queue**: Asynchronous processing with retry logic and priority handling
- **Better-Auth Integration**: Seamless authentication email workflows

### Email Delivery Paths

1. **Direct Email Service**: Authentication-specific emails sent directly via EmailService
2. **Notification-Triggered Emails**: Healthcare notifications that include email as a delivery channel
3. **Template-Based Emails**: Runtime-configurable templates for various healthcare scenarios

## Email Template System

### Template Tags

The system uses predefined template tags for consistent email categorization:

#### Authentication Templates
```typescript
AUTH_WELCOME: 'auth.welcome'
AUTH_PASSWORD_RESET: 'auth.password-reset'
AUTH_EMAIL_VERIFY: 'auth.email-verify'
AUTH_2FA: 'auth.2fa'
```

#### Healthcare Workflow Templates
```typescript
// Booking Templates
BOOKING_CONFIRMATION: 'booking.confirmation'
BOOKING_REMINDER: 'booking.reminder'
BOOKING_CANCELLATION: 'booking.cancellation'
BOOKING_RESCHEDULED: 'booking.rescheduled'

// Provider Templates
PROVIDER_NEW_APPOINTMENT: 'provider.new-appointment'
PROVIDER_APPOINTMENT_CANCELLED: 'provider.appointment-cancelled'
PROVIDER_DAILY_SCHEDULE: 'provider.daily-schedule'

// Billing Templates
BILLING_INVOICE: 'billing.invoice'
BILLING_PAYMENT_SUCCESS: 'billing.payment-success'
BILLING_PAYMENT_FAILED: 'billing.payment-failed'
BILLING_PAYMENT_REMINDER: 'billing.payment-reminder'

// Patient Templates
PATIENT_LAB_RESULTS: 'patient.lab-results'
PATIENT_PRESCRIPTION_READY: 'patient.prescription-ready'
PATIENT_MEDICAL_RECORD_UPDATE: 'patient.medical-record-update'
```

### Template Structure

Each email template contains:
- **Subject line** with Handlebars variable support
- **HTML body** with rich formatting and branding
- **Plain text body** for accessibility and compatibility
- **Variable schema** defining required and optional data
- **Sample variables** for testing and previews

## Authentication Email Integrations

### 1. Email Verification (`AUTH_EMAIL_VERIFY`)

**Trigger**: User registration or email change  
**Integration Point**: `auth.ts:107-125`  
**Priority**: High (priority: 1)

**Variables**:
```typescript
{
  userName: string;
  userEmail: string;
  verificationUrl: string;
  verificationToken: string;
}
```

**Implementation**:
```typescript
await emailService.queueEmail({
  templateTag: EmailTemplateTags.AUTH_EMAIL_VERIFY,
  recipient: user.email,
  variables: {
    userName: user.name || 'User',
    userEmail: user.email,
    verificationUrl: url,
    verificationToken: token
  },
  priority: 1
});
```

### 2. Password Reset (`AUTH_PASSWORD_RESET`)

**Trigger**: User requests password reset  
**Integration Point**: `auth.ts:140-158`  
**Priority**: High (priority: 1)

**Variables**:
```typescript
{
  userName: string;
  userEmail: string;
  resetUrl: string;
  resetToken: string;
}
```

**Implementation**:
```typescript
await emailService.queueEmail({
  templateTag: EmailTemplateTags.AUTH_PASSWORD_RESET,
  recipient: user.email,
  variables: {
    userName: user.name || 'User',
    userEmail: user.email,
    resetUrl: url,
    resetToken: token
  },
  priority: 1
});
```

### 3. Two-Factor Authentication (`AUTH_2FA`)

**Trigger**: 2FA verification required  
**Integration Point**: `auth.ts:212-229`  
**Priority**: High (priority: 1)

**Variables**:
```typescript
{
  userEmail: string;
  otpCode: string;
  otpType: string;
}
```

**Implementation**:
```typescript
await emailService.queueEmail({
  templateTag: EmailTemplateTags.AUTH_2FA,
  recipient: email,
  variables: {
    userEmail: email,
    otpCode: otp,
    otpType: type
  },
  priority: 1
});
```

### 4. Email Change Verification (`AUTH_EMAIL_VERIFY`)

**Trigger**: User changes email address  
**Integration Point**: `auth.ts:246-265`  
**Priority**: High (priority: 1)

**Variables**:
```typescript
{
  userName: string;
  currentEmail: string;
  newEmail: string;
  verificationUrl: string;
  verificationToken: string;
}
```

**Implementation**:
```typescript
await emailService.queueEmail({
  templateTag: EmailTemplateTags.AUTH_EMAIL_VERIFY,
  recipient: newEmail,
  variables: {
    userName: user.name || 'User',
    currentEmail: user.email,
    newEmail: newEmail,
    verificationUrl: url,
    verificationToken: token
  },
  priority: 1
});
```

## Notification-Triggered Emails

Healthcare notifications that include email as a delivery channel automatically generate emails through the notification system. These emails are processed through the NotificationService rather than direct EmailService calls.

### Email-Enabled Notifications

#### High Priority (in-app, email, SMS)
- `appointment_confirmed`: Appointment confirmed by provider
- `appointment_cancelled_by_other`: Appointment cancelled by other party
- `appointment_rejected`: Appointment rejected by provider
- `appointment_auto_rejected`: Auto-rejected due to timeout
- `payment_failed`: Payment processing failed
- `charge_failed`: Payment charge failed

#### Normal Priority (in-app, email)
- `payment_authorized`: Payment authorized and held
- `payment_captured`: Payment successfully processed
- `payment_received`: Provider payment notification
- `appointment_expired`: Provider missed confirmation deadline

### Notification-to-Email Flow

1. **Notification Creation**: Service creates notification with email channel
2. **Email Generation**: NotificationService generates email from notification data
3. **Template Mapping**: Notification type maps to appropriate email template
4. **Queue Processing**: Email queued with appropriate priority
5. **Delivery**: Email sent via configured provider (SMTP/Postmark)

## Email Queue System

### Queue Processing

The email queue system provides:
- **Asynchronous processing**: Non-blocking email delivery
- **Priority handling**: High-priority emails processed first
- **Retry logic**: Failed emails automatically retried
- **Error tracking**: Comprehensive failure logging
- **Delivery confirmation**: Provider message ID tracking

### Queue Item Structure

```typescript
interface EmailQueueItem {
  id: string;
  templateTag: string;
  recipientEmail: string;
  recipientName?: string;
  variables: Record<string, any>;
  metadata?: Record<string, any>;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';
  priority: number; // 1-10, lower is higher priority
  scheduledAt?: Date;
  attempts: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  lastError?: string;
  sentAt?: Date;
  provider?: 'smtp' | 'postmark';
  providerMessageId?: string;
  templateSnapshot?: {
    subject: string;
    bodyHtml: string;
    bodyText?: string;
    fromName?: string;
    fromEmail?: string;
    replyTo?: string;
  };
}
```

### Priority Levels

- **Priority 1**: Authentication emails (verification, password reset, 2FA)
- **Priority 2**: Critical notifications (payment failures, appointment rejections)
- **Priority 3**: Important notifications (appointment confirmations, cancellations)
- **Priority 5**: Standard notifications (payment confirmations, provider updates)
- **Priority 8**: Low-priority notifications (reminders, daily summaries)

## Email Providers

### SMTP Provider
- **Configuration**: Standard SMTP settings
- **Use Case**: Development and basic deployment (Mailpit for local testing)
- **Features**: Basic sending, delivery confirmation

### Postmark Provider
- **Configuration**: API token-based
- **Use Case**: Production healthcare environment
- **Features**: Advanced analytics, delivery tracking, bounce handling

### OneSignal Provider
- **Configuration**: App ID and API key-based
- **Use Case**: Unified multi-channel messaging platform (email + push + SMS)
- **Features**: 
  - Transactional email support with `include_unsubscribed` flag
  - Unified dashboard for all messaging channels
  - Advanced segmentation and personalization
  - Multi-channel campaigns from single platform
  - Real-time delivery analytics
- **Benefits**:
  - Single platform for email, push notifications, and SMS
  - Reduced complexity when using multiple channels
  - Consistent analytics and reporting
  - Easier migration path to multi-channel communications

## Implementation Patterns

### 1. Better-Auth Integration

Authentication emails are integrated directly into Better-Auth configuration:

```typescript
// In createAuth function
emailVerification: {
  sendVerificationEmail: async ({ user, token, url }) => {
    try {
      await emailService.queueEmail({
        templateTag: EmailTemplateTags.AUTH_EMAIL_VERIFY,
        recipient: user.email,
        variables: { /* variables */ },
        priority: 1
      });
      logger?.info({ userId: user.id, email: user.email }, 'Email verification sent');
    } catch (error) {
      logger?.error({ error }, 'Failed to send email verification');
      // Non-blocking - continue auth flow
    }
  }
}
```

### 2. Non-Blocking Error Handling

All email integrations use non-blocking error handling:

```typescript
try {
  await emailService.queueEmail({
    // email configuration
  });
  logger?.info({ /* context */ }, 'Email queued successfully');
} catch (error) {
  logger?.error({ error }, 'Failed to queue email');
  // Continue main workflow - email failure doesn't interrupt core functionality
}
```

### 3. Template Variable Validation

Email templates include JSON schema validation:

```typescript
// Template variable schema example
{
  "type": "object",
  "properties": {
    "userName": { "type": "string" },
    "verificationUrl": { "type": "string", "format": "uri" },
    "expirationTime": { "type": "string" }
  },
  "required": ["userName", "verificationUrl"]
}
```

## Service Configuration

### EmailService Configuration

```typescript
interface EmailConfig {
  provider: 'smtp' | 'postmark' | 'onesignal';
  from: {
    name: string;
    email: string;
  };
  replyTo?: string;
  templates: {
    baseUrl: string; // For template assets
    brandName: string;
    supportEmail: string;
  };
}
```

### SMTP Configuration

```typescript
interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}
```

### Postmark Configuration

```typescript
interface PostmarkConfig {
  apiToken: string;
  messageStream?: string;
  trackOpens?: boolean;
  trackLinks?: boolean;
}
```

### OneSignal Configuration

```typescript
interface OneSignalConfig {
  appId: string;        // OneSignal App ID (email-specific app)
  apiKey: string;       // OneSignal REST API Key
}
```

**Environment Variables**:
```bash
EMAIL_PROVIDER=onesignal
ONESIGNAL_APP_ID=your-app-id
ONESIGNAL_API_KEY=your-rest-api-key
```

**Important Notes**:
- Use a separate OneSignal app for emails vs push notifications
- Transactional emails automatically set `include_unsubscribed: true`
- Supports HTML email body and custom from addresses
- Message ID returned for tracking and analytics

## Database Schema

### Email Templates Table

```typescript
interface EmailTemplate {
  id: string;
  tag: string; // Unique identifier
  name: string;
  description?: string;
  subject: string; // Handlebars template
  bodyHtml: string; // Handlebars template
  bodyText?: string; // Handlebars template
  variableSchema: Record<string, any>; // JSON schema
  sampleVariables?: Record<string, any>;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  status: 'draft' | 'active' | 'archived';
  version: number;
  isSystem: boolean; // Cannot be deleted
}
```

### Email Queue Table

```typescript
interface EmailQueue {
  id: string;
  templateTag: string;
  recipientEmail: string;
  recipientName?: string;
  variables: Record<string, any>;
  metadata?: Record<string, any>;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';
  priority: number;
  scheduledAt?: Date;
  attempts: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  lastError?: string;
  sentAt?: Date;
  provider?: 'smtp' | 'postmark';
  providerMessageId?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
  cancellationReason?: string;
  templateSnapshot?: {
    subject: string;
    bodyHtml: string;
    bodyText?: string;
    fromName?: string;
    fromEmail?: string;
    replyTo?: string;
  };
}
```

## Background Job Processing

### Email Queue Processor

The email system includes background jobs for processing queued emails:

```typescript
// Email queue processing job
jobs.registerInterval('process-email-queue', 30000, async (context) => {
  await emailService.processQueue();
});

// Failed email retry job
jobs.registerInterval('retry-failed-emails', 300000, async (context) => {
  await emailService.retryFailedEmails();
});

// Email cleanup job
jobs.registerCron('cleanup-old-emails', '0 2 * * *', async (context) => {
  await emailService.cleanupOldEmails();
});
```

## Monitoring and Analytics

### Email Metrics

Track email system performance:
- Queue depth and processing time
- Delivery success rates by template
- Provider performance metrics
- Error rates and failure reasons
- Template usage statistics

### Audit Trail

Comprehensive logging for healthcare compliance:
- Email queue events
- Template usage and modifications
- Delivery confirmations and failures
- User email preference changes
- Authentication email activities

## Testing and Development

### Template Testing

The email system provides template testing capabilities:

```typescript
// Preview template with sample data
const preview = await emailService.previewTemplate('auth.welcome', sampleData);

// Send test email
const result = await emailService.sendTestEmail('auth.welcome', sampleData, 'test@example.com');
```

### Local Development with Mailpit

**Mailpit** is the recommended email testing tool for development. It captures all outgoing emails locally without sending them to real recipients.

#### Setup with Docker Compose

Mailpit is included in the development dependencies:

```bash
# Start all development dependencies including Mailpit
bun run dev:deps:up

# Mailpit is now running:
# - SMTP server: localhost:1025
# - Web UI: http://localhost:8025
```

#### Configuration

The API is pre-configured to use Mailpit by default:

```typescript
// config.ts defaults (no environment variables needed)
smtp: {
  host: 'localhost',
  port: 1025,
  secure: false,
  auth: {
    user: '',
    pass: ''
  }
}
```

#### Using Mailpit

1. **Start dependencies**: `bun run dev:deps:up`
2. **Run the API**: `bun run dev`
3. **Trigger emails**: Register a user, reset password, etc.
4. **View emails**: Open http://localhost:8025 in your browser

#### Features

- **Web UI**: View all captured emails with HTML/text rendering
- **Search**: Search emails by recipient, subject, or content
- **API**: Programmatic access to captured emails for E2E tests
- **No Configuration**: Works out of the box with zero setup
- **Fast**: Instant email capture with no external dependencies

#### Testing with Mailpit API

Mailpit provides an API for automated testing:

```typescript
// Fetch all emails
const response = await fetch('http://localhost:8025/api/v1/messages');
const emails = await response.json();

// Search for specific email
const verificationEmails = emails.messages.filter(
  msg => msg.Subject.includes('Verify your email')
);

// Get email content
const emailResponse = await fetch(`http://localhost:8025/api/v1/message/${emailId}`);
const email = await emailResponse.json();
```

### Other Development Options

For development environments without Docker:
- Use SMTP provider with local mail server (e.g., MailHog, smtp4dev)
- Enable template preview mode
- Log all emails to console instead of sending
- Use sample data for template testing

## Security Considerations

### Email Security

- **Template injection protection**: Handlebars escaping enabled
- **Variable validation**: JSON schema prevents malicious data
- **Rate limiting**: Prevent email spam and abuse
- **Authentication**: Secure provider API keys and SMTP credentials
- **Audit logging**: Track all email activities for compliance

### Healthcare Compliance

- **HIPAA compliance**: No PHI in email content
- **Consent management**: Respect user email preferences
- **Data retention**: Configurable email data retention policies
- **Encryption**: TLS encryption for all email communication

## Troubleshooting

### Common Issues

1. **Authentication Emails Not Sending**
   - Verify EmailService is injected into Better-Auth configuration
   - Check email provider configuration and credentials
   - Review authentication email template tags

2. **Queue Processing Stalled**
   - Check background job processor is running
   - Verify database connectivity for queue table
   - Review email provider rate limits

3. **Template Rendering Errors**
   - Validate template variables against schema
   - Check Handlebars template syntax
   - Verify sample data matches variable requirements

4. **High Email Bounce Rates**
   - Review recipient email validation
   - Check provider reputation and configuration
   - Verify email template content and formatting

### Debugging

Enable detailed email logging:

```typescript
logger.debug({
  templateTag,
  recipientEmail,
  variables,
  priority,
  queueId
}, 'Queuing email for processing');
```

### Email Queue Monitoring

Monitor queue health:

```bash
# Check queue depth
SELECT status, COUNT(*) FROM email_queue GROUP BY status;

# Review failed emails
SELECT * FROM email_queue WHERE status = 'failed' ORDER BY last_attempt_at DESC LIMIT 10;

# Monitor processing performance
SELECT 
  template_tag,
  AVG(EXTRACT(EPOCH FROM (sent_at - created_at))) as avg_processing_time
FROM email_queue 
WHERE status = 'sent' 
GROUP BY template_tag;
```

## Future Enhancements

Planned email system improvements:

1. **Advanced Templates**: Rich template editor with WYSIWYG capabilities
2. **Personalization Engine**: AI-driven content personalization
3. **A/B Testing**: Template variant testing and optimization
4. **Advanced Analytics**: Open rates, click tracking, engagement metrics
5. **Multi-language Support**: Internationalization for global deployment
6. **Email Automation**: Workflow-based email sequences
7. **Integration APIs**: Third-party email service integrations
