#!/usr/bin/env bash
#
# Contract smoke test against a running server.
#
# Checks what a deployment can get wrong without failing to boot: that both
# contracts are mounted, that v1 still answers the way its consumers expect,
# that v2 enforces the envelope and rejects what it should, and that the
# OpenAPI document describes both. No WhatsApp connection is required — every
# check here works on a disconnected instance, which is also why a `503` is a
# pass rather than a failure.
#
#   ./scripts/smoke.sh [base-url] [api-key]
#
# Defaults to http://127.0.0.1:3000 and $API_KEY.

set -uo pipefail

BASE="${1:-${BASE_URL:-http://127.0.0.1:3000}}"
KEY="${2:-${API_KEY:-}}"
V2="$BASE/api/v2"
INSTANCE="smoke-$$"

if [ -z "$KEY" ]; then
  echo "No API key. Pass it as the second argument or set API_KEY." >&2
  exit 2
fi

pass=0
fail=0

# check <name> <expected> <actual>
check() {
  if [ "$2" = "$3" ]; then
    printf '  \033[32mPASS\033[0m  %s\n' "$1"
    pass=$((pass + 1))
  else
    printf '  \033[31mFAIL\033[0m  %s — expected %s, got %s\n' "$1" "$2" "$3"
    fail=$((fail + 1))
  fi
}

# status <method> <url> [json-body]
status() {
  if [ $# -ge 3 ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$1" "$2" \
      -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d "$3"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$1" "$2" -H "Authorization: Bearer $KEY"
  fi
}

# body <method> <url> [json-body]
body() {
  if [ $# -ge 3 ]; then
    curl -s -X "$1" "$2" -H "Authorization: Bearer $KEY" \
      -H 'Content-Type: application/json' -d "$3"
  else
    curl -s -X "$1" "$2" -H "Authorization: Bearer $KEY"
  fi
}

cleanup() {
  curl -s -o /dev/null -X DELETE "$V2/instances/$INSTANCE" -H "Authorization: Bearer $KEY" || true
}
trap cleanup EXIT

echo
echo "Smoke test → $BASE"
echo

echo "Reachability"
check "GET /health is 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health")"
check "unauthenticated v2 request is 401" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$V2/instances")"
check "wrong api key is 401" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$V2/instances" -H 'Authorization: Bearer wrong')"

echo
echo "Both contracts mounted"
check "v1 GET /instances is 200" 200 "$(status GET "$BASE/instances")"
check "v2 GET /instances is 200" 200 "$(status GET "$V2/instances")"
check "v1 collection is a bare array" true \
  "$(body GET "$BASE/instances" | grep -qE '"data":\[' && echo true || echo false)"
check "v2 collection is { items, total }" true \
  "$(body GET "$V2/instances" | grep -qE '"items":.*"total":' && echo true || echo false)"

echo
echo "Instance lifecycle (no WhatsApp connection needed)"
check "v2 create is 201" 201 \
  "$(status POST "$V2/instances" "{\"instanceId\":\"$INSTANCE\"}")"
check "duplicate create is 409" 409 \
  "$(status POST "$V2/instances" "{\"instanceId\":\"$INSTANCE\"}")"
check "read back is 200" 200 "$(status GET "$V2/instances/$INSTANCE")"
check "unknown instance is 404" 404 "$(status GET "$V2/instances/does-not-exist")"

echo
echo "v2 rejects what it should"
check "unknown field is 400" 400 \
  "$(status POST "$V2/instances" '{"instanceId":"smoke-x","nope":1}')"
check "validation code is VALIDATION_ERROR" true \
  "$(body POST "$V2/instances" '{"instanceId":"smoke-x","nope":1}' \
     | grep -q '"VALIDATION_ERROR"' && echo true || echo false)"
check "validation carries details" true \
  "$(body POST "$V2/instances" '{"instanceId":"smoke-x","nope":1}' \
     | grep -q '"validation"' && echo true || echo false)"
check "empty patch is 400" 400 \
  "$(status PATCH "$V2/instances/$INSTANCE/runtime" '{}')"
check "transport change via runtime is 400" 400 \
  "$(status PATCH "$V2/instances/$INSTANCE/runtime" '{"proxy":"socks5://x:1080"}')"
check "SSRF guard holds" 400 \
  "$(status POST "$V2/instances" \
     '{"instanceId":"smoke-ssrf","webhookUrl":"http://169.254.169.254/latest/meta-data"}')"

echo
echo "Disconnected instance behaves"
check "connection-only route is 503" 503 "$(status GET "$V2/instances/$INSTANCE/contacts")"
check "runtime options readable" 200 "$(status GET "$V2/instances/$INSTANCE/runtime")"
check "runtime patch applies" true \
  "$(body PATCH "$V2/instances/$INSTANCE/runtime" '{"autoReconnect":false}' \
     | grep -q '"autoReconnect":false' && echo true || echo false)"
check "session clear is 200" 200 "$(status DELETE "$V2/instances/$INSTANCE/session")"

echo
echo "OpenAPI describes both mounts"
spec="$(curl -s "$BASE/documentation/json")"
check "spec served" true "$(echo "$spec" | grep -q '"paths"' && echo true || echo false)"
check "lists v1 /instances" true \
  "$(echo "$spec" | grep -q '"/instances"' && echo true || echo false)"
check "lists v2 /instances" true \
  "$(echo "$spec" | grep -q '"/api/v2/instances"' && echo true || echo false)"
check "lists v2 communities" true \
  "$(echo "$spec" | grep -q '/api/v2/instances/{instanceId}/communities' && echo true || echo false)"

echo
echo "─────────────────────────────"
printf '  %d passed, %d failed\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
