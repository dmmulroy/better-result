# Nimbus vs. Blume for `better-result` documentation

**Research snapshot:** 2026-07-29  
**Nimbus source inspected:** [`cloudflare/nimbus@d14cddd`](https://github.com/cloudflare/nimbus/tree/d14cddd7db48277e3b36b11f06a888a9864454ad)  
**Blume source inspected:** [`haydenbleasel/blume@a015b0a`](https://github.com/haydenbleasel/blume/tree/a015b0a87d427f110155a010f85639ebb88024be)  
**Scope:** primary sources only: official sites/docs, repositories and implementation, npm metadata, licenses, releases, commits, and this repository.

## Executive summary

**Recommendation: use Blume for `better-result`, initially as a static site in an isolated `website/` project.**

Both products are Astro 7 documentation systems requiring Node 22.12+, producing static HTML by default, supporting Markdown/MDX, filesystem-derived navigation, local search, theme tokens, editable components, and agent-readable Markdown/`llms.txt`. They differ most in where they put complexity and ownership:

- **Nimbus is a scaffold-owned Astro application.** The creator copies layouts, routes, styles, and visible components into the site's repository; the package supplies integration and data plumbing. This maximizes direct control and makes the entire visible implementation inspectable, but the adopter owns a substantial app and its upgrade reconciliation. This is not merely positioning: the official starter contains the Astro config, layouts, routes, styles, and component source, while the package integration supplies MDX, Sätteri, sitemap, validation, navigation helpers, and Pagefind indexing ([starter package](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/packages/nimbus-starter-source/package.json), [integration source](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/packages/nimbus-docs/src/integration.ts), [official installation guide](https://nimbus-docs.com/installation)).
- **Blume is a content-first framework with a generated hidden Astro application.** The adopter normally owns content, `blume.config.ts`, optional `meta.ts`, `theme.css`, `components.ts`, islands, and custom pages. `blume dev/build` scans these and writes `.blume/`, which remains an implementation detail unless ejected ([official architecture explanation](https://useblume.dev/docs#how-it-works), [runtime generator](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/astro/generate.ts), [eject docs](https://useblume.dev/docs/configuration/customization#eject)). This minimizes routine site maintenance but couples the site more tightly to Blume's package and generator.

For this library, Blume's decisive advantages are not generic polish. They are concrete TypeScript-library features: Twoslash blocks, `AutoTypeTable` from TypeScript source/JSDoc, live source-backed examples, diffs, a purpose-built SDK starter, GitHub Releases as changelog content, richer local/hosted search choices, source-level validation/audit commands, and substantially broader built-in SEO/AI/i18n functionality ([syntax](https://useblume.dev/docs/content/syntax#display-types), [components](https://useblume.dev/docs/content/components#auto-type-table), [content sources](https://useblume.dev/docs/content/sources#github-releases)). Nimbus has no verified built-in TypeDoc-style API extraction, OpenAPI renderer, CMS source system, hosted MCP/Ask-AI path, or equivalent breadth at this snapshot.

The recommendation is **not** a maturity endorsement without qualification. Both projects are extremely young and maintainer-concentrated. Nimbus explicitly labels itself pre-1.0 and “work in progress”; Blume reached 1.x quickly but its changelog shows a high correction rate across generated-runtime, navigation, deployment, and content-parser edge cases ([Nimbus status](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/README.md#status), [Blume changelog](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/CHANGELOG.md)). Pin exact versions and gate upgrades on a full build, link validation, and browser smoke tests.

## Method and confidence labels

- **Verified** means directly demonstrated by official documentation, package metadata, repository source, tests, or release history.
- **Inference** means a conclusion drawn from those verified facts, identified as such.
- **Unknown** means no supporting primary-source implementation or test was found in the inspected snapshot. Absence from this report is not proof that a future version cannot support it.

Landing-page claims were checked against setup code, generated/scaffolded files, package dependencies, runtime templates, tests, or build commands where practical. No comparative production benchmark was run, so performance conclusions are architectural evidence, not measured winner claims.

## At-a-glance comparison

| Dimension                      | Nimbus                                                                                                                                                                                                           | Blume                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Core model                     | Owned Astro scaffold plus a thinner integration package                                                                                                                                                          | Content/config framework generating a hidden Astro runtime                                                                              |
| Current inspected package      | `@cloudflare/nimbus-docs` 0.8.2; creator 0.6.3 ([npm metadata](https://registry.npmjs.org/@cloudflare/nimbus-docs/latest), [creator metadata](https://registry.npmjs.org/@cloudflare/create-nimbus-docs/latest)) | `blume` 1.2.0 ([npm metadata](https://registry.npmjs.org/blume/latest))                                                                 |
| Runtime floor                  | Node >=22.12; Astro ^7; React optional                                                                                                                                                                           | Node >=22.12; Astro bundled as a dependency; React enabled when needed                                                                  |
| Default output                 | Static Astro build to `dist/`                                                                                                                                                                                    | Static Astro build to `dist/`; optional server output                                                                                   |
| Setup surface owned by adopter | Full visible app: Astro config, routes, layouts, components, styles, content                                                                                                                                     | Primarily content + one config; hidden `.blume/` runtime generated                                                                      |
| Markdown engine                | Sätteri by default; unified escape hatch                                                                                                                                                                         | Sätteri/Astro pipeline with curated built-ins                                                                                           |
| Search                         | Pagefind by default; custom provider interface                                                                                                                                                                   | Orama default; FlexSearch, Pagefind, Algolia, Orama Cloud, Typesense, Mixedbread                                                        |
| API/reference assistance       | Manual prose/components; generic additional collections                                                                                                                                                          | `AutoTypeTable`, Twoslash, live examples/diffs; native OpenAPI pages or Scalar; AsyncAPI via Scalar                                     |
| Agent surfaces                 | `.md` and `.mdx` twins, root/full/section `llms.txt`, JSON-LD                                                                                                                                                    | `.md` and `.mdx` twins, `llms.txt`/full, component serializers, optional MCP and Ask AI, readability manifest                           |
| Ownership escape hatch         | Ownership is the default; registry items copy into source                                                                                                                                                        | Component overrides/registry first; one-way `eject` for full Astro ownership                                                            |
| License                        | MIT, Cloudflare copyright ([license](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/LICENSE))                                                                                | MIT, Hayden Bleasel copyright ([license](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/LICENSE)) |

## 1. Architecture, runtime, and framework coupling

### Nimbus

**Verified.** Nimbus is an Astro integration plus source scaffold, not an opaque hosted service or only a theme package. `@cloudflare/create-nimbus-docs` obtains a starter and writes it into the project. The resulting app executes ordinary `astro dev`, `astro build`, `astro preview`, and `astro check` scripts ([creator implementation](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/packages/create-nimbus-docs/src/index.ts), [starter scripts/dependencies](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/packages/nimbus-starter-source/package.json)).

The owned starter wires:

- Astro 7, Tailwind 4's Vite plugin, `astro-icon`, and the Nimbus integration;
- static output and hover prefetch;
- content collections and filesystem routes;
- Pagefind, OG generation, theme/client scripts, layouts, and UI components.

The package integration validates configuration, registers MDX and sitemap, installs Sätteri, configures dual Shiki themes and transforms, checks unknown MDX components and duplicate routes, exposes a virtual config module, and invokes Pagefind after build ([starter Astro config](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/packages/nimbus-starter-source/astro.config.ts), [integration implementation](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/packages/nimbus-docs/src/integration.ts)).

**Coupling tradeoff.** Nimbus is strongly coupled to Astro's project model but weakly coupled to a hidden theme implementation: visible behavior is local source. Its framework package still matters for content schemas, navigation, Markdown transforms, agent surfaces, linting, and CLI upgrade tools. “You own every file” therefore means visible/site source ownership, not zero runtime dependency.

**Inference.** This architecture is best when local, line-by-line control and agent inspectability outweigh the cost of carrying an application. It also makes exceptional customization straightforward: edit the layout rather than search for an extension point.

### Blume

**Verified.** Blume's CLI scans a project and generates `.blume/astro.config.mjs`, package/config files, catch-all routes, serialized site/search/OpenAPI data, component/island wrappers, raw Markdown endpoints, and optional Ask AI/MCP/server routes. It only rewrites generated files whose contents changed and prunes generated orphans ([runtime generator](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/astro/generate.ts)). The user's default project can be as small as `package.json`, `blume.config.ts`, `.gitignore`, and one content file ([init scaffolder](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/cli/init/scaffold.ts)).

The generated project resolves and links dependencies back to the installed package. The implementation contains substantial handling for pnpm/Bun isolation, hoisting, cache-restored links, Astro prerender resolution, adapter output rooted under `.blume`, and concurrent dev/build protection ([generator dependency-link code](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/astro/generate.ts), [1.1.x fixes](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/CHANGELOG.md#114)).

**Coupling tradeoff.** Routine authoring has less framework surface, but build behavior is more tightly coupled to Blume's generator and package dependency graph. `blume eject` promotes the runtime to an owned Astro app and retains imports from `blume`; after ejection, Blume's post-build artifacts such as search sync, generated `llms.txt`, platform redirects, sitemap, and robots must be recreated if still wanted ([customization/eject](https://useblume.dev/docs/configuration/customization#eject)).

**Inference.** Blume is the deeper module: a smaller author-facing interface hides more implementation. That is advantageous for a small library maintainer until a customization crosses the provided seams. Debugging generator/package-resolution defects may be less direct than debugging Nimbus's local source.

## 2. Setup and everyday authoring

### Nimbus setup

`npx @cloudflare/create-nimbus-docs@latest` prompts for full vs. empty content, deployment target, package manager, install, and Git. The generated project includes all visible site files. Cloudflare scaffolds `wrangler.jsonc`; other targets remain normal static Astro output ([installation](https://nimbus-docs.com/installation), [creator CLI flags](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/packages/create-nimbus-docs/src/index.ts)).

Everyday commands are ordinary package scripts. Nimbus adds a prose/structure linter, MDX component validation, route collision checks, and a registry CLI. The 0.8 upgrade loop records provenance in `nimbus.json` and offers `init`, `outdated`, `diff`, `diff --apply`, and explicit `add --overwrite` rather than silently replacing owned files ([0.8.0 changelog](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/packages/nimbus-docs/CHANGELOG.md#080)).

**Tradeoff:** setup gives immediate full ownership, but the initial diff and cognitive surface are large. Upgrades to copied starter/components are reconciliation, not a transparent package bump.

### Blume setup

`blume init` supports `docs`, `api`, `sdk`, and `changelog` templates and can scaffold filesystem, GitHub Releases, Notion, Sanity, or remote-MDX sources. The default noninteractive plan writes a minimal config and content file, then `blume dev` generates the runtime ([init command](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/cli/commands/init.ts), [scaffold source](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/cli/init/scaffold.ts), [quickstart](https://useblume.dev/docs/quickstart)).

Content, site config, folder metadata, component overrides, theme overrides, custom pages, islands, and examples remain in the user's project. Blume also exposes `doctor`, `check`, `validate`, `audit`, `sync`, `eval`, `build --isolated`, and optional bundle budgets; the build implementation reports emitted client JS/CSS and can fail thresholds ([CLI source tree](https://github.com/haydenbleasel/blume/tree/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/cli/commands), [build implementation](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/cli/commands/build.ts), [1.1 audit release](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/CHANGELOG.md#110)).

**Tradeoff:** much less boilerplate and a faster path to content, at the cost of accepting generated-runtime behavior and a large package dependency surface.

## 3. Markdown, MDX, and content model

### Common ground

Both accept `.md` and `.mdx`, validate frontmatter, provide no-import global components, render callout directives, use Shiki, and derive routes from files. Both require MDX for component syntax; plain Markdown remains more portable.

### Nimbus

Nimbus uses Sätteri by default. Its docs explicitly warn that remark/rehype plugins configured through the MDX integration silently do nothing under Sätteri; a user can replace the processor with unified (and install `@astrojs/markdown-remark`) at the cost of the Sätteri performance path. It also exposes Sätteri `hastPlugins`/`mdastPlugins` without replacing the processor ([Markdown/MDX guide](https://nimbus-docs.com/writing/markdown-and-mdx), [integration options](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/packages/nimbus-docs/src/integration.ts)).

A local `src/components.ts` is the MDX-global registry. A prebuild scan catches unknown PascalCase tags, unregistered components, and missing imports. Zod schemas make `title` required and support draft/index/search/sidebar/TOC/social/version fields ([frontmatter](https://nimbus-docs.com/writing/frontmatter)). Additional content collections are explicit Astro collections and routes; versions are parallel collections.

Nimbus also supports reusable snippets/partials and merges literal headings from rendered partials into a parent's TOC, including recursive partials ([0.7.1 release](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/packages/nimbus-docs/CHANGELOG.md#071)).

### Blume

Blume supplies a broader curated Markdown syntax: heading links, code titles/line numbers/highlight/focus/diff annotations, Twoslash, package-manager blocks, Mermaid, block KaTeX, smart punctuation, tables, and callout directives. Mermaid/math/package-install directives are documented as MDX-only ([syntax](https://useblume.dev/docs/content/syntax)).

Configuration and `meta.ts` are TypeScript schema-validated. Content can come from multiple filesystem roots, GitHub/remote MDX, GitHub Releases, Sanity, Notion, or a custom `ContentSource`; remote sources are staged into `.blume/content`, cached, and normalized to Markdown/MDX ([content sources](https://useblume.dev/docs/content/sources), [source implementations](https://github.com/haydenbleasel/blume/tree/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/core/sources)).

**Important verified authoring risk:** Blume's own FAQ documents that current oxfmt/Ultracite formatting can collapse `:::` directive fences and break callouts; Blume carries a version-pinned oxfmt patch in its repository ([FAQ/workaround](https://useblume.dev/docs/faq#why-is-oxfmt--ultracite-collapsing-my-directives), [repository patch registration](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/package.json)). `better-result` uses oxfmt, so either avoid directive syntax in favor of `<Callout>`, configure formatting boundaries, or carry/test an appropriate formatter fix.

## 4. Navigation and versioning

### Nimbus

The sidebar either mirrors content or uses explicit items. It supports autogenerated directories/collections, nested manual groups, external links, badges/icons, collapse defaults, section scoping, and per-page order/label/hiding. Breadcrumbs and pagination derive from the same tree ([sidebar guide](https://nimbus-docs.com/navigation/sidebar), [navigation helper implementation](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/packages/nimbus-docs/src/index.ts)).

Versions use parallel `docs-*` collections plus a manifest. Nimbus resolves version-aware sidebars, alternate/canonical links, deprecated/hidden status, version landing fallbacks, and redirects using `previousSlug` ([configuration](https://nimbus-docs.com/configuration), [version helper source](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/packages/nimbus-docs/src/index.ts)).

### Blume

Blume derives the sidebar from files and supports numeric prefixes, frontmatter order, fully typed folder `meta.ts`, group folders that do not add URL segments, hidden pages, explicit nested sidebars, featured links, tabs that scope sidebars, selectors, three group display modes (`flat`, disclosure, drill-in), breadcrumbs, pagination, and responsive TOC ([navigation](https://useblume.dev/docs/content/navigation), [folder metadata](https://useblume.dev/docs/content/meta)).

Version selectors are generic navigation selectors rather than a separately documented versioned-content engine. Blume's i18n is considerably more complete than Nimbus's verified surface: folder or suffix parsers, fallback pages, per-locale navigation, 30+ UI packs, language search filtering, `hreflang`, and RTL layout ([i18n](https://useblume.dev/docs/content/i18n)).

**Unknown:** no Nimbus equivalent to Blume's end-to-end i18n system was found in the official Nimbus docs/source snapshot. Nimbus exposes `locale` and treats separate collections as a possible localization primitive, but that is not evidence of translated UI, fallback routing, `hreflang`, or RTL completeness.

## 5. Search

### Nimbus

Pagefind is on by default and runs after `astro build`; the site ships the static index. Drafts are excluded, `noindex` controls default inclusion, and `searchable` overrides it. A custom provider can retain the UI while replacing the backend; custom provider implementation is adopter work ([search guide](https://nimbus-docs.com/navigation/search), [Pagefind build hook](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/packages/nimbus-docs/src/integration.ts)).

**Verified limitation:** Pagefind must be separately present as a dev dependency. Failure logs a warning and resolves rather than failing the build, so a build can succeed without a functioning index unless CI checks it.

### Blume

Orama is the default, source-derived local index and works in dev and production. Blume also implements FlexSearch, Pagefind, Algolia, Orama Cloud, Typesense, and Mixedbread; only the selected optional SDK is expected in the project. Pagefind is positioned for larger sites but is build-only. Hosted providers include build-time synchronization paths; Mixedbread requires server output. Search supports title/description/body weighting, tags, popular links, exclusions, locale facets, and CJK/Thai segmentation in default Orama ([search docs](https://useblume.dev/docs/configuration/search), [provider implementation tree](https://github.com/haydenbleasel/blume/tree/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/search)).

**Fit inference:** `better-result` is small enough that Orama is the simpler default. Pagefind remains available if the documentation grows. Blume wins capability breadth; Nimbus's Pagefind-only default is still fully adequate for the current corpus.

## 6. Theming, components, and extensibility

### Nimbus

The starter owns a large Astro component set and local CSS. Global `--nb-*` tokens in `src/styles/globals.css` cover color, typography, widths, and dark mode; prose styling is local too ([theme/tokens](https://nimbus-docs.com/styling/theme-and-tokens)). Components and utilities can be copied from the registry; feature entries hand an installation recipe to a coding agent. Headless React diagram primitives are an optional package surface ([philosophy](https://nimbus-docs.com/philosophy), [registry docs](https://nimbus-docs.com/registry)).

Customization ceiling is effectively the owned Astro app. The cost is that global design-system changes may require updating many owned components, and upstream component fixes are not automatically inherited.

### Blume

Blume's theme supports accent/background/radius/mode/font config, light/dark variants, self-hosted curated Google fonts, CSS token overrides in `theme.css`, and Tailwind utilities in user components ([theming](https://useblume.dev/docs/configuration/theming)).

Its built-in library includes cards, steps, tabs, accordions, trees, panels, tooltips, prompts, visibility controls, type tables, live component previews, code blocks, and diffs. Core components are Astro/vanilla; React is activated for React islands/Ask AI ([components](https://useblume.dev/docs/content/components)).

Extension layers, from least to most ownership, are:

1. theme/config tokens;
2. MDX component additions or overrides;
3. typed layout slots for shell/header/search/sidebar/breadcrumbs/TOC/pagination/footer;
4. auto-discovered React/Vue/Svelte islands and custom Astro pages;
5. `blume add` source copies;
6. custom Astro integrations;
7. full `blume eject` ([customization](https://useblume.dev/docs/configuration/customization)).

**Inference:** Blume covers `better-result`'s likely customizations without ejecting: brand tokens, a custom landing page, source-backed examples, and perhaps a custom API index. Nimbus remains stronger if the desired visual behavior diverges substantially from the supplied framework.

## 7. API documentation and library-specific features

This is the largest practical gap.

### Nimbus

**Verified:** Nimbus provides strong general reference-writing recipes, code blocks, prop-table patterns in its own site, and the ability to create an `api` content collection. Its registry has recipes for creating generic collections and component showcases.

**Unknown/not found:** no first-party TypeDoc extraction, TypeScript symbol graph, source-backed type table, OpenAPI parser/renderer, AsyncAPI renderer, or live-example convention was found in the public Nimbus docs or package source. “API reference” mentions in the registry are recipes/manual content structures, not automatic TypeScript API documentation.

For `better-result`, Nimbus would therefore require hand-maintained API tables (as the current README does), a custom generator, or integration of an external TypeDoc pipeline.

### Blume

Blume has several verified features directly relevant to a TypeScript package:

- `twoslash` code fences show compiler-derived inferred types ([syntax](https://useblume.dev/docs/content/syntax#display-types));
- `AutoTypeTable` reads a TypeScript interface/type alias, extracting JSDoc, optionality, and `@default` values ([components](https://useblume.dev/docs/content/components#auto-type-table));
- `<Component>` renders a local example and its source from one file, including Astro/React/Vue/Svelte previews; `<Diff>` renders source or patch differences ([components](https://useblume.dev/docs/content/components#component));
- an `sdk` scaffold writes introduction and installation content ([init scaffold](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/cli/init/scaffold.ts));
- native OpenAPI creates one searchable/agent-readable page per operation with schemas, examples, auth, and code samples; Scalar is an alternative, and AsyncAPI is exposed through Scalar ([API reference](https://useblume.dev/docs/advanced/api-reference)).

**Important boundary:** `better-result` is a TypeScript library, not an HTTP API. OpenAPI/AsyncAPI do not solve its exported-symbol reference. `AutoTypeTable` helps for configuration/types, and Twoslash verifies examples, but neither is a verified full TypeDoc replacement. A comprehensive symbol-by-symbol reference would still need hand-authored pages or a TypeDoc/custom-MDX generation step. This is an unknown integration path, not a claimed built-in.

## 8. Deployment and integrations

### Nimbus

Nimbus defaults to static Astro output. `dist/` can be hosted anywhere; Cloudflare gets a scaffolded Wrangler configuration, while Vercel/Netlify/static choices produce the same static output ([installation/deployment](https://nimbus-docs.com/installation), [README deployment](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/README.md#deploy)). Because the Astro project is owned, standard Astro integrations/adapters can be added directly.

**Unknown:** no official Nimbus deployment guide in the inspected public sitemap documents first-party server-output features comparable to Blume's Ask AI/MCP setup. The Nimbus changelog says Astro 7 unblocks future opt-in server output, but that is not evidence those server features ship.

### Blume

Static output deploys to any static host. Blume detects stable production origins on Vercel, Netlify, and Cloudflare Pages; supports deployment base paths and a separate content `basePath`; emits redirect manifests/platform files; and supports server output via Vercel, Node, Netlify, or Cloudflare adapters. Vercel and Node adapters are dependencies; Netlify/Cloudflare adapters are optional installs ([deployment](https://useblume.dev/docs/deployment), [package metadata](https://registry.npmjs.org/blume/latest)).

Blume also has first-party analytics configuration, custom Astro integrations, CMS/remote content sources, GitHub release content, hosted search sync, Ask AI providers, and an MCP server. These broaden the integration surface but also enlarge dependency and operational complexity.

**Fit inference:** a static build is preferable for `better-result`: no runtime service, secrets, or adapter is needed. Deploy the generated `dist/` to the existing `better-result.dev` host. Ask AI/MCP can remain disabled; raw Markdown and `llms.txt` already serve agents.

## 9. AI and agent-facing documentation

Both are unusually strong here.

### Nimbus

Every page gets a downleveled `/<slug>/index.md` and raw `index.mdx`; Nimbus emits root and per-section `llms.txt`, deterministic `llms-full.txt`, version labels, JSON-LD, and an `AGENT.md` in the scaffold ([agent surfaces](https://nimbus-docs.com/ai/agent-surfaces), [index/render implementation](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/packages/nimbus-docs/src/index.ts)). The CLI also supports agent-applied feature recipes and the authoring linter can output JSON/fixes.

Nimbus's ownership model is itself agent-oriented: an agent can inspect and edit all visible implementation. That is a design property, not evidence that generated documentation is more accurate.

### Blume

Blume emits raw `.md` and `.mdx` routes, structured `llms.txt`, full corpus, “Copy as Markdown,” “Open in chat,” custom MDX-to-Markdown serializers, and `agent-readability.json`. Optional server output adds grounded Ask AI and read-only MCP tools for search/page/navigation access ([AI docs](https://useblume.dev/docs/configuration/ai), [AI implementation](https://github.com/haydenbleasel/blume/tree/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/ai)). `blume eval` can test whether an agent can answer expected questions from docs, according to the 1.2 release and implementation ([1.2 changelog](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/CHANGELOG.md#120), [eval source](https://github.com/haydenbleasel/blume/tree/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/eval)).

**Tradeoff:** Blume offers more finished consumption/evaluation surfaces; Nimbus offers more directly editable site implementation. For `better-result`, whose repository already ships agent skills, Blume's machine-readable docs and docs-eval path complement the existing `skills/` directory well.

## 10. Accessibility, performance, and SEO evidence

### Accessibility

- **Nimbus verified implementation evidence:** native `<dialog>` is used for the mobile drawer/focus behavior; components carry ARIA roles/states, keyboard handling, and reduced-motion styles; the release log records fixes for mobile search reachability, duplicate IDs/`aria-controls`, tall dialogs, navigation lifecycle, and TOC state ([starter layout](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/packages/nimbus-starter-source/src/layouts/DocsLayout.astro), [creator 0.6.x release notes](https://github.com/cloudflare/nimbus/releases)). **Unknown:** no automated axe/Playwright accessibility suite or published WCAG audit was found in the inspected repository.
- **Blume verified test evidence:** the official docs app runs Playwright + axe-core against representative pages for serious/critical WCAG 2 A/AA violations, separately checks article contrast in light/dark themes, verifies the skip link is first focusable, and tests reduced motion rendering ([a11y test](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/apps/docs/e2e/a11y.e2e.ts)). The root layout also contains a skip link and makes the closed mobile navigation inert/`aria-hidden` ([layout source](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/components/layout/RootLayout.astro)). This is stronger evidence, but it tests Blume's own docs/configuration, not every adopter customization.

### Performance

- Both prerender static HTML by default and use Astro islands/client scripts rather than a mandatory SPA runtime.
- Nimbus enables hover prefetch and uses Pagefind's static index. React is optional, but the starter includes targeted client scripts for search/navigation/theme/components ([starter config](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/packages/nimbus-starter-source/astro.config.ts)).
- Blume's docs state its core theme has no client framework JS; implementation conditionally enables React/Vue/Svelte based on detected islands/features. Its build reports JS/CSS and supports enforceable budgets ([runtime generator](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/astro/generate.ts), [build source](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/cli/commands/build.ts)).

**Unknown:** neither primary source supplied a stable, comparable Lighthouse/Core Web Vitals benchmark for equivalent content and hosting. Claims such as “fast” or “scores well” should not be treated as a measured head-to-head result. Blume's larger npm install/package graph is a build/install concern, not direct proof of a larger browser payload.

### SEO

- Nimbus supplies title/description, canonical/version alternates, generated/fallback OG images, JSON-LD, sitemap, robots, page/site head control, `noindex`, and search/agent filtering ([metadata/SEO](https://nimbus-docs.com/ai/metadata-and-seo)).
- Blume adds a broader verified set: article metadata, generated OG dimensions/types, X attribution, RSS, JSON-LD WebSite/TechArticle/BreadcrumbList, sitemap/robots, locale alternates, content signals, custom override files, and an 87-check offline/live audit described in its changelog ([SEO](https://useblume.dev/docs/configuration/seo), [audit release](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/CHANGELOG.md#110)).

Blume has the stronger built-in evidence and audit loop. Nimbus's baseline is still sufficient for a library docs site.

## 11. Maturity, maintenance, community, and licensing

All figures below are volatile snapshots, not quality measures.

### Nimbus

- GitHub repository created 2026-07-09 according to the official GitHub API; inspected history begins 2026-07-15.
- At snapshot: 839 stars, 26 forks, 4 open issues, 115 commits, and contributions dominated by one maintainer identity (with name/email variants), plus one meaningful secondary contributor ([GitHub API](https://api.github.com/repos/cloudflare/nimbus), [commit history](https://github.com/cloudflare/nimbus/commits/d14cddd7db48277e3b36b11f06a888a9864454ad)).
- Current framework version is pre-1.0, and the README explicitly warns of minor-release surface changes and rough edges ([status](https://github.com/cloudflare/nimbus/blob/d14cddd7db48277e3b36b11f06a888a9864454ad/README.md#status)).
- Package publishing has npm provenance; current package metadata reports MIT and Cloudflare maintainers ([npm metadata](https://registry.npmjs.org/@cloudflare/nimbus-docs/latest)).
- Last-month downloads reported 6,575 for the scoped framework package as of the snapshot ([npm downloads API](https://api.npmjs.org/downloads/point/last-month/@cloudflare/nimbus-docs)). The deprecated unscoped package should not be combined with this number.

### Blume

- GitHub repository created 2026-06-21; inspected history begins 2026-06-20.
- At snapshot: 1,003 stars, 56 forks, 2 open issues, 628 commits, and 20+ commit authors, but 559 of 628 commits are attributed to the lead maintainer ([GitHub API](https://api.github.com/repos/haydenbleasel/blume), [commit history](https://github.com/haydenbleasel/blume/commits/a015b0a87d427f110155a010f85639ebb88024be)).
- It has reached 1.2.0 and has 35 tags in a little over a month. That demonstrates intense activity, not long-term stability.
- Package publishing has npm provenance; metadata lists one maintainer and MIT licensing ([npm metadata](https://registry.npmjs.org/blume/latest)).
- Last-month npm downloads reported 67,077 at snapshot ([npm downloads API](https://api.npmjs.org/downloads/point/last-month/blume)).

### Interpretation

**Verified:** Blume has more code, releases, contributors, stars/forks, and package downloads in this snapshot. Nimbus has Cloudflare organizational stewardship and a much smaller, explicitly pre-1.0 surface.

**Inference:** Blume presently has more adoption signal and implementation breadth; Nimbus may offer stronger institutional continuity than its individual contributor count suggests. Neither has enough elapsed time to establish long-term compatibility, maintenance durability, or ecosystem depth. Stars/downloads can be affected by launch attention, CI installs, and version churn.

Both use permissive MIT licenses, compatible with `better-result`'s MIT license. Neither requires a hosted account or paid service for the static core.

## 12. Decision matrix for `better-result`

Scores are **1 (poor) to 5 (excellent)** for this repository's needs, not universal product rankings. Weighted totals are judgment/inference based on the verified evidence above.

| Criterion                              |   Weight |       Nimbus |        Blume | Rationale for `better-result`                                                                                   |
| -------------------------------------- | -------: | -----------: | -----------: | --------------------------------------------------------------------------------------------------------------- |
| TypeScript library/API-doc fit         |      20% |          3.5 |          5.0 | Blume has Twoslash, auto type tables, source-backed examples/diffs, SDK starter; neither fully replaces TypeDoc |
| Setup and authoring efficiency         |      15% |          3.5 |          5.0 | Blume starts from content/config; Nimbus starts with an owned app                                               |
| Customization and ownership            |      15% |          5.0 |          4.0 | Nimbus exposes all visible source immediately; Blume has good seams plus eject                                  |
| Search                                 |      10% |          3.5 |          5.0 | Pagefind is sufficient, but Blume offers richer providers/dev behavior/tags/locales                             |
| Quality and agent tooling              |      10% |          4.0 |          5.0 | Both are agent-ready; Blume adds audit/eval/MCP/Ask AI and serializers                                          |
| Deployment/integration fit             |      10% |          4.0 |          4.5 | Both static-anywhere; Blume has broader verified adapters/integrations                                          |
| Accessibility/performance/SEO evidence |      10% |          3.5 |          4.5 | Blume has axe tests, budgets, richer SEO and audit; no comparable benchmarks                                    |
| Maturity/risk                          |      10% |          2.5 |          3.0 | Both very young; Nimbus explicitly pre-1.0, Blume broader but still churn-heavy                                 |
| **Weighted total**                     | **100%** | **3.73 / 5** | **4.55 / 5** | **Blume wins for the present library use case**                                                                 |

### Sensitivity

If “every visible implementation file must be local and directly editable” becomes the dominant criterion (for example, raise ownership to 35% and reduce library automation/authoring weight), Nimbus can become the better choice. If the priority is shipping accurate TypeScript guides/reference quickly with low app maintenance, Blume's lead increases.

## 13. Concrete recommendation and rollout

### Choose Blume, with these constraints

1. **Isolate it in `website/`.** Run a separate Blume project rather than using repository-level `docs/` as its content root; this preserves `docs/research/` as internal notes and avoids publishing this report as product documentation. A starting command is `blume init website --template sdk --package-manager bun` after installing/running the pinned CLI. The verified scaffolder supports this template and package manager ([init implementation](https://github.com/haydenbleasel/blume/blob/a015b0a87d427f110155a010f85639ebb88024be/packages/blume/src/cli/init/scaffold.ts)).
2. **Pin exact Blume and Node versions initially.** Do not use a floating range during the first adoption. Upgrade deliberately after reading the changelog and running the gates below.
3. **Stay static.** Use Orama, generated raw Markdown/`llms.txt`, sitemap/SEO, and no server adapter. Do not enable Ask AI or hosted MCP until there is a demonstrated user need; the static site is cheaper and operationally simpler.
4. **Design content around the library rather than its source-file layout.** Suggested top-level navigation:
   - Introduction and installation
   - Creating and inspecting results
   - Transforming/recovering/observing
   - Generator composition and async workflows
   - Tagged errors, panic, and serialization
   - Migration guides
   - API reference
   - Changelog
5. **Use compiler-backed features selectively.** Use Twoslash for inference-sensitive examples (`Result.gen`, error unions, `tryRecover`) and `AutoTypeTable` for stable named config/types such as retry options. Keep narrative contracts hand-authored. Do not claim automatic complete API coverage until a TypeDoc/custom generation pipeline is implemented and tested.
6. **Reuse GitHub Releases for changelog only if release-note quality is suitable.** Blume's source can turn official releases into changelog entries, reducing duplicate authoring. Keep migration guides in local MDX.
7. **Avoid the known directive-formatting trap.** Prefer explicit `<Callout>` components or verify the repository's oxfmt version/patch preserves `:::` fences before adopting directive syntax.
8. **Add release gates:**
   - `blume check`/`validate`;
   - `blume build --isolated`;
   - `blume audit --fail-on error` against the built site;
   - a small Playwright smoke suite for home, install, generator guide, API reference, search keyboard flow, mobile navigation, and dark mode;
   - optional JS/CSS budgets once a baseline build is measured;
   - link checks from README/package metadata to canonical production routes.
9. **Keep content portable.** Prefer Markdown and simple MDX components; isolate Blume-only constructs. This preserves an exit path to Nimbus or plain Astro if maintenance changes.

### Why not Nimbus now?

Nimbus would be a defensible choice, especially because `better-result` is agent-oriented and the owner-source model aligns with repository transparency. It loses this decision because the library needs compiler-aware examples/reference assistance more than it needs to redesign every piece of documentation chrome, and because one maintainer would otherwise inherit a large Astro application before writing the missing guides.

### Revisit Nimbus if

- Blume's hidden generator causes repeated dependency-resolution or upgrade failures;
- the desired site needs major shell/layout behavior that Blume's slots and custom pages cannot express cleanly;
- local ownership becomes a policy requirement;
- Nimbus adds verified TypeScript API extraction/source-backed examples while stabilizing past 1.0;
- Cloudflare-specific deployment or organizational integration becomes strategically important.

## 14. Known unknowns and validation work before commitment

- **Complete TypeScript API extraction:** neither inspected product demonstrates a first-party full replacement for TypeDoc. Prototype the intended API reference before committing the entire site.
- **Current production site migration:** this research did not inspect the implementation behind `better-result.dev`; URL preservation and redirects must be mapped separately.
- **Equivalent performance:** no controlled same-content build/deploy benchmark was conducted. Measure output size, build time, search index size, and Lighthouse/Web Vitals on prototypes.
- **Nimbus accessibility conformance:** semantic implementation is visible, but no automated conformance suite was found.
- **Blume framework stability:** 1.x semantic versioning exists, but elapsed maintenance history is too short to infer compatibility discipline over years.
- **Nimbus roadmap features:** changelog comments about server-output enablement are not shipped-feature evidence. Evaluate only released source/docs.
- **Community support quality:** issue counts are snapshots and do not measure response time or resolution quality.

## Bottom line

For `better-result` today, **Blume offers the better ratio of documentation capability to maintenance surface**, particularly for inference-heavy TypeScript examples and reference content. Adopt it conservatively: isolated project, static output, exact version pin, portable content, and strong build/audit/browser gates. Choose Nimbus instead only when full local ownership of the documentation application is worth maintaining that application.
