# better-result skills

Portable skills for adopting `better-result` with compatible coding agents.

## Available skill

- [`adopt-better-result`](adopt-better-result/SKILL.md) — audit repository-wide error handling and propose an adoption plan, or implement one named vertical migration slice.

## Install

With skills.sh-compatible tooling:

```sh
npx skills add dmmulroy/better-result@adopt-better-result
```

For a global non-interactive installation:

```sh
npx skills add dmmulroy/better-result@adopt-better-result -g -y
```

For manual installation, copy `skills/adopt-better-result/` into the agent's configured skills directory. The skill is self-contained; its context pointers resolve files under `references/` only when their branch needs them.
