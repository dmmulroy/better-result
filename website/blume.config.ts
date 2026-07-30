import { defineConfig } from "blume";

export default defineConfig({
  title: "better-result",
  description:
    "Typed, composable error handling for TypeScript with Result values, tagged errors, and generator composition.",
  logo: {
    image: "/logo.svg",
    text: "better-result",
  },
  github: {
    owner: "dmmulroy",
    repo: "better-result",
    branch: "3.0",
    dir: "website",
  },
  theme: {
    accent: {
      light: "oklch(50% 0.16 247.27)",
      dark: "oklch(78.7% 0.128 230.318)",
    },
    background: {
      light: "oklch(100% 0 0)",
      dark: "oklch(17.1% 0 0)",
    },
    radius: "sm",
    mode: "system",
    fonts: {
      display: "geist",
      body: "geist",
      mono: "geist-mono",
    },
  },
  navigation: {
    sidebar: {
      display: "group",
    },
    featured: [
      {
        label: "npm package",
        href: "https://www.npmjs.com/package/better-result",
        icon: "package",
      },
    ],
  },
  search: {
    provider: "orama",
  },
  markdown: {
    imageZoom: true,
    code: {
      icons: true,
      wrap: false,
    },
    codeBlocks: {
      theme: {
        light: "github-light",
        dark: "github-dark",
      },
    },
  },
  ai: {
    llmsTxt: true,
  },
  seo: {
    og: { enabled: true },
    rss: { enabled: false },
    sitemap: true,
    robots: true,
    structuredData: true,
  },
  deployment: {
    output: "static",
    site: "https://better-result.dev",
  },
});
