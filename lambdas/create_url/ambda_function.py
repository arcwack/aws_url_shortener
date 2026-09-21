import json
import os
import re
import secrets
import string
import time
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ.get("TABLE_NAME", "URLs"))

ALPHABET = string.ascii_letters + string.digits
CODE_LENGTH = 7
TTL_SECONDS = 90 * 24 * 60 * 60
URL_PATTERN = re.compile(r"^https?://[^\s/$.?#].[^\s]*$", re.IGNORECASE)


def response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def generate_code():
    return "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))


def lambda_handler(event, context):
    # Parse body
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "Invalid JSON body"})

    url = (body.get("url") or "").strip()
    if not url or len(url) > 2048 or not URL_PATTERN.match(url):
        return response(400, {"error": "Provide a valid http(s) URL in 'url'"})

    now = int(time.time())
    item = {
        "original_url": url,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "expires_at": now + TTL_SECONDS,
        "click_count": 0,
    }

    # Retry on the (very unlikely) chance of a code collision
    for _ in range(5):
        code = generate_code()
        try:
            table.put_item(
                Item={"short_code": code, **item},
                ConditionExpression="attribute_not_exists(short_code)",
            )
            host = event.get("requestContext", {}).get("domainName", "")
            stage = event.get("requestContext", {}).get("stage", "")
            short_url = f"https://{host}/{stage}/{code}" if host else code
            return response(201, {"short_code": code, "short_url": short_url})
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                continue
            print(f"DynamoDB error: {e}")
            return response(500, {"error": "Internal error"})

    return response(500, {"error": "Could not generate unique code"})