import { connect } from "@vercel/connect/eve";
import { defineOpenAPIConnection } from "eve/connections";

const connectorId =
  process.env.NOTION_CONNECTOR_ID?.trim();

if (!connectorId) throw new Error("NOTION_CONNECTOR_ID is required.");

export default defineOpenAPIConnection({
  spec: "https://developers.notion.com/openapi.json",
  baseUrl: "https://api.notion.com",
  description:
    "App-scoped Notion workspace access for reading and editing the originating page without interactive user OAuth.",
  auth: connect({ connector: connectorId, principalType: "app" }),
  headers: () => ({ "Notion-Version": "2026-03-11" }),
  operations: {
    allow: [
      "retrieve-a-page",
      "retrieve-page-markdown",
      "update-page-markdown",
      "retrieve-a-block",
      "update-a-block",
      "delete-a-block",
      "get-block-children",
      "patch-block-children",
      "post-search",
    ],
  },
});
