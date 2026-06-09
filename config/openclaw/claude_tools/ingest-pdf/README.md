# ingest-pdf — Claude Code MCP server

PDF → RAG ingester for the All-In-Wonder stack, exposed as a Model Context
Protocol stdio tool (`ingest_pdf`) so the OpenClaw **claude-cli** backend can use
it. It is the Claude Code port of the OpenClaw plugin in
`config/openclaw/plugins/ingest-pdf` — identical business logic (unpdf text
extraction, js-tiktoken chunking, embedding, PostgREST inserts into
`rag_documents` / `rag_chunks`), only the wrapper differs.

## How it is wired

- Mounted read-only into `openclaw-gateway` / `openclaw-cli` at
  `/home/node/.claude-tools/ingest-pdf` (see `compose.yml`).
- Registered for Claude Code at user scope by `config/scripts/start/openclaw.sh`
  when `OPENCLAW_ENABLE_CLAUDE_CLI=1`:
  `claude mcp add-json -s user ingest-pdf '{"type":"stdio","command":"node","args":["/home/node/.claude-tools/ingest-pdf/dist/index.mjs"]}'`.
- Runs inside the gateway, inheriting `POSTGREST_API_KEY`, `POSTGREST_URL`,
  `OPENCODE_EMBEDDING_HOST`/`MODEL`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, and
  `OPENCLAW_WORKSPACE_DIR` from the `claude` process env.

## Build

`./build.sh` produces the committed, self-contained `dist/index.mjs`. Rebuild
after editing `src/index.ts`. `src/index.ts` was derived from the OpenClaw plugin
(`../../plugins/ingest-pdf/src/index.ts`) by a one-shot transform that swapped the
wrapper only — the `typebox`/`defineToolPlugin` imports, the parameter schema
(typebox → JSON Schema), and the entrypoint (`defineToolPlugin` export → MCP stdio
server). Keep the shared business logic in sync with that plugin by hand.
