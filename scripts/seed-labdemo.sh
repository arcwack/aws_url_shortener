#!/usr/bin/env bash
set -euo pipefail

PROFILE="${AWS_PROFILE:-urlshortener}"
REGION="${AWS_REGION:-ap-south-1}"
TABLE="${URLS_TABLE:-URLs}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

HASH=$(cd "$REPO_ROOT/lambdas/redirect" && python3 -c 'import passwords; print(passwords.hash_password("welcome1"))')
NOW=$(python3 -c 'from datetime import datetime, timezone; print(datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"))')

ITEM=$(python3 - "$HASH" "$NOW" <<'PY'
import json
import sys

password_hash, now = sys.argv[1], sys.argv[2]
print(json.dumps({
    "short_code": {"S": "labdemo"},
    "original_url": {"S": "https://example.com"},
    "created_at": {"S": now},
    "expires_at": {"N": "2000000000"},
    "click_count": {"N": "0"},
    "password_hash": {"S": password_hash},
    "password_version": {"S": now},
    "password_updated_at": {"S": now},
    "rate_limit_enabled": {"BOOL": False},
    "lab_demo": {"BOOL": True},
}))
PY
)

aws dynamodb put-item \
  --table-name "$TABLE" \
  --item "$ITEM" \
  --profile "$PROFILE" \
  --region "$REGION"

echo "Seeded labdemo (password: welcome1, protection: off)"
