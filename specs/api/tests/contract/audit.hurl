# Audit log access. The endpoint requires `admin` or `support` roles
# (per x-security-required-roles in audit.tsp). A freshly signed-up user
# has the Better-Auth default `user` role, so it must be refused.

# 1. Unauthenticated request must be rejected. Run before any sign-up
# so Hurl's cookie jar is empty.
GET {{api}}/audit/logs
HTTP 401


POST {{api}}/auth/sign-up/email
Content-Type: application/json
{
  "email": "audit-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest",
  "name": "Audit Tester"
}
HTTP 200
[Captures]
session_token: cookie "better-auth.session_token"


# 2. Authenticated but non-admin user must be forbidden.
GET {{api}}/audit/logs
Cookie: better-auth.session_token={{session_token}}
HTTP 403
