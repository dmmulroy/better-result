# better-result documentation site

The product documentation for [better-result](https://github.com/dmmulroy/better-result), built with [Blume](https://useblume.dev/).

## Develop

Requires Node.js 22.12 or newer.

```sh
cd website
bun install
bun run dev
```

## Validate and build

```sh
bun run check
bun run build
```

The static site is written to `website/dist/`. Blume also generates page-level Markdown, `llms.txt`, and `llms-full.txt` for coding agents.

## Deploy

The site is deployed as a Cloudflare Worker with static assets and serves `better-result.dev` through a Workers route:

```sh
bun run deploy
```

Wrangler must be authenticated to the `dmmulroy` Cloudflare account. Deployment configuration lives in `wrangler.jsonc`.

## Content conventions

- Document the API shipped by the repository branch, not unreleased ideas.
- Prefer examples that show inferred `Result<Success, Error>` types.
- Use recoverable domain errors as `Err`; reserve `Panic` for defects.
- Keep headings and API names literal so humans and plain-text-searching agents can find them.
- Keep Blume-specific presentation separate from the technical contract whenever possible.
