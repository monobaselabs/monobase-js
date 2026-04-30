# End-to-end booking flow: a host publishes an active event, a client
# books an open slot, the host confirms, then the client cancels. Slots
# are auto-generated from the event's dailyConfigs as soon as it goes
# active. Relies on Hurl's cookie jar; sign in / sign up to switch
# whichever user is "active".

# 0. Create the host.
POST {{api}}/auth/sign-up/email
Content-Type: application/json
{
  "email": "flow-host-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest",
  "name": "Booking Host"
}
HTTP 200


POST {{api}}/persons
Content-Type: application/json
{
  "firstName": "Booking",
  "lastName": "Host",
  "languagesSpoken": ["en"],
  "timezone": "America/New_York"
}
HTTP 201


# 1. Create an active booking event so slots are generated.
POST {{api}}/booking/events
Content-Type: application/json
{
  "title": "30-min consult",
  "timezone": "America/New_York",
  "locationTypes": ["video"],
  "maxBookingDays": 60,
  "minBookingMinutes": 60,
  "status": "active",
  "effectiveFrom": "2026-01-01T00:00:00Z",
  "dailyConfigs": {
    "mon": { "enabled": true, "timeBlocks": [{ "startTime": "09:00", "endTime": "17:00", "slotDuration": 30 }] },
    "tue": { "enabled": true, "timeBlocks": [{ "startTime": "09:00", "endTime": "17:00", "slotDuration": 30 }] },
    "wed": { "enabled": true, "timeBlocks": [{ "startTime": "09:00", "endTime": "17:00", "slotDuration": 30 }] },
    "thu": { "enabled": true, "timeBlocks": [{ "startTime": "09:00", "endTime": "17:00", "slotDuration": 30 }] },
    "fri": { "enabled": true, "timeBlocks": [{ "startTime": "09:00", "endTime": "17:00", "slotDuration": 30 }] }
  }
}
HTTP 201
[Captures]
event_id: jsonpath "$.id"


# 2. List slots for that event - at least one available slot should exist.
GET {{api}}/booking/events/{{event_id}}/slots?status=available
HTTP 200
[Captures]
slot_id: jsonpath "$[0].id"
[Asserts]
jsonpath "$" isCollection


# 3. Switch to a client user (jar now holds client session).
POST {{api}}/auth/sign-up/email
Content-Type: application/json
{
  "email": "flow-client-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest",
  "name": "Booking Client"
}
HTTP 200


POST {{api}}/persons
Content-Type: application/json
{
  "firstName": "Booking",
  "lastName": "Client",
  "languagesSpoken": ["en"],
  "timezone": "America/New_York"
}
HTTP 201


# 4. Book the slot as the client.
POST {{api}}/booking/bookings
Content-Type: application/json
{
  "slot": "{{slot_id}}",
  "locationType": "video",
  "reason": "Initial consult"
}
HTTP 201
[Captures]
booking_id: jsonpath "$.id"
[Asserts]
jsonpath "$.status" == "pending"


# 5. List the client's bookings (role-based: client sees own bookings).
GET {{api}}/booking/bookings
HTTP 200
[Asserts]
jsonpath "$.data" isCollection
jsonpath "$.pagination.totalCount" >= 1


# 6. Switch back to the host to confirm.
POST {{api}}/auth/sign-in/email
Content-Type: application/json
{
  "email": "flow-host-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest"
}
HTTP 200


POST {{api}}/booking/bookings/{{booking_id}}/confirm
Content-Type: application/json
{ "reason": "Confirmed by host" }
HTTP 200
[Asserts]
jsonpath "$.status" == "confirmed"


# 7. Switch back to client to cancel.
POST {{api}}/auth/sign-in/email
Content-Type: application/json
{
  "email": "flow-client-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest"
}
HTTP 200


POST {{api}}/booking/bookings/{{booking_id}}/cancel
Content-Type: application/json
{ "reason": "Schedule conflict" }
HTTP 200
[Asserts]
jsonpath "$.status" == "cancelled"
