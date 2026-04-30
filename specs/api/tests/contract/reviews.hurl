# Reviews lifecycle: a reviewer creates a review of another person,
# lists their own reviews, fetches the review back, and deletes it.
# Also asserts that self-reviews are rejected.
#
# Note: relies on Hurl's automatic cookie jar to track session state.
# To switch which user is "logged in", sign in / sign up again — Cookie
# headers and the jar can disagree if you mix the two.

# 0. Create reviewer (latest cookie in jar = reviewer).
POST {{api}}/auth/sign-up/email
Content-Type: application/json
{
  "email": "reviewer-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest",
  "name": "Reviewer"
}
HTTP 200
[Captures]
reviewer_id: jsonpath "$.user.id"


POST {{api}}/persons
Content-Type: application/json
{
  "firstName": "Reviewer",
  "lastName": "Tester",
  "languagesSpoken": ["en"],
  "timezone": "America/New_York"
}
HTTP 201


# 1. Self-review is rejected (reviewedEntity == authenticated reviewer).
# Done BEFORE the reviewee sign-up so the active session is the reviewer.
POST {{api}}/reviews/
Content-Type: application/json
{
  "context": "{{reviewer_id}}",
  "reviewType": "platform",
  "reviewedEntity": "{{reviewer_id}}",
  "npsScore": 9
}
HTTP 400


# 2. Sign up the person being reviewed (jar now holds reviewee).
POST {{api}}/auth/sign-up/email
Content-Type: application/json
{
  "email": "reviewee-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest",
  "name": "Reviewee"
}
HTTP 200
[Captures]
reviewee_id: jsonpath "$.user.id"


POST {{api}}/persons
Content-Type: application/json
{
  "firstName": "Reviewee",
  "lastName": "Subject",
  "languagesSpoken": ["en"],
  "timezone": "America/New_York"
}
HTTP 201


# 3. Sign back in as the reviewer so the jar holds their session again.
POST {{api}}/auth/sign-in/email
Content-Type: application/json
{
  "email": "reviewer-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest"
}
HTTP 200


# 4. Create a valid review of the reviewee.
POST {{api}}/reviews/
Content-Type: application/json
{
  "context": "{{reviewee_id}}",
  "reviewType": "service_provider",
  "reviewedEntity": "{{reviewee_id}}",
  "npsScore": 9,
  "comment": "Great experience"
}
HTTP 201
[Captures]
review_id: jsonpath "$.id"
[Asserts]
jsonpath "$.npsScore" == 9
jsonpath "$.reviewer" == "{{reviewer_id}}"
jsonpath "$.reviewedEntity" == "{{reviewee_id}}"


# 5. Read it back.
GET {{api}}/reviews/{{review_id}}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{review_id}}"


# 6. List the reviewer's own reviews; the new one should be there.
GET {{api}}/reviews/
HTTP 200
[Asserts]
jsonpath "$.data" isCollection
jsonpath "$.pagination.totalCount" >= 1


# 7. Delete it.
DELETE {{api}}/reviews/{{review_id}}
HTTP 204
