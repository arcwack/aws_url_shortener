#!/usr/bin/env bash
set -euo pipefail

aws lambda get-function-configuration \
  --function-name "${REDIRECT_FUNCTION:-RedirectFunction}" \
  --profile "${AWS_PROFILE:-urlshortener}" \
  --region "${AWS_REGION:-ap-south-1}" \
  --query 'Environment.Variables.LAB_ADMIN_KEY' \
  --output text
