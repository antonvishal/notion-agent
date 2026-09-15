# Contributing

Thanks for improving the Notion page command agent.

## Before you start

- Open an issue before making a large behavioral or architectural change.
- Do not use real credentials, private Notion content, or authenticated browser data in examples, fixtures, issues, or pull requests.
- Keep the browser read-only. Changes that add form submission, purchases, messages, or other website mutations are outside this project's current safety model.

## Local workflow

Fork the repository, create a focused branch, and install the locked dependencies:

```bash
git clone https://github.com/YOUR_USERNAME/notion-agent.git
cd notion-agent
bun install --frozen-lockfile
```

Copy `.env.example` to `.env.local` only when you need to run an integration locally. See the README for each variable.

Before opening a pull request, run:

```bash
bun run typecheck
bun run build
```

Keep pull requests small. Explain the user-visible behavior, security impact, and how you tested it. Include logs or screenshots only after removing IDs, tokens, page content, cookies, and URLs that reveal private accounts.

## Project layout

- `agent/channels/` receives Notion events and enforces the user allowlist.
- `agent/connections/` limits the Notion API operations available to the model.
- `agent/tools/` contains browser and typed Notion operations.
- `agent/lib/` manages Browserbase sessions, downloads, and shared helpers.
- `agent/instructions.md` defines the runtime policy the model follows.

By contributing, you agree that your contribution is licensed under the MIT License.
