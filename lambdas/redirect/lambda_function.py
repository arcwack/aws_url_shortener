import json
import os
import time

import boto3
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ.get("TABLE_NAME", "URLs"))


def lambda_handler(event, context):
    code = (event.get("pathParameters") or {}).get("short_code", "")

    if not code:
        return {"statusCode": 400, "body": "Missing short code"}

    try:
        result = table.get_item(Key={"short_code": code})
    except ClientError as e:
        print(f"DynamoDB error: {e}")
        return {"statusCode": 500, "body": "Internal error"}

    item = result.get("Item")

    # TTL deletion can lag by up to 48h, so check expiry ourselves too
    if not item or int(item.get("expires_at", 0)) < int(time.time()):
        return {"statusCode": 404, "body": "Short link not found or expired"}

    return {
        "statusCode": 302,
        "headers": {
            "Location": item["original_url"],
            "Cache-Control": "no-store",
        },
        "body": "",
    }