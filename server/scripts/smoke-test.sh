#!/usr/bin/env bash
set -euo pipefail

SERVER_URL="${SERVER_URL:-http://localhost:3001}"
MAX_RETRIES="${MAX_RETRIES:-30}"
RETRY_INTERVAL="${RETRY_INTERVAL:-2}"

PASSED=0
FAILED=0
ERRORS=""

check_endpoint() {
  local method="$1"
  local path="$2"
  local expected_status="$3"
  local description="$4"
  local body="${5:-}"

  local url="${SERVER_URL}${path}"
  local actual_status

  if [ -n "$body" ]; then
    actual_status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
      -H "Content-Type: application/json" -d "$body")
  else
    actual_status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url")
  fi

  if [ "$actual_status" = "$expected_status" ]; then
    echo "  PASS: $description (${method} ${path}) -> $actual_status"
    PASSED=$((PASSED + 1))
  else
    echo "  FAIL: $description (${method} ${path}) -> expected $expected_status, got $actual_status"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n- ${description}: expected ${expected_status}, got ${actual_status}"
  fi
}

echo "=== BearlyMail Smoke Tests ==="
echo "Server URL: $SERVER_URL"
echo ""

echo "Waiting for server to be ready..."
for i in $(seq 1 "$MAX_RETRIES"); do
  if curl -s -o /dev/null -w "%{http_code}" "${SERVER_URL}/health" | grep -q "200"; then
    echo "Server is ready after $((i * RETRY_INTERVAL)) seconds"
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "FATAL: Server did not become ready after $((MAX_RETRIES * RETRY_INTERVAL)) seconds"
    exit 1
  fi
  sleep "$RETRY_INTERVAL"
done

echo ""
echo "--- Running endpoint checks ---"

check_endpoint "GET" "/health" "200" "Health check"

check_endpoint "GET" "/" "200" "Root endpoint"

check_endpoint "POST" "/waitlist" "400" "Waitlist with empty body (validation error)" "{}"

check_endpoint "POST" "/waitlist" "400" "Waitlist with partial body (validation error)" '{"email":"test@example.com"}'

check_endpoint "GET" "/emails/inbox" "401" "Inbox requires authentication"

check_endpoint "GET" "/waitlist" "401" "Waitlist list requires authentication"

check_endpoint "GET" "/users/me" "401" "User profile requires authentication"

check_endpoint "GET" "/batch-schedule" "401" "Batch schedule requires authentication"

check_endpoint "GET" "/context" "401" "Context requires authentication"

echo ""
echo "--- Results ---"
echo "Passed: $PASSED"
echo "Failed: $FAILED"

if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo "Failed checks:"
  echo -e "$ERRORS"
  exit 1
fi

echo ""
echo "All smoke tests passed!"
