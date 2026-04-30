# Person profile lifecycle: sign-up -> create person -> read -> update.
# Asserts the response shape of the Person model is what the OpenAPI says.

# 1. Sign up
POST {{api}}/auth/sign-up/email
Content-Type: application/json
{
  "email": "person-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest",
  "name": "Person Tester"
}
HTTP 200
[Captures]
session_token: cookie "better-auth.session_token"
user_id: jsonpath "$.user.id"


# 2. Create the person profile
POST {{api}}/persons
Cookie: better-auth.session_token={{session_token}}
Content-Type: application/json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "dateOfBirth": "1990-05-15",
  "languagesSpoken": ["en"],
  "timezone": "America/New_York"
}
HTTP 201
[Captures]
person_id: jsonpath "$.id"
[Asserts]
jsonpath "$.id" == "{{user_id}}"
jsonpath "$.firstName" == "Ada"
jsonpath "$.lastName" == "Lovelace"


# 3. Read it back
GET {{api}}/persons/{{person_id}}
Cookie: better-auth.session_token={{session_token}}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{person_id}}"
jsonpath "$.firstName" == "Ada"


# 4. Patch it
PATCH {{api}}/persons/{{person_id}}
Cookie: better-auth.session_token={{session_token}}
Content-Type: application/json
{
  "firstName": "Augusta"
}
HTTP 200
[Asserts]
jsonpath "$.firstName" == "Augusta"
jsonpath "$.lastName" == "Lovelace"
