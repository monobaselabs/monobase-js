# TypeSpec API Specification Development Guide

This guide covers TypeSpec-specific development patterns for the Monobase API specification. **For shared backend patterns**, see [Root CONTRIBUTING.md](../../CONTRIBUTING.md).

> ⚠️ **IMPORTANT FOR AI AGENTS AND DEVELOPERS**
> This is a **Bun monorepo**. Always use `bun` commands, **never** `npm` commands.
> All package scripts must be run with `bun run {script}`, not `npm run {script}`.

## Table of Contents

1. [TypeSpec Overview](#typespec-overview)
2. [Module Definition Workflow](#module-definition-workflow)
3. [Schema Design Patterns](#schema-design-patterns)
4. [API Endpoint Patterns](#api-endpoint-patterns)
5. [Validation and Constraints](#validation-and-constraints)
6. [Documentation Standards](#documentation-standards)
7. [Quick Reference](#quick-reference)

---

## TypeSpec Overview

**What is TypeSpec?**
Microsoft TypeSpec is a language for defining APIs and generating OpenAPI specifications + TypeScript types. It ensures frontend and backend share exact type definitions.

**Key Benefits:**
- Single source of truth for API contracts
- Automatic OpenAPI 3.0 generation
- TypeScript type generation for frontend/backend
- Compile-time API validation
- Better documentation

**For complete API-First workflow**, see [Root CONTRIBUTING.md > API-First Development](../../CONTRIBUTING.md#api-first-development).

---

## Module Definition Workflow

### 1. Create Module File

Modules are defined in `src/modules/{domain}.tsp`:

```typescript
// src/modules/person.tsp
import "@typespec/http";
import "@typespec/openapi3";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

@service({
  title: "Person Management API"
})
@tag("Person")
namespace PersonModule {
  // Operations and models defined here
}
```

### 2. Define Models

**Base Model Pattern:**
```typescript
@doc("Person record representing a user in the system")
model Person extends BaseEntity {
  @doc("First name")
  firstName: string;

  @doc("Last name")
  lastName?: string;

  @doc("Email address")
  @format("email")
  email?: Email;

  @doc("Phone number")
  phone?: PhoneNumber;

  @doc("Consent preferences")
  marketingConsent?: ConsentRecord;
  dataSharingConsent?: ConsentRecord;
}
```

**Request Model Pattern:**
```typescript
@doc("Request body for creating a person")
model PersonCreateRequest {
  @doc("First name")
  firstName: string;

  @doc("Last name")
  lastName?: string;

  @doc("Email address")
  email?: Email;

  @doc("Phone number")
  phone?: PhoneNumber;
}

@doc("Request body for updating a person")
model PersonUpdateRequest {
  @doc("Updated first name")
  firstName?: string;

  @doc("Updated last name")
  lastName?: string;

  @doc("Updated email")
  email?: Email;
}
```

### 3. Define Operations

**CRUD Operations Pattern:**
```typescript
namespace PersonModule {
  @route("/persons")
  interface PersonManagement {
    @get
    @summary("List all persons")
    @doc("Retrieves a paginated list of all persons")
    listPersons(
      ...PaginationQuery
    ): {
      @statusCode statusCode: 200;
      @body body: PaginatedResponse<Person>;
    };

    @post
    @summary("Create a new person")
    @doc("Creates a new person record")
    createPerson(
      @body request: PersonCreateRequest
    ): {
      @statusCode statusCode: 201;
      @body body: Person;
    } | {
      @statusCode statusCode: 400;
      @body body: ValidationError;
    };

    @get
    @summary("Get person by ID")
    @route("/{person}")
    getPerson(
      @path person: UUID
    ): {
      @statusCode statusCode: 200;
      @body body: Person;
    } | {
      @statusCode statusCode: 404;
      @body body: NotFoundError;
    };

    @patch
    @summary("Update person")
    @route("/{person}")
    updatePerson(
      @path person: UUID,
      @body request: PersonUpdateRequest
    ): {
      @statusCode statusCode: 200;
      @body body: Person;
    };

    @delete
    @summary("Delete person")
    @route("/{person}")
    deletePerson(
      @path person: UUID
    ): {
      @statusCode statusCode: 204;
      @body body: NoContentResponse;
    };
  }
}
```

---

## Schema Design Patterns

### Nullable vs Optional Fields

**Optional (`?`)**: Field can be omitted from request/response
**Nullable (`| null`)**: Field must be present but can be `null`

```typescript
model Example {
  // Optional - can be omitted
  optionalField?: string;

  // Nullable - must be present, can be null
  nullableField: string | null;

  // Both - can be omitted OR present as null
  both?: string | null;
}
```

### Shared Models

Define common models in `src/common/models.tsp`:

```typescript
// src/common/models.tsp
@doc("Base entity with audit fields")
model BaseEntity {
  @doc("Unique identifier")
  id: UUID;

  @doc("Creation timestamp")
  createdAt: utcDateTime;

  @doc("Last update timestamp")
  updatedAt: utcDateTime;

  @doc("Version for optimistic locking")
  version: int32;
}

@doc("Consent record structure")
model ConsentRecord {
  @doc("Whether consent was granted")
  granted: boolean;

  @doc("Timestamp when consent was granted")
  grantedAt?: utcDateTime;

  @doc("IP address of consent action")
  ipAddress?: string;
}
```

### Error Models

Define standard errors in `src/common/errors.tsp`:

```typescript
// src/common/errors.tsp
@doc("Standard error response")
@error
model ApiError {
  @doc("Error code")
  code: string;

  @doc("Human-readable error message")
  message: string;

  @doc("Additional error details")
  details?: Record<unknown>;
}

@doc("Resource not found error")
model NotFoundError extends ApiError {
  code: "NOT_FOUND";
}

@doc("Validation error")
model ValidationError extends ApiError {
  code: "VALIDATION_ERROR";
  @doc("Field-specific validation errors")
  fieldErrors?: Record<string[]>;
}
```

---

## API Endpoint Patterns

### RESTful Conventions

Follow RESTful conventions for endpoint design:

| Method | Pattern | Purpose | Status |
|--------|---------|---------|--------|
| `GET` | `/resources` | List all | 200 |
| `GET` | `/resources/{id}` | Get one | 200, 404 |
| `POST` | `/resources` | Create | 201 |
| `PATCH` | `/resources/{id}` | Update | 200, 404 |
| `PUT` | `/resources/{id}` | Replace | 200, 404 |
| `DELETE` | `/resources/{id}` | Delete | 204, 404 |

### Query Parameters

```typescript
@get
@summary("Search persons")
searchPersons(
  @query firstName?: string,
  @query email?: Email,
  ...PaginationQuery
): {
  @statusCode statusCode: 200;
  @body body: PaginatedResponse<Person>;
};
```

### Path Parameters

```typescript
@get
@route("/booking/events/{event}/slots")
getEventSlots(
  @path event: UUID,
  @query startDate?: plainDate,
  @query endDate?: plainDate
): {
  @statusCode statusCode: 200;
  @body body: TimeSlot[];
};
```

---

## Validation and Constraints

### String Constraints

```typescript
model Person {
  @doc("Email address")
  @format("email")
  email?: Email;

  @doc("Phone number")
  @pattern("^\\+?[1-9]\\d{1,14}$")
  phone?: PhoneNumber;

  @doc("First name")
  @minLength(1)
  @maxLength(100)
  firstName: string;
}
```

### Numeric Constraints

```typescript
model BookingEvent {
  @doc("Duration in minutes")
  @minValue(15)
  @maxValue(480)
  durationMinutes: int32;

  @doc("Buffer time between bookings")
  @minValue(0)
  @maxValue(120)
  bufferMinutes?: int32;
}
```

### Enum Patterns

```typescript
@doc("Booking status")
enum BookingStatus {
  @doc("Booking is confirmed")
  Confirmed: "confirmed",

  @doc("Booking is completed")
  Completed: "completed",

  @doc("Booking is cancelled")
  Cancelled: "cancelled",

  @doc("Attendee did not show up")
  NoShow: "no_show"
}

model Booking {
  status: BookingStatus;
}
```

---

## Documentation Standards

### Model Documentation

**Always include:**
1. `@doc` for model description
2. `@doc` for each field
3. Examples for complex fields

```typescript
@doc("Booking event defining availability for scheduling")
model BookingEvent extends BaseEntity {
  @doc("Event title")
  title: string;

  @doc("Event description")
  description?: string;

  @doc("Duration in minutes")
  durationMinutes: int32;

  @doc("Associated person (service provider)")
  person: UUID | Person;

  @doc("Location type")
  @example("virtual")
  locationType: "in_person" | "virtual" | "hybrid";
}
```

### Operation Documentation

```typescript
@post
@summary("Create a new booking")
@doc("""
  Creates a new booking for an event.

  Requires:
  - Valid event ID reference
  - Available time slot
  - Attendee information

  Returns the created booking with confirmation details.
""")
createBooking(
  @body request: BookingCreateRequest
): {
  @statusCode statusCode: 201;
  @body body: Booking;
};
```

### Tags for Organization

```typescript
@tag("Person Management")
namespace PersonModule {
  // Person operations
}

@tag("Booking Management")
namespace BookingModule {
  // Booking operations
}
```

---

## Quick Reference

### Development Commands

```bash
cd specs/api

# Development
bun run build          # Compile TypeSpec
bun run watch         # Watch mode

# Generation
bun run build              # Generate both OpenAPI and types
bun run build:openapi      # OpenAPI only
bun run build:types        # Types only

# Quality
bun run lint          # Validate syntax
bun run format        # Format files
bun run clean         # Clean dist/
```

### Common Decorators

| Decorator | Purpose | Example |
|-----------|---------|---------|
| `@doc` | Documentation | `@doc("User ID")` |
| `@summary` | Short description | `@summary("Create user")` |
| `@tag` | Group operations | `@tag("Users")` |
| `@route` | Endpoint path | `@route("/users")` |
| `@get/@post/@patch/@delete` | HTTP method | `@get` |
| `@path` | Path parameter | `@path id: string` |
| `@query` | Query parameter | `@query name?: string` |
| `@body` | Request body | `@body user: User` |
| `@statusCode` | HTTP status | `@statusCode statusCode: 201` |
| `@minLength/@maxLength` | String length | `@minLength(5)` |
| `@minValue/@maxValue` | Numeric range | `@minValue(0)` |
| `@pattern` | Regex validation | `@pattern("^\\d+$")` |
| `@format` | String format | `@format("email")` |

### Before Implementing

1. **Define models** in TypeSpec
2. **Run build** to generate OpenAPI + types
3. **Implement handlers** in services/api-ts
4. **Use types** in frontend apps

### File Organization

```
src/modules/
├── person.tsp        # User profiles
├── booking.tsp       # Appointments
├── billing.tsp       # Payments
├── notifs.tsp        # Notifications
├── comms.tsp         # Video/chat
├── storage.tsp       # Files
├── email.tsp         # Email
├── audit.tsp         # Logging
└── reviews.tsp       # Reviews
```

---

## Complete Backend Patterns

For complete details on:
- API-First Development workflow
- Code generation rules (CRITICAL!)
- Coding standards
- Module structure patterns
- Testing requirements

**See**: [Root CONTRIBUTING.md](../../CONTRIBUTING.md)

---

**For TypeSpec syntax reference**: https://typespec.io/docs
