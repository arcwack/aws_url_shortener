import base64
import hmac
import json
import os
import time
from datetime import datetime, timezone
from urllib.parse import parse_qs
from zoneinfo import ZoneInfo

import boto3
from botocore.exceptions import ClientError

import passwords
import rate_limit

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
UNLOCK_COOKIE_SECRET = os.environ.get("UNLOCK_COOKIE_SECRET", "")
try:
    UNLOCK_TTL_SECONDS = int(os.environ.get("UNLOCK_TTL_SECONDS", "3600"))
except ValueError:
    UNLOCK_TTL_SECONDS = 3600

RATE_LIMIT_TABLE = os.environ.get("RATE_LIMIT_TABLE", "UnlockRateLimits")
try:
    RATE_LIMIT_MAX = int(os.environ.get("RATE_LIMIT_MAX", "3"))
except ValueError:
    RATE_LIMIT_MAX = 3
try:
    RATE_LIMIT_LOCK_SECONDS = int(os.environ.get("RATE_LIMIT_LOCK_SECONDS", "30"))
except ValueError:
    RATE_LIMIT_LOCK_SECONDS = 30

LAB_DEMO_CODE = os.environ.get("LAB_DEMO_CODE", "labdemo")
LAB_ADMIN_KEY = os.environ.get("LAB_ADMIN_KEY", "")
LAB_WEAK_PASSWORD = "welcome1"

rate_limit_table = dynamodb.Table(RATE_LIMIT_TABLE)
rate_limiter = rate_limit.RateLimiter(
    rate_limit_table,
    max_failures=RATE_LIMIT_MAX,
    lock_seconds=RATE_LIMIT_LOCK_SECONDS,
)
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


def _html_response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
        },
        "body": body,
    }


def _headers(event):
    return {str(key).lower(): (value or "") for key, value in (event.get("headers") or {}).items()}


def _parse_body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    return json.loads(raw)


def _parse_form_body(event):
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    return {key: values[-1] for key, values in parse_qs(raw).items()}


def _password_page(event, code, error=None):
    raw_query = event.get("rawQueryString") or ""
    action = f"/{code}/unlock" + (f"?{raw_query}" if raw_query else "")
    return passwords.render_password_page(code, action, error)


def _has_unlock_cookie(event, code, item):
    if not UNLOCK_COOKIE_SECRET:
        return False
    return passwords.verify_unlock_cookie(
        event,
        code,
        passwords.password_version(item),
        UNLOCK_COOKIE_SECRET,
    )


def _client_ip(event):
    http_data = (event.get("requestContext") or {}).get("http") or {}
    source_ip = http_data.get("sourceIp")
    if source_ip:
        return source_ip
    forwarded = _headers(event).get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or "unknown"


def _admin_ok(event):
    provided = _headers(event).get("x-admin-key", "")
    return bool(LAB_ADMIN_KEY and provided and hmac.compare_digest(provided, LAB_ADMIN_KEY))


def _rate_limit_enabled(code, item):
    if code == LAB_DEMO_CODE:
        return bool(item.get("rate_limit_enabled", False))
    return True


def _lab_status_payload(event, item):
    return {
        "code": LAB_DEMO_CODE,
        "short_url": _short_url(event, LAB_DEMO_CODE),
        "protection_enabled": bool(item.get("rate_limit_enabled", False)),
        "password_protected": bool(item.get("password_hash")),
        "max_failures": RATE_LIMIT_MAX,
        "lock_seconds": RATE_LIMIT_LOCK_SECONDS,
    }


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
            "password_protected": bool(item.get("password_hash")),
        },
    )


