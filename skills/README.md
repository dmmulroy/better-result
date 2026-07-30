# better-result skills

Portable skills for adopting `better-result` with compatible coding agents.

## Available skills

- [`adopt-better-result`](adopt-better-result/SKILL.md) — audit repository-wide error handling and propose an adoption plan, or implement one named vertical migration slice.
- [`migrate-better-result-3`](migrate-better-result-3/SKILL.md) — migrate a TypeScript codebase from better-result 2.x to 3.0, including TaggedError syntax and validated Result codecs.

## Install

With skills.sh-compatible tooling:

```sh
npx skills add dmmulroy/better-result@adopt-better-result
npx skills add dmmulroy/better-result@migrate-better-result-3
```

For a global non-interactive installation:

```sh
npx skills add dmmulroy/better-result@adopt-better-result -g -y
npx skills add dmmulroy/better-result@migrate-better-result-3 -g -y
```

For manual installation, copy the selected directory under `skills/` into the agent's configured skills directory. Each skill is self-contained; its context pointers resolve bundled references and scripts only when needed.
