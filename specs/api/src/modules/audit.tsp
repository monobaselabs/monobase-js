import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "../common/models.tsp";
import "../common/errors.tsp";
import "../common/pagination.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

/**
 * Audit event type enumeration - exported without namespace
 */
@doc("Type of audited event")
enum AuditEventType {
  @doc("User authentication")
  authentication: "authentication",
  
  @doc("Data access")
  dataAccess: "data-access",
  
  @doc("Data modification")
  dataModification: "data-modification",
  
  @doc("System configuration")
  systemConfig: "system-config",
  
  @doc("Security event")
  security: "security",
  
  @doc("Compliance event")
  compliance: "compliance",
}

/**
 * Audit category enumeration - exported without namespace
 */
@doc("Audit event category for compliance")
enum AuditCategory {
  @doc("Regulatory compliance event")
  regulatory: "regulatory",
  
  @doc("Security-related event")
  security: "security",
  
  @doc("Privacy-related event")
  privacy: "privacy",
  
  @doc("Administrative event")
  administrative: "administrative",
  
  @doc("Domain event")
  domain: "domain",
  
  @doc("Financial event")
  financial: "financial",
}

/**
 * Audit action enumeration - exported without namespace
 */
@doc("Action performed in audited event")
enum AuditAction {
  @doc("Create operation")
  create: "create",
  
  @doc("Read operation")
  read: "read",
  
  @doc("Update operation")
  update: "update",
  
  @doc("Delete operation")
  delete: "delete",
  
  @doc("Login operation")
  login: "login",
  
  @doc("Logout operation")
  logout: "logout",
}

/**
 * Audit outcome enumeration - exported without namespace
 */
@doc("Outcome of audited event")
enum AuditOutcome {
  @doc("Operation succeeded")
  success: "success",
  
  @doc("Operation failed")
  failure: "failure",
  
  @doc("Operation partially succeeded")
  partial: "partial",
  
  @doc("Operation was denied")
  denied: "denied",
}

/**
 * Audit retention status enumeration - exported without namespace
 */
@doc("Audit log retention lifecycle status")
enum AuditRetentionStatus {
  @doc("Active log available for immediate queries")
  active: "active",
  
  @doc("Archived to long-term storage")
  archived: "archived",
  
  @doc("Scheduled for secure purging")
  pending_purge: "pending-purge",
}

/**
 * Audit log entry model - exported without namespace
 */
@doc("System audit log entry")
model AuditLogEntry extends BaseEntity {
  @doc("Event type")
  eventType: AuditEventType;

  @doc("Event category")
  category: AuditCategory;

  @doc("User who performed the action")
  user?: UUID;

  @doc("User type")
  userType?: "client" | "host" | "admin" | "system";

  @doc("Affected resource type")
  resourceType: string;

  @doc("Affected resource ID")
  resource: string;

  @doc("Action performed")
  action: AuditAction;

  @doc("Event outcome")
  outcome: AuditOutcome;

  @doc("Event description")
  description: string;

  @doc("Event details")
  details?: Record<unknown>;

  @doc("IP address")
  ipAddress?: string;

  @doc("User agent")
  userAgent?: string;

  @doc("Session identifier")
  session?: string;

  @doc("Request identifier")
  request?: string;

  @doc("Integrity hash for tamper detection")
  integrityHash?: string;

  @doc("Retention lifecycle status")
  retentionStatus: AuditRetentionStatus;

  @doc("Date when log was archived")
  archivedAt?: utcDateTime;

  @doc("Person who archived the log")
  archivedBy?: UUID;

  @doc("Scheduled purge date based on retention policy")
  purgeAfter?: utcDateTime;
}

// Namespace only for the interface/endpoints
@route("/audit")
@tag("Audit")
namespace AuditModule {

  /**
   * Audit management interface
   */
  interface AuditManagement {
     @doc("List audit logs with filtering and pagination.")
     @operationId("listAuditLogs")
     @get
     @useAuth(bearerAuth)
     @extension("x-security-required-roles", #["admin", "support"])
     @route("/logs")
     listAuditLogs(
        @doc("Filter by resource type (e.g., 'booking', 'person', 'invoice')")
        @query resourceType?: SafeQueryString,
        @doc("Filter by specific resource UUID")
        @query resource?: UUID,
        @doc("Filter by user UUID who performed the action")
        @query user?: UUID,
        @doc("Filter by action type (create, read, update, delete, login, logout)")
        @query action?: AuditAction,
        @doc("Start date for filtering audit logs (inclusive)")
        @query startDate?: StrictUtcDateTime,
        @doc("End date for filtering audit logs (inclusive)")
        @query endDate?: StrictUtcDateTime,
        @doc("Order by field (e.g., 'desc(created_at)', 'asc(created_at)')")
        @query orderBy?: SafeQueryString,
        ...PaginationQuery
     ): ApiOkResponse<PaginatedResponse<AuditLogEntry>> | ApiUnauthorizedResponse | ApiForbiddenResponse;


  }
}
