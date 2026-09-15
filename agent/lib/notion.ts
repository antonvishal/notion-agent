import { connectNotionAdapter } from "@vercel/connect/chat";

export async function resolveNotionToken(): Promise<string> {
  const connectorId = process.env.NOTION_CONNECTOR_ID?.trim();
  if (!connectorId) {
    throw new Error("NOTION_CONNECTOR_ID is required.");
  }

  return connectNotionAdapter(connectorId).token();
}
