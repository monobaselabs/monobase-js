# BookingEvent host-side lifecycle: a logged-in person creates a booking
# event, lists their own events, updates the title, and archives it.

# 0. Sign up + create person profile
POST {{api}}/auth/sign-up/email
Content-Type: application/json
{
  "email": "host-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest",
  "name": "Booking Host"
}
HTTP 200
[Captures]
session_token: cookie "better-auth.session_token"


POST {{api}}/persons
Cookie: better-auth.session_token={{session_token}}
Content-Type: application/json
{
  "firstName": "Booking",
  "lastName": "Host",
  "languagesSpoken": ["en"],
  "timezone": "America/New_York"
}
HTTP 201


# 1. Create a booking event
POST {{api}}/booking/events
Cookie: better-auth.session_token={{session_token}}
Content-Type: application/json
{
  "title": "30-min consult",
  "timezone": "America/New_York",
  "locationTypes": ["video"],
  "maxBookingDays": 14,
  "minBookingMinutes": 60,
  "status": "draft",
  "effectiveFrom": "2026-01-01T00:00:00Z",
  "dailyConfigs": {
    "mon": { "enabled": true, "timeBlocks": [{ "startTime": "09:00", "endTime": "17:00", "slotDuration": 30 }] }
  }
}
HTTP 201
[Captures]
event_id: jsonpath "$.id"
[Asserts]
jsonpath "$.title" == "30-min consult"
jsonpath "$.status" == "draft"


# 2. List events. Asserts the spec'd PaginatedResponse envelope.
GET {{api}}/booking/events
Cookie: better-auth.session_token={{session_token}}
HTTP 200
[Asserts]
jsonpath "$.data" isCollection
jsonpath "$.pagination.totalCount" exists
jsonpath "$.pagination.limit" exists
jsonpath "$.pagination.offset" exists
jsonpath "$.pagination.hasNextPage" exists


# 3. Update title
PATCH {{api}}/booking/events/{{event_id}}
Cookie: better-auth.session_token={{session_token}}
Content-Type: application/json
{ "title": "30-min intro chat" }
HTTP 200
[Asserts]
jsonpath "$.title" == "30-min intro chat"


# 4. Archive it
PATCH {{api}}/booking/events/{{event_id}}
Cookie: better-auth.session_token={{session_token}}
Content-Type: application/json
{ "status": "archived" }
HTTP 200
[Asserts]
jsonpath "$.status" == "archived"
