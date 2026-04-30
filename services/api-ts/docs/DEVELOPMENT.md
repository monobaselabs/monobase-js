# API Development Standards

This document outlines the API development standards and best practices for the Monobase Healthcare Platform. These standards ensure consistency, maintainability, and developer experience across all API modules.

## Table of Contents

1. [Overview](#overview)
2. [Field Naming Conventions](#field-naming-conventions)
3. [Response Patterns](#response-patterns)
4. [Request Body Standards](#request-body-standards)
5. [Entity Reference Patterns](#entity-reference-patterns)
6. [TypeSpec Best Practices](#typespec-best-practices)
7. [Security Pattern Standards](#security-pattern-standards)
8. [Error Handling Standards](#error-handling-standards)
9. [Module Organization](#module-organization)
10. [Examples and Templates](#examples-and-templates)

## Overview

The Monobase API follows an **API-first design approach** using TypeSpec for specification definition. All APIs are defined in TypeSpec files (`specs/api/src/modules/`) and generate both OpenAPI specifications and TypeScript types.

### Core Design Principles

- **Consistency**: Uniform naming, structure, and behavior across all endpoints
- **Type Safety**: Comprehensive TypeScript type generation from TypeSpec definitions
- **Healthcare Compliance**: HIPAA-compliant patterns with audit trails and consent management
- **Developer Experience**: Clear documentation, predictable patterns, and comprehensive error responses
- **API-First**: Define APIs before implementation using TypeSpec specifications

## Field Naming Conventions

### Primary Rules

**✅ Use camelCase for all properties**
```typescript
// ✅ Correct
{
  "firstName": "John",
  "lastName": "Doe",
  "startTime": "09:00",
  "endTime": "17:00"
}

// ❌ Incorrect
{
  "first_name": "John",
  "last_name": "Doe", 
  "start_time": "09:00",
  "end_time": "17:00"
}
```

**✅ Avoid entityId suffix pattern**
```typescript
// ✅ Correct - Use direct entity reference
{
  "person": "123e4567-e89b-12d3-a456-426614174000",
  "provider": "456e7890-e89b-12d3-a456-426614174001"
}

// ❌ Incorrect - Don't use Id suffix
{
  "personId": "123e4567-e89b-12d3-a456-426614174000",
  "providerId": "456e7890-e89b-12d3-a456-426614174001"
}
```

### Expandable Entity References

Support both UUID references and expanded objects:

```typescript
// TypeSpec Definition
@doc("Patient profile with medical and administrative information")
model Patient extends BaseEntity {
  @doc("Reference to person record ID or expanded person object")
  person: UUID | Person;
  
  @doc("Primary care provider information")
  primaryProvider?: ProviderInfo;
}
```

### Date and Time Fields

```typescript
// ✅ Correct naming patterns
{
  "createdAt": "2023-12-01T10:00:00Z",        // Timestamps use 'At' suffix
  "updatedAt": "2023-12-01T15:30:00Z",
  "startTime": "09:00",                        // Time values use 'Time'
  "endTime": "17:00",
  "invoiceDate": "2023-12-01",                // Dates use 'Date' suffix
  "dueDate": "2023-12-15"
}
```

### Boolean Fields

```typescript
// ✅ Use descriptive boolean names
{
  "isActive": true,
  "hasNextPage": false,
  "isRecurring": true,
  "coverageActive": true
}

// ❌ Avoid ambiguous boolean names
{
  "active": true,     // Ambiguous
  "recurring": true,  // Not clearly boolean
  "coverage": true    // Unclear meaning
}
```

## Response Patterns

### List Endpoints - PaginatedResponse<T>

**All list endpoints MUST use `PaginatedResponse<T>`** where T matches the individual get endpoint response:

```typescript
// TypeSpec Interface Definition
@doc("List patients. Requires 'admin' or 'support' role.")
@operationId("listPatients")
@get
listPatients(
  @query q?: string,
  @query expand?: string[],
  ...PaginationParams
): {
  @statusCode statusCode: 200;
  @body body: PaginatedResponse<Patient>;  // ✅ Use PaginatedResponse<T>
} | AuthenticationError | AuthorizationError;
```

**Consistency Rule**: The `T` in `PaginatedResponse<T>` must be identical to the response type of the corresponding `get` endpoint.

### Individual Endpoints - Direct Entity Types

Individual resource endpoints return the entity directly:

```typescript
@doc("Get patient profile.")
@operationId("getPatient")
@get
@route("/{patient}")
getPatient(
  @path patient: UUID,
  @query expand?: string[]
): {
  @statusCode statusCode: 200;
  @body body: Patient;  // ✅ Direct entity type
} | NotFoundError | AuthorizationError;
```

### Response Structure Examples

```typescript
// List Response
{
  "data": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "firstName": "John",
      "lastName": "Doe"
    }
  ],
  "pagination": {
    "offset": 0,
    "limit": 20,
    "count": 1,
    "totalCount": 1,
    "totalPages": 1,
    "currentPage": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}

// Individual Response  
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "firstName": "John",
  "lastName": "Doe",
  "createdAt": "2023-12-01T10:00:00Z",
  "updatedAt": "2023-12-01T10:00:00Z"
}
```

## Request Body Standards

### Required vs Optional Request Bodies

**Required request body**: When fields inside are required
```typescript
@doc("Create new patient. Requires 'user' role.")
@operationId("createPatient")
@post
createPatient(
  @body patient: PatientCreateRequest  // ✅ Required - has required fields
): CreatedResponse | ValidationError;

// Supporting model with required fields
@doc("Patient creation request")
model PatientCreateRequest {
  @doc("Person demographic information")
  person?: PersonCreateRequest;  // Optional field
  
  @doc("Primary care provider information") 
  primaryProvider?: ProviderInfo; // Optional field
}
```

**Optional request body**: When all fields are optional
```typescript
@doc("Update patient profile.")
@operationId("updatePatient")  
@patch
updatePatient(
  @path patient: UUID,
  @body updates?: PatientUpdateRequest  // ✅ Optional - all fields optional
): Patient | NotFoundError | ValidationError;

// All fields optional in update requests
@doc("Patient profile update request")
model PatientUpdateRequest {
  @doc("Primary care provider information")
  primaryProvider?: ProviderInfo | null;
  
  @doc("Primary pharmacy information")
  primaryPharmacy?: PharmacyInfo | null;
}
```

### Action Endpoints - Reason Field Requirement

**Action endpoints require reason field for audit trails**:

```typescript
@doc("Appointment action request")
model AppointmentActionRequest {
  @doc("Action reason")  
  @maxLength(500)
  reason?: string;  // Required for audit compliance
}

// Usage in action endpoints
@doc("Cancel appointment. Mutual cancellation rights.")
@operationId("cancelAppointment")
@post
@route("/appointments/{appointment}/cancel")
cancelAppointment(
  @path appointment: UUID,
  @body request: AppointmentActionRequest  // ✅ Includes reason for auditing
): AppointmentResponse | NotFoundError;
```

## Entity Reference Patterns

### BaseEntity Extension

All domain entities should extend `BaseEntity` for consistent audit fields:

```typescript
@doc("Healthcare provider profile")
model Provider extends BaseEntity {  // ✅ Extends BaseEntity
  @doc("Reference to person record")
  person: UUID | Person;
  
  @doc("Provider type")
  providerType: ProviderType;
  
  @doc("Years of experience")
  yearsOfExperience?: int32;
}
```

### Entity Reference Types

Support both UUID and expanded object references:

```typescript
// ✅ Flexible reference pattern
model Patient extends BaseEntity {
  @doc("Reference to person record ID or expanded person object")
  person: UUID | Person;  // Allows both reference and expansion
}

// Usage in API responses
{
  "id": "patient-uuid",
  "person": "person-uuid"  // When not expanded
}

// OR when expanded
{
  "id": "patient-uuid", 
  "person": {              // When expanded
    "id": "person-uuid",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

### Common Model Reuse

Define reusable models outside namespaces:

```typescript
// ✅ Exported without namespace for reuse
@doc("Provider information for patient reference")
model ProviderInfo {
  @doc("Provider name")
  @minLength(1)
  @maxLength(100)
  name: string;
  
  @doc("Provider specialty")
  @maxLength(100) 
  specialty?: string;
  
  @doc("Provider contact phone")
  phone?: PhoneNumber;
}

// Reused in multiple models
model Patient extends BaseEntity {
  primaryProvider?: ProviderInfo;  // ✅ Reused model
}
```

## TypeSpec Best Practices

### Model Organization

**Export models outside namespaces** for maximum reusability:

```typescript
// ✅ Correct - Models defined outside namespace
@doc("Patient profile with medical information") 
model Patient extends BaseEntity {
  person: UUID | Person;
  primaryProvider?: ProviderInfo;
}

// ✅ Namespace only for interfaces/endpoints
@route("/patients")
@tag("Patient")
namespace PatientModule {
  interface PatientManagement {
    // Operations here
  }
}
```

### Decorator Usage Patterns

```typescript
// ✅ Comprehensive decoration
@doc("Create new patient. Requires 'user' role.")      // Clear description
@operationId("createPatient")                          // Unique operation ID
@post                                                  // HTTP method
@useAuth(bearerAuth)                                   // Authentication
@extension("x-security-required-roles", ["user"])     // Role requirements
createPatient(
  @body patient: PatientCreateRequest
): CreatedResponse | ValidationError;
```

### Path Parameter Patterns

```typescript
// ✅ Support both UUID and special values
@doc("Get patient profile. Use 'me' for current user's profile.")
@operationId("getPatient")
@get
@route("/{patient}")
getPatient(
  @path @doc("Patient ID (UUID) or 'me' for current user's profile") 
  patient: UUID | "me",  // ✅ Flexible path parameter
  @query expand?: string[]
): Patient | NotFoundError;
```

### Query Parameter Standards

```typescript
// ✅ Standard query patterns
listPatients(
  @query q?: string,              // Search query
  @query expand?: string[],       // Entity expansion
  @query status?: PatientStatus,  // Enum filtering
  @query startDate?: plainDate,   // Date range filtering
  @query endDate?: plainDate,
  ...PaginationParams             // Standard pagination
): PaginatedResponse<Patient>;
```

## Security Pattern Standards

### Authentication and Authorization

**All protected endpoints must specify authentication and roles**:

```typescript
// ✅ Complete security specification
@useAuth(bearerAuth)                                           // Authentication method
@extension("x-security-required-roles", ["admin", "support"])  // Role requirements
```

### Role Syntax Patterns

```typescript
// Single role requirement
@extension("x-security-required-roles", ["admin"])

// Owner permission requirement  
@extension("x-security-required-roles", ["patient:owner"])

// Multiple role options (OR condition)
@extension("x-security-required-roles", ["admin", "provider:owner"])

// Complex permission (role AND permission)
@extension("x-security-required-roles", ["patient:owner", "provider:owner", "admin"])
```

### Public Endpoints

Public endpoints should be clearly marked:

```typescript
// ✅ Public endpoint - no authentication decorators
@doc("Search providers. Public endpoint - no authentication required.")
@operationId("searchProviders") 
@get
searchProviders(
  @query specialty?: string,
  ...PaginationQuery
): ProviderSearchResponse;
```

## Error Handling Standards

### Standard Error Response Pattern

All operations must include comprehensive error responses:

```typescript
// ✅ Complete error response specification
createPatient(
  @body patient: PatientCreateRequest
): {
  @statusCode statusCode: 201;
  @body body: Patient;
} | {
  @statusCode statusCode: 400;
  @body body: ValidationError;
} | {
  @statusCode statusCode: 401;
  @body body: AuthenticationError;  
} | {
  @statusCode statusCode: 403;
  @body body: AuthorizationError;
} | {
  @statusCode statusCode: 409;
  @body body: ConflictError;
};
```

### Shorthand Error Responses

For common combinations, use imported error types:

```typescript
// ✅ Shorthand for common errors
createProvider(
  @body provider: ProviderCreateRequest
): CreatedResponse | ValidationError | AuthenticationError | AuthorizationError | ConflictError;
```

## Module Organization

### File Structure Standards

```
specs/api/src/
├── main.tsp                    # Main API definition
├── common/                     # Shared definitions
│   ├── models.tsp             # Base types and common models
│   ├── errors.tsp             # Error response types
│   ├── pagination.tsp         # Pagination patterns
│   └── security.tsp           # Authentication definitions
└── modules/                    # Domain modules
    ├── person.tsp             # Person management
    ├── patient.tsp            # Patient-specific features
    ├── provider.tsp           # Provider management
    ├── booking.tsp            # Appointment scheduling
    └── billing.tsp            # Payment and invoicing
```

### Module Definition Pattern

```typescript
// ✅ Standard module structure

// 1. Imports
import "@typespec/http";
import "@typespec/rest"; 
import "@typespec/openapi";
import "../common/models.tsp";
import "../common/errors.tsp";
import "../common/pagination.tsp";
import "../common/security.tsp";

using TypeSpec.Http;
using TypeSpec.Rest;
using TypeSpec.OpenAPI;

// 2. Models (exported without namespace)
@doc("Entity description")
model Entity extends BaseEntity {
  // Properties
}

@doc("Request model") 
model EntityCreateRequest {
  // Properties
}

// 3. Namespace with interfaces
@route("/entities")
@tag("Entity")
namespace EntityModule {
  interface EntityManagement {
    // Operations
  }
}
```

## Examples and Templates

### Complete CRUD Interface Template

```typescript
namespace ExampleModule {
  interface ExampleManagement {
    @doc("List examples with pagination")
    @operationId("listExamples")
    @get
    @useAuth(bearerAuth)
    @extension("x-security-required-roles", ["admin", "support"])
    listExamples(
      @query q?: string,
      @query expand?: string[],
      ...PaginationParams
    ): PaginatedResponse<Example> | AuthenticationError | AuthorizationError;

    @doc("Create new example")
    @operationId("createExample")
    @post  
    @useAuth(bearerAuth)
    @extension("x-security-required-roles", ["user"])
    createExample(
      @body example: ExampleCreateRequest
    ): {
      @statusCode statusCode: 201;
      @body body: Example;
    } | ValidationError | AuthenticationError | ConflictError;

    @doc("Get example by ID")
    @operationId("getExample")
    @get
    @route("/{example}")
    @useAuth(bearerAuth) 
    @extension("x-security-required-roles", ["admin", "user:owner"])
    getExample(
      @path example: UUID,
      @query expand?: string[]
    ): Example | NotFoundError | AuthorizationError;

    @doc("Update example")
    @operationId("updateExample")
    @patch
    @route("/{example}")
    @useAuth(bearerAuth)
    @extension("x-security-required-roles", ["admin", "user:owner"]) 
    updateExample(
      @path example: UUID,
      @body updates: ExampleUpdateRequest
    ): Example | NotFoundError | ValidationError | AuthorizationError;

    @doc("Delete example")
    @operationId("deleteExample")
    @delete
    @route("/{example}")
    @useAuth(bearerAuth)
    @extension("x-security-required-roles", ["admin", "user:owner"])
    deleteExample(
      @path example: UUID
    ): {
      @statusCode statusCode: 204;
    } | NotFoundError | AuthorizationError;
  }
}
```

### Action Endpoint Template

```typescript
@doc("Perform example action")
@operationId("performExampleAction")
@post
@route("/{example}/action")
@useAuth(bearerAuth)
@extension("x-security-required-roles", ["admin", "user:owner"])
performAction(
  @path example: UUID,
  @body request: ExampleActionRequest  // Must include reason field
): Example | NotFoundError | AuthorizationError | ValidationError;
```

### Expandable Reference Template

```typescript
// Model definition
@doc("Example entity with expandable references")
model Example extends BaseEntity {
  @doc("Reference to user ID or expanded user object")
  user: UUID | User;
  
  @doc("Reference to category ID or expanded category object") 
  category: UUID | Category;
}

// API usage
@query expand?: string[]  // ?expand=user,category
```

---

## Development Workflow

### 1. API-First Development Process

1. **Define API in TypeSpec** (`specs/api/src/modules/`)
2. **Generate OpenAPI + TypeScript** (`cd specs/api && bun run build`)
3. **Generate Assets** (`cd services/api-ts && bun run generate`)
4. **Implement Hono handlers** (`services/api-ts/src/handlers/`)
5. **Use generated types** (import from `@monobase/api-spec`)

### 2. Required Commands

```bash
# After API changes
cd specs/api && bun run build

# Development
cd services/api-ts && bun run generate && bun dev
cd apps/patient && bun dev
```

### 3. Type Safety Verification

- Import generated types from `@monobase/api-spec`
- Use TypeScript strict mode for validation
- Verify request/response type compatibility

---

This document serves as the definitive reference for API development standards in the Monobase Healthcare Platform. All new APIs and modifications to existing APIs must follow these patterns to ensure consistency and maintainability.