def _handle_set_password(event):
    code = _short_code(event)
    if not code:
        return _json_response(400, {"error": "Missing short code"})

    try:
        body = _parse_body(event)
        password_hash = passwords.hash_password(body.get("password"))
    except (ValueError, json.JSONDecodeError) as exc:
        return _json_response(400, {"error": str(exc)})

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    try:
        table.update_item(
            Key={"short_code": code},
            UpdateExpression=(
                "SET password_hash = :hash, password_version = :version, "
                "password_updated_at = :updated_at"
            ),
            ConditionExpression="attribute_exists(short_code)",
            ExpressionAttributeValues={
                ":hash": password_hash,
                ":version": now,
                ":updated_at": now,
            },
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return _json_response(404, {"error": "Short link not found"})
        print(f"DynamoDB error: {exc}")
        return _json_response(500, {"error": "Internal error"})

    return _json_response(
        200,
        {
            "short_code": code,
            "short_url": _short_url(event, code),
            "password_protected": True,
        },
    )


def _handle_remove_password(event):
    code = _short_code(event)
    if not code:
        return _json_response(400, {"error": "Missing short code"})

    try:
        table.update_item(
            Key={"short_code": code},
            UpdateExpression="REMOVE password_hash, password_version, password_updated_at",
            ConditionExpression="attribute_exists(short_code)",
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return _json_response(404, {"error": "Short link not found"})
        print(f"DynamoDB error: {exc}")
        return _json_response(500, {"error": "Internal error"})

    return _json_response(
        200,
        {
            "short_code": code,
            "short_url": _short_url(event, code),
            "password_protected": False,
        },
    )


def _handle_unlock(event):
    code = _short_code(event)
    if not code:
        return _html_response(400, "Missing short code")

    try:
        item = _load_item(code)
    except ClientError as exc:
        print(f"DynamoDB error: {exc}")
        return _html_response(500, "Internal error")

    if not item or _is_expired(item):
        return _html_response(404, "Short link not found or expired")

    stored = item.get("password_hash")
    if not stored:
        return _html_response(400, _password_page(event, code, "This link is not password protected."))

    try:
        form = _parse_form_body(event)
    except Exception:
        form = {}

    ip = _client_ip(event)
    limited = _rate_limit_enabled(code, item)

    if limited:
        try:
            retry_after = rate_limiter.lock_remaining(code, ip)
        except ClientError as exc:
            print(f"Rate limit read failed: {exc}")
            return _html_response(500, "Security check unavailable")

        if retry_after > 0:
            response = _html_response(
                429,
                _password_page(
                    event,
                    code,
                    f"Too many attempts. Try again in {retry_after} seconds.",
                ),
            )
            response["headers"]["Retry-After"] = str(retry_after)
            return response

    if not passwords.verify_password(form.get("password", ""), stored):
        if limited:
            try:
                rate_limiter.record_failure(code, ip)
            except ClientError as exc:
                print(f"Rate limit write failed: {exc}")
                return _html_response(500, "Security check unavailable")
        time.sleep(0.25)
        return _html_response(401, _password_page(event, code, "Incorrect password. Try again."))

    if limited:
        try:
            rate_limiter.reset(code, ip)
        except ClientError as exc:
            print(f"Rate limit reset failed: {exc}")

    target, rule = resolve_target(item, event)
    if not _valid_url(target):
        return _html_response(404, "Short link has no valid destination")

    if not UNLOCK_COOKIE_SECRET:
        print("UNLOCK_COOKIE_SECRET is not configured")
        return _html_response(500, "Unlock is not configured")

    cookie = passwords.make_unlock_cookie(
        code,
        passwords.password_version(item),
        UNLOCK_COOKIE_SECRET,
        UNLOCK_TTL_SECONDS,
    )
    _publish_click(event, code, target, rule)

    return {
        "statusCode": 302,
        "headers": {
            "Location": target,
            "Cache-Control": "no-store",
            "X-Redirect-Rule": rule,
        },
        "cookies": [cookie],
        "body": "",
    }


def _handle_lab_status(event):
    if not _admin_ok(event):
        return _json_response(401, {"error": "Admin key required"})

    try:
        item = _load_item(LAB_DEMO_CODE)
    except ClientError as exc:
        print(f"DynamoDB error: {exc}")
        return _json_response(500, {"error": "Internal error"})

    if not item or _is_expired(item):
        return _json_response(404, {"error": "labdemo is not seeded or has expired"})

    return _json_response(200, _lab_status_payload(event, item))


def _handle_lab_protection(event):
    if not _admin_ok(event):
        return _json_response(401, {"error": "Admin key required"})

    try:
        body = _parse_body(event)
        enabled = body.get("enabled")
        if not isinstance(enabled, bool):
            raise ValueError("enabled must be true or false")
    except (ValueError, json.JSONDecodeError) as exc:
        return _json_response(400, {"error": str(exc)})

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    try:
        result = table.update_item(
            Key={"short_code": LAB_DEMO_CODE},
            UpdateExpression="SET rate_limit_enabled = :enabled, updated_at = :now",
            ConditionExpression="attribute_exists(short_code)",
            ExpressionAttributeValues={":enabled": enabled, ":now": now},
            ReturnValues="ALL_NEW",
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return _json_response(404, {"error": "labdemo is not seeded"})
        print(f"DynamoDB error: {exc}")
        return _json_response(500, {"error": "Internal error"})

    if enabled:
        try:
            rate_limiter.reset_all(LAB_DEMO_CODE)
        except ClientError as exc:
            print(f"Rate limit reset failed: {exc}")
            return _json_response(500, {"error": "Could not reset lab rate limits"})

    item = result.get("Attributes") or {}
    return _json_response(200, _lab_status_payload(event, item))


def _handle_lab_attempt(event):
    if not _admin_ok(event):
        return _json_response(401, {"error": "Admin key required"})

    try:
        item = _load_item(LAB_DEMO_CODE)
    except ClientError as exc:
        print(f"DynamoDB error: {exc}")
        return _json_response(500, {"error": "Internal error"})

    if not item or _is_expired(item):
        return _json_response(404, {"error": "labdemo is not seeded or has expired"})

    stored = item.get("password_hash")
    if not stored:
        return _json_response(400, {"error": "labdemo has no password set"})

    try:
        body = _parse_body(event)
        password = body.get("password")
        if not isinstance(password, str):
            raise ValueError("password must be a string")
    except (ValueError, json.JSONDecodeError) as exc:
        return _json_response(400, {"error": str(exc)})

    ip = _client_ip(event)
    limited = bool(item.get("rate_limit_enabled", False))

    if limited:
        try:
            retry_after = rate_limiter.lock_remaining(LAB_DEMO_CODE, ip)
        except ClientError as exc:
            print(f"Rate limit read failed: {exc}")
            return _json_response(500, {"error": "Rate limit check failed"})

        if retry_after > 0:
            return _json_response(
                200,
                {
                    "result": "blocked",
                    "statusCode": 429,
                    "retryAfter": retry_after,
                },
            )

    if not passwords.verify_password(password, stored):
        failures = 0
        if limited:
            try:
                failures, _ = rate_limiter.record_failure(LAB_DEMO_CODE, ip)
            except ClientError as exc:
                print(f"Rate limit write failed: {exc}")
                return _json_response(500, {"error": "Rate limit write failed"})
        return _json_response(
            200,
            {"result": "wrong", "statusCode": 401, "failures": failures},
        )

    if limited:
        try:
            rate_limiter.reset(LAB_DEMO_CODE, ip)
        except ClientError as exc:
            print(f"Rate limit reset failed: {exc}")

    return _json_response(200, {"result": "cracked", "statusCode": 302})


def _handle_lab_reset(event):
    if not _admin_ok(event):
        return _json_response(401, {"error": "Admin key required"})

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    try:
        password_hash = passwords.hash_password(LAB_WEAK_PASSWORD)
    except ValueError as exc:
        return _json_response(500, {"error": str(exc)})

    try:
        result = table.update_item(
            Key={"short_code": LAB_DEMO_CODE},
            UpdateExpression=(
                "SET password_hash = :hash, password_version = :now, "
                "password_updated_at = :now, rate_limit_enabled = :disabled, "
                "expires_at = :expires, updated_at = :now"
            ),
            ConditionExpression="attribute_exists(short_code)",
            ExpressionAttributeValues={
                ":hash": password_hash,
                ":now": now,
                ":disabled": False,
                ":expires": 2000000000,
            },
            ReturnValues="ALL_NEW",
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return _json_response(404, {"error": "labdemo is not seeded"})
        print(f"DynamoDB error: {exc}")
        return _json_response(500, {"error": "Internal error"})

    try:
        rate_limiter.reset_all(LAB_DEMO_CODE)
    except ClientError as exc:
        print(f"Rate limit reset failed: {exc}")
        return _json_response(500, {"error": "Could not reset lab rate limits"})

    item = result.get("Attributes") or {}
    return _json_response(200, _lab_status_payload(event, item))


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
            "password_protected": bool(attributes.get("password_hash")),
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
    headers = _headers(event)

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

    if item.get("password_hash") and not _has_unlock_cookie(event, code, item):
        return _html_response(200, _password_page(event, code))

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

    if route == "GET /lab/status":
        return _handle_lab_status(event)
    if route == "PUT /lab/protection":
        return _handle_lab_protection(event)
    if route == "POST /lab/attempt":
        return _handle_lab_attempt(event)
    if route == "POST /lab/reset":
        return _handle_lab_reset(event)
    if route == "POST /{short_code}/unlock":
        return _handle_unlock(event)
    if route == "PUT /links/{short_code}/password":
        return _handle_set_password(event)
    if route == "DELETE /links/{short_code}/password":
        return _handle_remove_password(event)
    if route == "GET /links/{short_code}/rules":
        return _handle_get_rules(event)
    if route == "PUT /links/{short_code}/rules":
        return _handle_put_rules(event)
    if route == "GET /resolve/{short_code}":
        return _handle_preview(event)

    return _handle_redirect(event)
