# Storage upload lifecycle: request a presigned upload URL, PUT the file
# bytes directly to the storage backend, complete the upload, list, and
# delete. The presigned URL bypasses the API on the way to S3/MinIO.

POST {{api}}/auth/sign-up/email
Content-Type: application/json
{
  "email": "storage-{{suffix}}@example.org",
  "password": "Sup3rSecret!ContractTest",
  "name": "Storage Tester"
}
HTTP 200
[Captures]
session_token: cookie "better-auth.session_token"


POST {{api}}/persons
Cookie: better-auth.session_token={{session_token}}
Content-Type: application/json
{
  "firstName": "Storage",
  "lastName": "Tester",
  "languagesSpoken": ["en"],
  "timezone": "America/New_York"
}
HTTP 201


# 1. List files - empty.
GET {{api}}/storage/files
Cookie: better-auth.session_token={{session_token}}
HTTP 200
[Asserts]
jsonpath "$.data" isCollection


# 2. Request a presigned upload URL for a tiny text file.
POST {{api}}/storage/files/upload
Cookie: better-auth.session_token={{session_token}}
Content-Type: application/json
{
  "filename": "hello.txt",
  "size": 13,
  "mimeType": "text/plain"
}
HTTP 201
[Captures]
file_id: jsonpath "$.file"
upload_url: jsonpath "$.uploadUrl"
[Asserts]
jsonpath "$.uploadMethod" == "PUT"


# 3. PUT the file bytes directly to the presigned URL.
PUT {{upload_url}}
Content-Type: text/plain
```
Hello, world!
```
HTTP 200


# 4. Complete the upload.
POST {{api}}/storage/files/{{file_id}}/complete
Cookie: better-auth.session_token={{session_token}}
Content-Type: application/json
{}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{file_id}}"
jsonpath "$.status" exists


# 5. Get the file download URL.
GET {{api}}/storage/files/{{file_id}}/download
Cookie: better-auth.session_token={{session_token}}
HTTP 200
[Asserts]
jsonpath "$.downloadUrl" exists


# 6. Delete the file.
DELETE {{api}}/storage/files/{{file_id}}
Cookie: better-auth.session_token={{session_token}}
HTTP 204
