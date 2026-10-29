import base64
import json
import os
import time
from datetime import datetime, timezone
from urllib.parse import parse_qs
from zoneinfo import ZoneInfo

import boto3
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ.get("TABLE_NAME", "URLs"))

sqs = boto3.client("sqs")
CLICK_QUEUE_URL = os.environ.get(
    "CLICK_QUEUE_URL",
    "https://sqs.ap-south-1.amazonaws.com/460047017901/ClickQueue-DLQ",
)

DEBUG_OVERRIDES = os.environ.get("DEBUG_OVERRIDES", "").lower() in {"1", "true", "yes"}
DEFAULT_TIMEZONE = os.environ.get("DEFAULT_TIMEZONE", "Asia/Kolkata")
DEMO_FORCE_TIME = os.environ.get("DEMO_FORCE_TIME", "").strip()
SUPPORTED_RULES = {"schedule"}


def _json_response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"},
        "body": json.dumps(body),
    }


def _query_params(event):
    params = event.get("queryStringParameters") or {}
    if params:
        return params
    raw = event.get("rawQueryString") or ""
    return {key: values[-1] for key, values in parse_qs(raw).items()}


def _timezone(config):
    try:
        return ZoneInfo(config.get("timezone") or DEFAULT_TIMEZONE)
    except Exception:
        return timezone.utc


def _parse_time(raw, tz):
    parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=tz)
    return parsed.astimezone(tz)


def _now(config, event):
    tz = _timezone(config)
    raw = _query_params(event).get("simulate_time")
    if raw and (DEBUG_OVERRIDES or event.get("_allow_simulate")):
        try:
            return _parse_time(raw, tz)
        except ValueError:
            print(f"Ignoring invalid simulate_time={raw!r}")

    if DEMO_FORCE_TIME:
        try:
            return _parse_time(DEMO_FORCE_TIME, tz)
        except ValueError:
            print(f"Ignoring invalid DEMO_FORCE_TIME={DEMO_FORCE_TIME!r}")

    return datetime.now(tz)


def resolve_schedule(config, event):
    now = _now(config, event)
    if now.weekday() < 5:
        return config.get("weekday_url")
    return config.get("weekend_url")


RULES = {"schedule": resolve_schedule}


def _valid_url(value):
    return isinstance(value, str) and value.startswith(("http://", "https://"))


def resolve_target(item, event):
    config = item.get("redirect_config") or {}
    rule_type = config.get("type")
    handler = RULES.get(rule_type)

    if not handler:
        return item.get("original_url", ""), "original"

    try:
        target = handler(config, event)
    except Exception as exc:
        print(f"Rule {rule_type} failed: {exc}")
        return item.get("original_url", ""), "fallback"

    if not _valid_url(target):
        return item.get("original_url", ""), "fallback"

    return target, rule_type


def _short_code(event):
    return (event.get("pathParameters") or {}).get("short_code") or (
        event.get("rawPath") or ""
    ).strip("/")


def _short_url(event, code):
    host = (event.get("requestContext") or {}).get("domainName", "")
    return f"https://{host}/{code}" if host else code


def _load_item(code):
    return table.get_item(Key={"short_code": code}).get("Item")


def _is_expired(item):
    expires_at = item.get("expires_at")
    return expires_at is not None and int(expires_at) < int(time.time())


def _parse_body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    return json.loads(raw)


def _clean_schedule_config(raw):
    if not isinstance(raw, dict):
        raise ValueError("redirect_config must be an object")

    rule_type = raw.get("type")
    if rule_type not in SUPPORTED_RULES:
        raise ValueError("Only schedule rules are supported right now")

    tz_name = raw.get("timezone") or DEFAULT_TIMEZONE
    if not isinstance(tz_name, str):
        raise ValueError("timezone must be a string")

    try:
        ZoneInfo(tz_name)
    except Exception:
        raise ValueError(f"Unknown timezone: {tz_name}")

    weekday_url = raw.get("weekday_url")
    weekend_url = raw.get("weekend_url")
    if not _valid_url(weekday_url):
        raise ValueError("weekday_url must be an http(s) URL")
    if not _valid_url(weekend_url):
        raise ValueError("weekend_url must be an http(s) URL")

    return {
        "type": "schedule",
        "timezone": tz_name,
        "weekday_url": weekday_url,
        "weekend_url": weekend_url,
    }


def _handle_get_rules(event):
    code = _short_code(event)
    if not code:
        return _json_response(400, {"error": "Missing short code"})

    try:
        item = _load_item(code)
    except ClientError as exc:
        print(f"DynamoDB error: {exc}")
        return _json_response(500, {"error": "Internal error"})

    if not item or _is_expired(item):
        return _json_response(404, {"error": "Short link not found or expired"})

    return _json_response(
        200,
        {
            "short_code": code,
            "short_url": _short_url(event, code),
            "original_url": item.get("original_url"),
            "redirect_config": item.get("redirect_config"),
        },
    )


