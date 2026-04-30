# BookingEvent host-side lifecycle: a logged-in person creates a booking
# event, lists their own events, updates the title, and archives it.

# 0. Sign up + create person profile
POST {{api}}/auth/sign-up/email
Content-Type: application/json
{
  "email": "{{suffix}}@contract-tests.local",
  "password": "Sup3rSecret!ContractTest",
  "name": "Booking Host"
}
HTTP 200
[Captures]
session_token: header "set-cookie" regex "(?:^|;|, )(?:[^=]*\\.session_token|monobase\\.session_token|better-auth\\.session_token)=([^;]+)"


POST {{api}}/persons
Cookie: monobase.session_token={{session_token}}
Content-Type: application/json
{
  "firstName": "Booking",
  "lastName": "Host",
  "languagesSpoken": ["en"],
  "timezone": "Etc/UTC"
}
HTTP 201


# 1. Create a booking event
POST {{api}}/booking/events
Cookie: monobase.session_token={{session_token}}
Content-Type: application/json
{
  "title": "30-min consult",
  "timezone": "Etc/UTC",
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


# 2. List my events
GET {{api}}/booking/events?owner=me
Cookie: monobase.session_token={{session_token}}
HTTP 200
[Asserts]
jsonpath "$.data" isCollection
jsonpath "$.pagination.totalCount" >= 1


# 3. Update title
PATCH {{api}}/booking/events/{{event_id}}
Cookie: monobase.session_token={{session_token}}
Content-Type: application/json
{ "title": "30-min intro chat" }
HTTP 200
[Asserts]
jsonpath "$.title" == "30-min intro chat"


# 4. Archive it
PATCH {{api}}/booking/events/{{event_id}}
Cookie: monobase.session_token={{session_token}}
Content-Type: application/json
{ "status": "archived" }
HTTP 200
[Asserts]
jsonpath "$.status" == "archived"
