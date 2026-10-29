import base64
import binascii
import hashlib
import hmac
import html
import secrets
import time
from string import Template

ALGORITHM = "pbkdf2_sha256"
ITERATIONS = 600_000
SALT_BYTES = 16
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128
MAX_ITERATIONS = 1_000_000
COOKIE_PREFIX = "snipcloud_unlock_"

_PASSWORD_PAGE = Template(
    """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Password required</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #000000;
        --card: #0a0a0a;
        --border: #262626;
        --foreground: #ededed;
        --muted: #a1a1a1;
        --brand: #3291ff;
        --destructive: #f87171;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100dvh;
        display: grid;
        place-items: center;
        background: var(--bg);
        color: var(--foreground);
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }
      main {
        width: 100%;
        max-width: 26rem;
        padding: 3rem 1.5rem;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        border: 1px solid rgb(50 145 255 / 0.35);
        background: rgb(50 145 255 / 0.1);
        color: var(--brand);
        border-radius: 999px;
        padding: 0.35rem 0.75rem;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .dot {
        width: 0.4rem;
        height: 0.4rem;
        border-radius: 999px;
        background: var(--brand);
      }
      h1 {
        margin: 1.25rem 0 0.5rem;
        font-size: 1.8rem;
        letter-spacing: -0.04em;
        line-height: 1.1;
      }
      p {
        margin: 0;
        color: var(--muted);
        font-size: 0.9rem;
        line-height: 1.6;
      }
      .code {
        margin-top: 0.75rem;
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        font-size: 0.75rem;
        color: #666666;
      }
      form {
        margin-top: 1.5rem;
        border: 1px solid var(--border);
        border-radius: 0.85rem;
        background: var(--card);
        padding: 1rem;
      }
      label {
        display: block;
        margin-bottom: 0.5rem;
        font-size: 0.8rem;
        font-weight: 600;
      }
      input {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 0.5rem;
        background: var(--bg);
        color: var(--foreground);
        padding: 0.7rem 0.75rem;
        font-size: 0.95rem;
        outline: none;
      }
      input:focus {
        border-color: var(--brand);
      }
      button {
        width: 100%;
        margin-top: 0.85rem;
        border: 0;
        border-radius: 0.5rem;
        background: var(--foreground);
        color: var(--bg);
        padding: 0.7rem 0.75rem;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
      }
      button:hover {
        opacity: 0.9;
      }
      .error {
        margin-top: 0.75rem;
        border: 1px solid rgb(248 113 113 / 0.35);
        background: rgb(248 113 113 / 0.1);
        color: var(--destructive);
        border-radius: 0.5rem;
        padding: 0.55rem 0.7rem;
        font-size: 0.8rem;
      }
      footer {
        margin-top: 1.5rem;
        color: #666666;
        font-size: 0.7rem;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <main>
      <span class="badge"><span class="dot" aria-hidden="true"></span>Password protected</span>
      <h1>This link is locked</h1>
      <p>Enter the password to continue to the destination.</p>
      <p class="code">$code</p>

      <form method="post" action="$action">
        <label for="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          autofocus
          required
          minlength="$min_length"
          maxlength="$max_length"
        />
        $error
        <button type="submit">Unlock link</button>
      </form>

      <footer>Protected by the SnipCloud Smart Rules demo.</footer>
    </main>
  </body>
</html>
"""
)


def validate_password(password):
    if not isinstance(password, str):
        raise ValueError("Password must be a string")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Use at least {MIN_PASSWORD_LENGTH} characters")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ValueError(f"Use at most {MAX_PASSWORD_LENGTH} characters")
    if not password.strip():
        raise ValueError("Password cannot be blank")
    return password


def hash_password(password):
    validate_password(password)
    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS)
    return (
        f"{ALGORITHM}${ITERATIONS}$"
        f"{base64.b64encode(salt).decode('ascii')}$"
        f"{base64.b64encode(digest).decode('ascii')}"
    )


def verify_password(password, stored):
    if not isinstance(password, str) or not isinstance(stored, str):
        return False
    if len(password) > MAX_PASSWORD_LENGTH:
        return False

    try:
        algorithm, iterations_raw, salt_raw, digest_raw = stored.split("$", 3)
        iterations = int(iterations_raw)
        if algorithm != ALGORITHM or iterations < 1 or iterations > MAX_ITERATIONS:
            return False
        salt = base64.b64decode(salt_raw.encode("ascii"), validate=True)
        expected = base64.b64decode(digest_raw.encode("ascii"), validate=True)
    except (ValueError, TypeError, binascii.Error):
        return False

    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


def password_version(item):
    return str(item.get("password_version") or item.get("password_updated_at") or "")


def make_unlock_cookie(code, version, secret, ttl_seconds=3600, now=None):
    current = int(now if now is not None else time.time())
    expiry = current + ttl_seconds
    message = f"{code}:{version}:{expiry}".encode("utf-8")
    signature = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    value = f"{expiry}.{signature}"
    return (
        f"{COOKIE_PREFIX}{code}={value}; Max-Age={ttl_seconds}; "
        "Path=/; HttpOnly; Secure; SameSite=Lax"
    )


def _find_cookie(event, name):
    prefix = f"{name}="
    for cookie in event.get("cookies") or []:
        if cookie.startswith(prefix):
            return cookie[len(prefix) :]

    headers = event.get("headers") or {}
    header = ""
    for key, value in headers.items():
        if str(key).lower() == "cookie":
            header = value or ""
            break

    for part in header.split(";"):
        part = part.strip()
        if part.startswith(prefix):
            return part[len(prefix) :]

    return None


def verify_unlock_cookie(event, code, version, secret, now=None):
    if not secret or not version:
        return False

    raw = _find_cookie(event, f"{COOKIE_PREFIX}{code}")
    if not raw:
        return False

    try:
        expiry_raw, signature = raw.split(".", 1)
        expiry = int(expiry_raw)
    except (ValueError, TypeError):
        return False

    current = int(now if now is not None else time.time())
    if expiry < current:
        return False

    message = f"{code}:{version}:{expiry}".encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


def render_password_page(code, action, error=None):
    error_block = ""
    if error:
        error_block = f'<div class="error">{html.escape(error)}</div>'
    return _PASSWORD_PAGE.substitute(
        code=html.escape(code),
        action=html.escape(action, quote=True),
        error=error_block,
        min_length=MIN_PASSWORD_LENGTH,
        max_length=MAX_PASSWORD_LENGTH,
    )
