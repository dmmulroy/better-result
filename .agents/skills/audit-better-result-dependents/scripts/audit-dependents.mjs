#!/usr/bin/env node
import { mkdtempSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const DEPENDENTS = [
  "@prisma/compute-sdk",
  "@prisma/streams-server",
  "@prisma/streams-local",
  "create-better-t-stack",
  "@better-t-stack/template-generator",
];

const DEFAULT_PATTERNS = [
  "isTaggedError",
  "TaggedError\\.is",
  "extends TaggedError\\(",
  "from [\"']better-result",
  "\\b_tag\\b",
  "\\.toJSON\\(",
];

const patterns = process.argv.slice(2);
const regex = patterns.length > 0 ? patterns.join("|") : DEFAULT_PATTERNS.join("|");
const keep = process.env.KEEP_DEP_AUDIT === "1";
const root = mkdtempSync(join(tmpdir(), "better-result-dependent-audit-"));

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
}

function sanitize(name) {
  return name.replace(/^@/, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function normalizeRepoUrl(url) {
  if (!url) return undefined;
  return url
    .replace(/^git\+/, "")
    .replace(/^git@github.com:/, "https://github.com/")
    .replace(/\.git$/, "");
}

async function npmMetadata(name) {
  const encoded = name.startsWith("@") ? name.replace("/", "%2F") : name;
  const response = await fetch(`https://registry.npmjs.org/${encoded}`);
  if (!response.ok) throw new Error(`npm metadata failed for ${name}: ${response.status}`);
  const json = await response.json();
  const version = json["dist-tags"].latest;
  const meta = json.versions[version];
  return {
    name,
    version,
    spec: `${name}@${version}`,
    repo: normalizeRepoUrl(meta.repository?.url ?? json.repository?.url),
    gitHead: meta.gitHead,
    betterResult: meta.dependencies?.["better-result"],
  };
}

function checkoutRepo(meta, key) {
  if (!meta.repo || !meta.repo.includes("github.com")) return undefined;
  const dir = join(root, `repo-${sanitize(key)}`);
  const clone = run("git", ["clone", "--filter=blob:none", "--no-checkout", `${meta.repo}.git`, dir], {
    capture: true,
  });
  if (clone.status !== 0) return undefined;
  const target = meta.gitHead ?? "HEAD";
  const fetch = run("git", ["fetch", "--depth=1", "origin", target], { cwd: dir, capture: true });
  if (fetch.status === 0) {
    const checkout = run("git", ["checkout", target], { cwd: dir, capture: true });
    if (checkout.status !== 0) return undefined;
  } else {
    const checkout = run("git", ["checkout", "HEAD"], { cwd: dir, capture: true });
    if (checkout.status !== 0) return undefined;
  }
  return dir;
}

function unpackNpm(meta) {
  const dir = join(root, `npm-${sanitize(meta.name)}`);
  mkdirSync(dir, { recursive: true });
  const pack = run("npm", ["pack", meta.spec, "--silent"], { cwd: dir, capture: true });
  if (pack.status !== 0) throw new Error(`npm pack failed for ${meta.spec}: ${pack.stderr}`);
  const tgz = pack.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!tgz) throw new Error(`npm pack did not return a tarball for ${meta.spec}`);
  const tar = run("tar", ["-xzf", tgz], { cwd: dir, capture: true });
  if (tar.status !== 0) throw new Error(`tar failed for ${meta.spec}: ${tar.stderr}`);
  return join(dir, "package");
}

function rgSearch(path) {
  if (!existsSync(path)) return { count: 0, output: "" };
  const args = [
    "-n",
    "--glob",
    "!**/node_modules/**",
    "--glob",
    "!**/.git/**",
    "--glob",
    "!**/dist/**",
    "--glob",
    "!**/build/**",
    regex,
    path,
  ];
  const result = run("rg", args, { capture: true });
  const output = result.stdout.trim();
  return { count: output ? output.split(/\r?\n/).length : 0, output };
}

try {
  console.log(`Audit dir: ${root}`);
  console.log(`Regex: ${regex}`);

  const metas = await Promise.all(DEPENDENTS.map(npmMetadata));
  const checkedRepos = new Map();

  for (const meta of metas) {
    const repoKey = meta.repo && meta.gitHead ? `${meta.repo}#${meta.gitHead}` : undefined;
    let sourcePath;
    let sourceKind;

    if (repoKey && checkedRepos.has(repoKey)) {
      sourcePath = checkedRepos.get(repoKey);
      sourceKind = "github-shared";
    } else {
      sourcePath = checkoutRepo(meta, repoKey ?? meta.name);
      if (sourcePath) {
        sourceKind = "github";
        if (repoKey) checkedRepos.set(repoKey, sourcePath);
      } else {
        sourcePath = unpackNpm(meta);
        sourceKind = "npm-pack";
      }
    }

    const result = rgSearch(sourcePath);
    console.log("\n---");
    console.log(`${meta.name}@${meta.version}`);
    console.log(`better-result: ${meta.betterResult ?? "(not in dependencies?)"}`);
    console.log(`source: ${sourceKind} ${sourcePath}`);
    if (meta.repo) console.log(`repo: ${meta.repo}`);
    if (meta.gitHead) console.log(`gitHead: ${meta.gitHead}`);
    console.log(`matches: ${result.count}`);
    if (result.output) console.log(result.output);
  }
} finally {
  if (keep) {
    console.log(`\nKeeping audit dir because KEEP_DEP_AUDIT=1: ${root}`);
  } else {
    rmSync(root, { recursive: true, force: true });
  }
}
