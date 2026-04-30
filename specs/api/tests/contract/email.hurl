# Email module surface that is reachable without admin privileges:
# the list-templates endpoint is admin-only, so a regular user must
# receive 403. Anonymous callers must receive 401.

GET {{api}}/email/templates
HTTP 401


POST {{api}}/auth/sign-up/email
Content-Type: application/json
{
  "email": "email-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest",
  "name": "Email Tester"
}
HTTP 200
[Captures]
session_token: cookie "better-auth.session_token"


GET {{api}}/email/templates
Cookie: better-auth.session_token={{session_token}}
HTTP 403
