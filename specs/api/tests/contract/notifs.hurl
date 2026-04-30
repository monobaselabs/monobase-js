# Notification list + mark-all-as-read on a brand new user (no notifications).
# The list endpoint should accept the request, return an empty paginated
# envelope, and survive mark-all-as-read as a no-op.

# 0. Unauthenticated list must be rejected. Run before any sign-up so
# Hurl's session cookie jar is empty.
GET {{api}}/notifs
HTTP 401


POST {{api}}/auth/sign-up/email
Content-Type: application/json
{
  "email": "notifs-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest",
  "name": "Notifs Tester"
}
HTTP 200
[Captures]
session_token: cookie "better-auth.session_token"


POST {{api}}/persons
Cookie: better-auth.session_token={{session_token}}
Content-Type: application/json
{
  "firstName": "Notifs",
  "lastName": "Tester",
  "languagesSpoken": ["en"],
  "timezone": "America/New_York"
}
HTTP 201


# 1. List notifications - empty paginated envelope.
GET {{api}}/notifs
Cookie: better-auth.session_token={{session_token}}
HTTP 200
[Asserts]
jsonpath "$.data" isCollection
jsonpath "$.data" count == 0
jsonpath "$.pagination.totalCount" == 0


# 2. Filter by type - still empty, still well-formed.
GET {{api}}/notifs?type=booking.confirmed
Cookie: better-auth.session_token={{session_token}}
HTTP 200
[Asserts]
jsonpath "$.data" isCollection


# 3. Mark-all-as-read - safe no-op when there is nothing to mark.
POST {{api}}/notifs/read-all
Cookie: better-auth.session_token={{session_token}}
HTTP 200
