# Chat-room and message basics. Requires `user:participant`, so the
# scenario covers list (empty), authentication, and creation of a
# direct chat room between two persons followed by a message round-trip.
# Switches active user via sign-in (Hurl's cookie jar tracks state).

# 0. User A signs up and creates a person profile.
POST {{api}}/auth/sign-up/email
Content-Type: application/json
{
  "email": "comms-a-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest",
  "name": "Comms A"
}
HTTP 200
[Captures]
a_id: jsonpath "$.user.id"


POST {{api}}/persons
Content-Type: application/json
{
  "firstName": "Alice",
  "lastName": "A",
  "languagesSpoken": ["en"],
  "timezone": "America/New_York"
}
HTTP 201


# 0b. User B.
POST {{api}}/auth/sign-up/email
Content-Type: application/json
{
  "email": "comms-b-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest",
  "name": "Comms B"
}
HTTP 200
[Captures]
b_id: jsonpath "$.user.id"


POST {{api}}/persons
Content-Type: application/json
{
  "firstName": "Bob",
  "lastName": "B",
  "languagesSpoken": ["en"],
  "timezone": "America/New_York"
}
HTTP 201


# 1. List rooms while empty (B is currently signed in).
GET {{api}}/comms/chat-rooms
HTTP 200
[Asserts]
jsonpath "$.data" isCollection


# 2. Sign back in as A, then create a room with both persons.
POST {{api}}/auth/sign-in/email
Content-Type: application/json
{
  "email": "comms-a-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest"
}
HTTP 200


POST {{api}}/comms/chat-rooms
Content-Type: application/json
{
  "participants": ["{{a_id}}", "{{b_id}}"],
  "context": "{{a_id}}"
}
HTTP *
[Captures]
room_id: jsonpath "$.id"
[Asserts]
status >= 200
status < 300


# 3. A sends a text message.
POST {{api}}/comms/chat-rooms/{{room_id}}/messages
Content-Type: application/json
{
  "messageType": "text",
  "message": "Hello, Bob"
}
HTTP 201


# 4. Switch to B and read the messages.
POST {{api}}/auth/sign-in/email
Content-Type: application/json
{
  "email": "comms-b-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest"
}
HTTP 200


GET {{api}}/comms/chat-rooms/{{room_id}}/messages
HTTP 200
[Asserts]
jsonpath "$.data" isCollection
jsonpath "$.pagination.totalCount" >= 1