def _handle_put_rules(event):
    code = _short_code(event)
    if not code:
        return _json_response(400, {"error": "Missing short code"})

    try:
        body = _parse_body(event)
        config = _clean_schedule_config(body.get("redirect_config"))
    except (ValueError, json.JSONDecodeError) as exc:
        return _json_response(400, {"error": str(exc)})

    try:
        result = table.update_item(
            Key={"short_code": code},
            UpdateExpression="SET redirect_config = :config, updated_at = :updated_at",
            ConditionExpression="attribute_exists(short_code)",
            ExpressionAttributeValues={
                ":config": config,
                ":updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
            ReturnValues="ALL_NEW",
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return _json_response(404, {"error": "Short link not found"})
        print(f"DynamoDB error: {exc}")
        return _json_response(500, {"error": "Internal error"})

    attributes = result.get("Attributes") or {}
    return _json_response(
        200,
        {
            "short_code": code,
            "short_url": _short_url(event, code),
            "original_url": attributes.get("original_url"),
            "redirect_config": config,
        },
    )


def _handle_preview(event):
    code = _short_code(event)
    if not code:
        return _json_response(400, {"error": "Missing short code"})

    try:
        item = _load_item(code)
    except ClientError as exc:
        print(f"DynamoDB error: {exc}")
        return _json_response(500, {"error": "Internal error"})

    if not item or _is_expired(item):
        return _json_response(404, {"error": "Short link not found or expired"})

    config = item.get("redirect_config") or {}
    preview_event = {**event, "_allow_simulate": True}
    target, rule = resolve_target(item, preview_event)
    tz = _timezone(config)
    evaluated = _now(config, preview_event)
    params = _query_params(event)

    simulate_raw = params.get("simulate_time")
    simulate_applied = False
    if simulate_raw:
        try:
            _parse_time(simulate_raw, tz)
            simulate_applied = True
        except ValueError:
            simulate_applied = False

    return _json_response(
        200,
        {
            "short_code": code,
            "short_url": _short_url(event, code),
            "destination": target,
            "matched_rule": rule,
            "original_url": item.get("original_url"),
            "redirect_config": config or None,
            "evaluated_at": evaluated.isoformat(),
            "timezone": str(tz),
            "day": evaluated.strftime("%A"),
            "is_weekend": evaluated.weekday() >= 5,
            "simulate_time": simulate_raw,
            "simulate_time_applied": simulate_applied,
            "demo_forced": bool(DEMO_FORCE_TIME and not simulate_applied),
            "demo_force_time": DEMO_FORCE_TIME or None,
        },
    )


def _publish_click(event, code, target, rule):
    request_context = event.get("requestContext") or {}
    http_data = request_context.get("http") or {}
    headers = {str(k).lower(): (v or "") for k, v in (event.get("headers") or {}).items()}

    payload = {
        "short_code": code,
        "ip_address": http_data.get("sourceIp", "unknown"),
        "user_agent": http_data.get("userAgent") or headers.get("user-agent", "unknown"),
        "timestamp": request_context.get("timeEpoch", int(time.time() * 1000)),
        "matched_rule": rule,
        "destination": target,
        "accept_language": headers.get("accept-language", ""),
        "country": headers.get("cloudfront-viewer-country", ""),
        "simulate_time": _query_params(event).get("simulate_time", ""),
    }

    try:
        sqs.send_message(QueueUrl=CLICK_QUEUE_URL, MessageBody=json.dumps(payload))
    except Exception as exc:
        print(f"Failed to publish click event: {exc}")


def _handle_redirect(event):
    code = _short_code(event)
    if not code:
        return {"statusCode": 400, "body": "Missing short code"}

    try:
        item = _load_item(code)
    except ClientError as exc:
        print(f"DynamoDB error: {exc}")
        return {"statusCode": 500, "body": "Internal error"}

    if not item:
        return {"statusCode": 404, "body": "Short link not found"}

    # TTL deletion can lag by up to 48h, so enforce expiry when it is set
    if _is_expired(item):
        return {"statusCode": 404, "body": "Short link not found or expired"}

    target, rule = resolve_target(item, event)
    if not _valid_url(target):
        return {"statusCode": 404, "body": "Short link has no valid destination"}

    _publish_click(event, code, target, rule)

    return {
        "statusCode": 302,
        "headers": {
            "Location": target,
            "Cache-Control": "no-store",
            "X-Redirect-Rule": rule,
        },
        "body": "",
    }


def lambda_handler(event, context):
    route = event.get("routeKey") or ""

    if route == "GET /links/{short_code}/rules":
        return _handle_get_rules(event)
    if route == "PUT /links/{short_code}/rules":
        return _handle_put_rules(event)
    if route == "GET /resolve/{short_code}":
        return _handle_preview(event)

    return _handle_redirect(event)
