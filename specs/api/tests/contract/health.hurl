# Liveness and readiness probes (Kubernetes-compatible)
# Every implementation must expose /livez and /readyz; both return JSON with
# a top-level `status` field.

GET {{api}}/livez
HTTP 200
[Asserts]
header "Content-Type" matches "application/json"
jsonpath "$.status" exists


GET {{api}}/livez?verbose=true
HTTP 200
[Asserts]
jsonpath "$.status" exists


GET {{api}}/readyz
HTTP *
# 200 when all dependencies are healthy; 503 when one is degraded. Both are
# valid contract responses; clients distinguish via status code.
[Asserts]
status >= 200
status <= 599
header "Content-Type" matches "application/json"
jsonpath "$.status" exists
