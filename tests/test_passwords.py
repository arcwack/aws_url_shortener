import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lambdas" / "redirect"))

import passwords  # noqa: E402


class PasswordHashingTests(unittest.TestCase):
    def test_hash_and_verify(self):
        stored = passwords.hash_password("secret123")
        self.assertTrue(stored.startswith("pbkdf2_sha256$600000$"))
        self.assertTrue(passwords.verify_password("secret123", stored))
        self.assertFalse(passwords.verify_password("secret124", stored))

    def test_rejects_short_password(self):
        with self.assertRaises(ValueError):
            passwords.hash_password("short")

    def test_rejects_malformed_hash(self):
        self.assertFalse(passwords.verify_password("secret123", "not-a-hash"))
        self.assertFalse(passwords.verify_password("secret123", "md5$1$abc$def"))

    def test_rejects_oversized_iterations(self):
        stored = "pbkdf2_sha256$9999999$c2FsdA==$ZGlnZXN0"
        self.assertFalse(passwords.verify_password("secret123", stored))


class UnlockCookieTests(unittest.TestCase):
    def test_cookie_round_trip(self):
        cookie = passwords.make_unlock_cookie(
            "abc1234", "v1", "test-secret", ttl_seconds=60, now=1000
        )
        event = {"cookies": [cookie.split(";")[0]]}
        self.assertTrue(
            passwords.verify_unlock_cookie(event, "abc1234", "v1", "test-secret", now=1001)
        )

    def test_cookie_expiry(self):
        cookie = passwords.make_unlock_cookie(
            "abc1234", "v1", "test-secret", ttl_seconds=60, now=1000
        )
        event = {"cookies": [cookie.split(";")[0]]}
        self.assertFalse(
            passwords.verify_unlock_cookie(event, "abc1234", "v1", "test-secret", now=1061)
        )

    def test_cookie_version_change_invalidates(self):
        cookie = passwords.make_unlock_cookie(
            "abc1234", "v1", "test-secret", ttl_seconds=60, now=1000
        )
        event = {"cookies": [cookie.split(";")[0]]}
        self.assertFalse(
            passwords.verify_unlock_cookie(event, "abc1234", "v2", "test-secret", now=1001)
        )

    def test_cookie_tamper_rejected(self):
        cookie = passwords.make_unlock_cookie(
            "abc1234", "v1", "test-secret", ttl_seconds=60, now=1000
        )
        name, value = cookie.split(";")[0].split("=", 1)
        tampered = value[:-1] + ("0" if value[-1] != "0" else "1")
        event = {"cookies": [f"{name}={tampered}"]}
        self.assertFalse(
            passwords.verify_unlock_cookie(event, "abc1234", "v1", "test-secret", now=1001)
        )


if __name__ == "__main__":
    unittest.main()
