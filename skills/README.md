# better-result Skills

Portable `SKILL.md` skills for adopting and migrating `better-result` in SKILL.md-compatible agents.

## Available Skills

- `better-result-adopt` — adopt `better-result` in an existing codebase
- `better-result-migrate-v2` — migrate v1 `TaggedError` usage to the v2 API

## Install with skills.sh-compatible tooling

```sh
npx skills add dmmulroy/better-result@better-result-adopt
npx skills add dmmulroy/better-result@better-result-migrate-v2
```

To install globally without prompts:

```sh
npx skills add dmmulroy/better-result@better-result-adopt -g -y
```

## Manual Installation

Copy a skill directory into your agent's configured skills folder:

- `skills/better-result-adopt/`
- `skills/better-result-migrate-v2/`

Each skill is self-contained and uses standard `SKILL.md` frontmatter plus optional `references/` files.

## Optional Source Context

For richer AI context in a consuming project, fetch the library source with:

```sh
npx opensrc better-result
```
