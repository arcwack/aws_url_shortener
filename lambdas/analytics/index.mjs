import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "crypto";

const client = new DynamoDBClient({ region: "ap-south-1" });
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
  console.log("Processing SQS records:", JSON.stringify(event));

  const records = event.Records || [];
  for (const record of records) {
    let body = {};
    try {
      body = JSON.parse(record.body || "{}");
    } catch {
      body = { raw: record.body };
    }

    const item = {
      short_code: String(body.short_code || "unknown"),
      timestamp: String(body.timestamp || Date.now()),
      click_id: crypto.randomUUID(),
      user_agent: String(body.user_agent || "unknown"),
      ip_address: String(body.ip_address || body.ip || "unknown"),
      destination: String(body.destination || "unknown"),
      matched_rule: String(body.matched_rule || "original"),
    };

    await docClient.send(
      new PutCommand({
        TableName: "Analytics",
        Item: item,
      }),
    );

    console.log(`Saved click record for: ${item.short_code} at ${item.timestamp}`);
  }

  return { statusCode: 200, body: "Processed" };
};
