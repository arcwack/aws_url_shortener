#!/usr/bin/env bash
set -euo pipefail

# Pin the RedirectFunction demo clock. This is a server-side override: the
# plain short URL uses this moment. An explicit ?simulate_time= still wins.
#
# Usage:
#   ./scripts/demo-clock.sh weekend
#   ./scripts/demo-clock.sh weekday
#   ./scripts/demo-clock.sh off
#   ./scripts/demo-clock.sh 2026-11-02T10:00:00

MODE="${1:-weekend}"
PROFILE="${AWS_PROFILE:-urlshortener}"
REGION="${AWS_REGION:-ap-south-1}"
FUNCTION="${REDIRECT_FUNCTION:-RedirectFunction}"
QUEUE_URL="${CLICK_QUEUE_URL:-https://sqs.ap-south-1.amazonaws.com/460047017901/ClickQueue-DLQ}"

case "$MODE" in
  weekend)
    FORCE_TIME="2026-10-31T10:00:00"
    LABEL="Saturday 31 Oct 2026, 10:00 IST"
    ;;
  weekday)
    FORCE_TIME="2026-11-02T10:00:00"
    LABEL="Monday 2 Nov 2026, 10:00 IST"
    ;;
  off)
    FORCE_TIME=""
    LABEL="real time"
    ;;
  *)
    FORCE_TIME="$MODE"
    LABEL="$MODE"
    ;;
esac

ENVIRONMENT="Variables={TABLE_NAME=URLs,CLICK_QUEUE_URL=$QUEUE_URL,DEBUG_OVERRIDES=1,DEFAULT_TIMEZONE=Asia/Kolkata"
if [ -n "$FORCE_TIME" ]; then
  ENVIRONMENT="$ENVIRONMENT,DEMO_FORCE_TIME=$FORCE_TIME"
fi
ENVIRONMENT="$ENVIRONMENT}"

aws lambda update-function-configuration \
  --function-name "$FUNCTION" \
  --environment "$ENVIRONMENT" \
  --profile "$PROFILE" \
  --region "$REGION" >/dev/null

aws lambda wait function-updated \
  --function-name "$FUNCTION" \
  --profile "$PROFILE" \
  --region "$REGION"

echo "Demo clock: $LABEL"
echo "Plain short link: https://go.devansharora.in/uDI5wn"
