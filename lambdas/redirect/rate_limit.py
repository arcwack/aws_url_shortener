import time


class RateLimiter:
    def __init__(self, table, max_failures=3, lock_seconds=30, ttl_seconds=60):
        self.table = table
        self.max_failures = max_failures
        self.lock_seconds = lock_seconds
        self.ttl_seconds = ttl_seconds

    @staticmethod
    def _key(short_code, ip):
        return {"short_code": short_code, "ip": ip}

    def _get(self, short_code, ip):
        return self.table.get_item(Key=self._key(short_code, ip)).get("Item")

    def lock_remaining(self, short_code, ip):
        item = self._get(short_code, ip)
        if not item:
            return 0

        now = int(time.time())
        locked_until = int(item.get("locked_until") or 0)
        if locked_until > now:
            return locked_until - now

        if locked_until:
            self.reset(short_code, ip)
        return 0

    def record_failure(self, short_code, ip):
        now = int(time.time())
        result = self.table.update_item(
            Key=self._key(short_code, ip),
            UpdateExpression="ADD failure_count :one SET updated_at = :now, expires_at = :ttl",
            ExpressionAttributeValues={
                ":one": 1,
                ":now": now,
                ":ttl": now + self.ttl_seconds,
            },
            ReturnValues="UPDATED_NEW",
        )
        count = int((result.get("Attributes") or {}).get("failure_count") or 1)
        locked_until = 0

        if count >= self.max_failures:
            locked_until = now + self.lock_seconds
            self.table.update_item(
                Key=self._key(short_code, ip),
                UpdateExpression="SET locked_until = :until, expires_at = :ttl",
                ExpressionAttributeValues={
                    ":until": locked_until,
                    ":ttl": locked_until + self.ttl_seconds,
                },
            )

        return count, locked_until

    def reset(self, short_code, ip):
        self.table.delete_item(Key=self._key(short_code, ip))

    def reset_all(self, short_code):
        kwargs = {
            "KeyConditionExpression": "short_code = :code",
            "ExpressionAttributeValues": {":code": short_code},
            "ProjectionExpression": "short_code, ip",
        }

        while True:
            response = self.table.query(**kwargs)
            for item in response.get("Items", []):
                self.table.delete_item(
                    Key={"short_code": item["short_code"], "ip": item["ip"]}
                )
            if "LastEvaluatedKey" not in response:
                break
            kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
