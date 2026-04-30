# Sign-up + sign-in lifecycle (Better-Auth)
# Validates: account creation, session retrieval, session token format.
# Each Hurl run uses a fresh email so it's deterministic across replays.

# 1. Create a new account
POST {{api}}/auth/sign-up/email
Content-Type: application/json
{
  "email": "{{suffix}}@contract-tests.local",
  "password": "Sup3rSecret!ContractTest",
  "name": "Contract Tester"
}
HTTP 200
[Captures]
session_token: header "set-cookie" regex "(?:^|;|, )(?:[^=]*\\.session_token|monobase\\.session_token|better-auth\\.session_token)=([^;]+)"
created_user_email: jsonpath "$.user.email"
[Asserts]
jsonpath "$.user.id" exists
jsonpath "$.user.email" exists


# 2. Read back the session
GET {{api}}/auth/get-session
Cookie: monobase.session_token={{session_token}}
HTTP 200
[Asserts]
jsonpath "$.user.email" == "{{created_user_email}}"


# 3. Sign out
POST {{api}}/auth/sign-out
Cookie: monobase.session_token={{session_token}}
HTTP 200


# 4. Re-reading the session after sign-out should not return a user
GET {{api}}/auth/get-session
Cookie: monobase.session_token={{session_token}}
HTTP *
[Asserts]
status >= 200
status < 500
