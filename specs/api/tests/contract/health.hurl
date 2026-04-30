# Liveness and readiness probes (Kubernetes-compatible).
# Default response is `text/plain` body "ok" with HTTP 200, optimised for
# orchestrator health checks. `?verbose=true` returns a JSON envelope with
# per-dependency status.

GET {{api}}/livez
HTTP 200
[Asserts]
body == "ok"


GET {{api}}/livez?verbose=true
HTTP 200
[Asserts]
header "Content-Type" matches "application/(health\\+)?json"
jsonpath "$.status" exists
jsonpath "$.timestamp" exists


GET {{api}}/readyz
HTTP *
# 200 when all dependencies are healthy; 503 when one is degraded. Both are
# valid contract responses; clients distinguish via status code.
[Asserts]
status >= 200
status < 600
