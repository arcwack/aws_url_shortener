import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME || "Analytics";
const TIMEZONE = process.env.TIMEZONE || "Asia/Kolkata";

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const dateParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayLabel = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  weekday: "short",
});

function toMillis(value) {
  const raw = String(value ?? "");
  if (/^\d+$/.test(raw)) return Number(raw);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIso(value) {
  const ms = toMillis(value);
  return ms === null ? String(value ?? "") : new Date(ms).toISOString();
}

function dayKey(date) {
  const parts = dateParts.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function deviceFromUserAgent(userAgent) {
  const ua = String(userAgent ?? "").toLowerCase();
  if (/ipad|tablet/.test(ua)) return "Tablet";
  if (/mobile|iphone|android/.test(ua)) return "Mobile";
  return "Desktop";
}

function buildDaily(items) {
  const now = Date.now();
  const days = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now - offset * 86_400_000);
    days.push({ date: dayKey(date), label: dayLabel.format(date), clicks: 0 });
  }

  const byDate = new Map(days.map((day) => [day.date, day]));

  for (const item of items) {
    const ms = toMillis(item.timestamp);
    if (ms === null) continue;
    const bucket = byDate.get(dayKey(new Date(ms)));
    if (bucket) bucket.clicks += 1;
  }

  return days;
}

export const handler = async (event) => {
  const shortCode = event.pathParameters?.short_code;
  if (!shortCode) return json(400, { error: "short_code is required" });

  try {
    const items = [];
    let lastKey;

    do {
      const response = await client.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: "short_code = :code",
          ExpressionAttributeValues: { ":code": shortCode },
          ScanIndexForward: false,
          ExclusiveStartKey: lastKey,
        }),
      );
      items.push(...(response.Items || []));
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    const uniqueVisitors = new Set(
      items
        .map((item) => String(item.ip_address || ""))
        .filter((ip) => ip && ip !== "unknown"),
    ).size;

    const ruleCounts = new Map();
    for (const item of items) {
      const rule = String(item.matched_rule || "original");
      ruleCounts.set(rule, (ruleCounts.get(rule) || 0) + 1);
    }

    let topRule = "—";
    let topCount = 0;
    for (const [rule, count] of ruleCounts) {
      if (count > topCount) {
        topRule = rule;
        topCount = count;
      }
    }

    const timestamps = items
      .map((item) => toMillis(item.timestamp))
      .filter((ms) => ms !== null);
    const lastClick = timestamps.length
      ? new Date(Math.max(...timestamps)).toISOString()
      : null;

    const recent = items.slice(0, 10).map((item) => ({
      id: String(item.click_id || `${item.short_code}:${item.timestamp}`),
      timestamp: toIso(item.timestamp),
      country: String(item.country || "Unknown"),
      device: deviceFromUserAgent(item.user_agent),
      matchedRule: String(item.matched_rule || "original"),
      destination: String(item.destination || "unknown"),
    }));

    return json(200, {
      code: shortCode,
      totalClicks: items.length,
      uniqueVisitors,
      topRule,
      lastClick,
      daily: buildDaily(items),
      recent,
    });
  } catch (err) {
    console.error("Stats query failed:", err);
    return json(500, { error: "Could not fetch stats" });
  }
};
