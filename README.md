# Notion page command agent

An [eve](https://eve.dev) agent that turns an allowlisted Notion comment beginning with `/run` into an authenticated, read-only browser task. It can read and update the originating Notion page, copy database values into typed properties, and attach downloaded PDFs to the page.

This project is experimental. Test it in a separate Notion workspace and Browserbase context before using it with important data.

## What it does

1. Receives a Notion `comment.created` webhook.
2. Accepts `/run` commands only from user IDs in `NOTION_ALLOWED_USER_IDS`.
3. Opens a persistent Browserbase context through Stagehand.
4. Lets the agent browse, inspect pages, and download files. Form entry and mutating HTTP methods are blocked.
5. Updates only the Notion page that originated the command, attaches up to three PDFs, replies in the same discussion, and closes the browser session.

## Requirements

- [Bun](https://bun.sh) 1.3.14 or newer
- Node.js 24
- A Vercel account with access to eve and Vercel Connect
- A [Browserbase](https://www.browserbase.com) project and persistent context
- A Notion integration shared with the pages the agent may access
- Redis for production webhook state

## Setup

### 1. Install dependencies

```bash
git clone https://github.com/AntonVishal/notion-agent.git
cd notion-agent
bun install --frozen-lockfile
```

The build copies Stagehand's browser extension from the installed package into `agent/assets/`. The generated archive is intentionally ignored by Git.

### 2. Configure Browserbase

Create a Browserbase project and a persistent browser context. Sign in to the sites the agent needs inside that context, then copy the project API key and context ID into your local environment.

Use a dedicated context with the least access needed for the tasks you plan to run. Anyone allowed to issue `/run` commands can browse with its authenticated sessions.

### 3. Configure Notion

Create a Notion integration with permission to read content, update content, insert content, and read comments. Share each page or database the agent may use with that integration.

Register the integration as an app-scoped Notion connector in Vercel Connect and save its connector ID as `NOTION_CONNECTOR_ID`. Configure Notion to send `comment.created` events to this route on your deployed or tunneled app:

```text
/eve/v1/notion
```

If your webhook configuration supplies a verification token, save it as `NOTION_VERIFICATION_TOKEN`.

### 4. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in the values that apply to your environment:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NOTION_CONNECTOR_ID` | Yes | Vercel Connect ID for the app-scoped Notion integration |
| `NOTION_ALLOWED_USER_IDS` | Yes | Comma-separated Notion user IDs allowed to issue `/run` commands |
| `BROWSERBASE_API_KEY` | Yes | Browserbase project API key |
| `BROWSERBASE_CONTEXT_ID` | Yes | Persistent authenticated browser context |
| `REDIS_URL` | Production | Durable webhook and deduplication state |
| `NOTION_VERIFICATION_TOKEN` | When configured | Validates incoming Notion webhooks |
| `VERCEL_OIDC_TOKEN` | Local Vercel access | Authenticates Vercel services during local development |
| `BLOB_READ_WRITE_TOKEN` | No | Temporary fallback when a direct Notion file upload fails |

Never commit `.env.local`. The repository ignores every `.env*` file except `.env.example`.

### 5. Run locally

```bash
bun run typecheck
bun run dev
```

Notion must be able to reach the webhook route, so local webhook testing requires a public HTTPS tunnel. Add a comment such as this to a shared page:

```text
/run Find the latest invoice, update the Amount and Status fields, and attach the PDF.
```

Only use commands that fit the read-and-download browser policy.

## Deploy to Vercel

Link the checkout to a Vercel project, configure the environment variables there, then deploy:

```bash
bunx eve link --project notion-agent --non-interactive
bunx eve deploy --project notion-agent --non-interactive --yes
```

After deployment, point the Notion webhook at `https://your-domain.example/eve/v1/notion`. The application refuses to start in production without `REDIS_URL`.

## Development

```bash
bun run typecheck  # Generate the Stagehand asset and check TypeScript
bun run build      # Create the eve deployment bundle
bun run dev        # Start the eve development UI
```

The Stagehand compatibility facade lives in `agent/lib/stagehand-facade/`. Browser sessions are also closed by completion, failure, and cancellation hooks so an interrupted turn does not leave a paid session running.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report security issues through GitHub's private vulnerability reporting flow as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
