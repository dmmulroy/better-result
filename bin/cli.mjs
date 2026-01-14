#!/usr/bin/env node

import {
  readdirSync,
  existsSync,
  statSync,
  readFileSync,
  mkdirSync,
  cpSync,
  writeFileSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import color from "picocolors";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "..", "skills");

/** Create a clickable terminal hyperlink */
function link(text, url) {
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

/** @typedef {"opencode" | "claude" | "codex"} Agent */

/**
 * Agent configuration for skill/command paths
 */
const AGENT_CONFIG = {
  opencode: {
    skillDir: ".opencode/skill",
    commandDir: ".opencode/command",
    cli: "opencode",
    configFiles: [".opencode", "opencode.json"],
  },
  claude: {
    skillDir: ".claude/skills",
    commandDir: ".claude/commands",
    cli: "claude",
    configFiles: [".claude", "claude.json", "CLAUDE.md"],
  },
  codex: {
    skillDir: ".codex/skills",
    commandDir: ".codex/commands",
    cli: "codex",
    configFiles: [".codex", "codex.json", "AGENTS.md"],
  },
};

/** @typedef {"npm" | "bun" | "pnpm"} PackageManager */

// ─────────────────────────────────────────────────────────────────────────────
// Detection
// ─────────────────────────────────────────────────────────────────────────────

/** Check if a CLI binary is available */
function hasBinary(name) {
  try {
    execSync(`which ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect package manager from lockfiles
 * @returns {PackageManager | null}
 */
function detectPackageManager() {
  const cwd = process.cwd();
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) {
    return "bun";
  }
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (existsSync(join(cwd, "package-lock.json"))) {
    return "npm";
  }
  return null;
}

/**
 * Detect harness from repo config files
 * @returns {Agent | null}
 */
function detectConfiguredAgent() {
  const cwd = process.cwd();
  for (const [agent, config] of Object.entries(AGENT_CONFIG)) {
    for (const file of config.configFiles) {
      if (existsSync(join(cwd, file))) {
        return /** @type {Agent} */ (agent);
      }
    }
  }
  return null;
}

/**
 * Get all agents with binary available
 * @returns {Agent[]}
 */
function getAvailableAgents() {
  return /** @type {Agent[]} */ (
    Object.keys(AGENT_CONFIG).filter((agent) =>
      hasBinary(AGENT_CONFIG[/** @type {Agent} */ (agent)].cli)
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skills
// ─────────────────────────────────────────────────────────────────────────────

/** Recursively find all SKILL.md files and return skill info */
function discoverSkills() {
  const skills = [];

  function walk(dir, prefix = "") {
    if (!existsSync(dir)) return;

    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        const skillFile = join(fullPath, "SKILL.md");
        if (existsSync(skillFile)) {
          const id = prefix ? `${prefix}/${entry}` : entry;
          skills.push({ id, path: fullPath, skillFile });
        } else {
          walk(fullPath, prefix ? `${prefix}/${entry}` : entry);
        }
      }
    }
  }

  walk(SKILLS_DIR);
  return skills;
}

/** Parse YAML frontmatter from SKILL.md */
function parseSkillMeta(skillFile) {
  const content = readFileSync(skillFile, "utf-8");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: "unknown", description: "" };

  const yaml = match[1];
  const name = yaml.match(/name:\s*(.+)/)?.[1]?.trim() || "unknown";
  const description = yaml.match(/description:\s*(.+)/)?.[1]?.trim() || "";
  return { name, description };
}

// ─────────────────────────────────────────────────────────────────────────────
// Installation
// ─────────────────────────────────────────────────────────────────────────────

/** Install skill to target agent */
function installSkill(skillPath, skillName, agent) {
  const cwd = process.cwd();
  const config = AGENT_CONFIG[agent];
  const targetSkillDir = join(cwd, config.skillDir, skillName);

  if (!existsSync(skillPath)) {
    return { success: false, message: `Skill source not found: ${skillPath}` };
  }

  mkdirSync(dirname(targetSkillDir), { recursive: true });
  if (existsSync(targetSkillDir)) {
    return { success: true, message: `${targetSkillDir}`, existed: true };
  }

  cpSync(skillPath, targetSkillDir, { recursive: true });
  return { success: true, message: `${targetSkillDir}`, existed: false };
}

/** Install command wrapper for skill */
function installCommand(skillName, agent) {
  const cwd = process.cwd();
  const config = AGENT_CONFIG[agent];
  const commandDir = join(cwd, config.commandDir);
  const commandFile = join(commandDir, "adopt-better-result.md");

  mkdirSync(commandDir, { recursive: true });

  if (existsSync(commandFile)) {
    return { success: true, message: `${commandFile}`, existed: true };
  }

  const commandContent = `---
description: Use ${skillName} skill for better-result migration/adoption
---

Load and use the ${skillName} skill to help with this codebase.

First, invoke the skill:

\`\`\`
skill({ name: '${skillName}' })
\`\`\`

Then follow the skill instructions.

<user-request>
$ARGUMENTS
</user-request>
`;

  writeFileSync(commandFile, commandContent);
  return { success: true, message: `${commandFile}`, existed: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Launch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Launch agent CLI interactively
 * @param {Agent} agent
 */
function launchAgent(agent) {
  const config = AGENT_CONFIG[agent];

  try {
    execSync(config.cli, {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env,
    });
    process.exit(0);
  } catch (err) {
    process.exit(err.status ?? 0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Version Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ installed: false } | { installed: true; version: string; major: number }} VersionInfo
 */

/**
 * Detect installed better-result version from package.json
 * @returns {VersionInfo}
 */
function detectInstalledVersion() {
  const cwd = process.cwd();
  const pkgPath = join(cwd, "package.json");

  if (!existsSync(pkgPath)) {
    return { installed: false };
  }

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const versionSpec = deps["better-result"];

    if (!versionSpec) {
      return { installed: false };
    }

    // Try to get actual installed version from node_modules
    const installedPkgPath = join(cwd, "node_modules", "better-result", "package.json");
    if (existsSync(installedPkgPath)) {
      const installedPkg = JSON.parse(readFileSync(installedPkgPath, "utf-8"));
      const version = installedPkg.version;
      const major = parseInt(version.split(".")[0], 10);
      return { installed: true, version, major };
    }

    // Fallback: parse version from spec (strip ^, ~, etc.)
    const version = versionSpec.replace(/^[\^~>=<]+/, "");
    const major = parseInt(version.split(".")[0], 10);
    return { installed: true, version, major };
  } catch {
    return { installed: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Help
// ─────────────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${color.bold("better-result")} - Lightweight Result type for TypeScript

${color.dim("Usage:")}
  npx better-result init      Interactive setup (new projects)
  npx better-result migrate   Detect version & guide migration
  npx better-result --help    Show this help
`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Migrate Command
// ─────────────────────────────────────────────────────────────────────────────

async function runMigrate() {
  console.log();
  p.intro(color.bgCyan(color.black(" better-result migrate ")));

  const versionInfo = detectInstalledVersion();

  if (!versionInfo.installed) {
    p.log.warn("better-result is not installed in this project");

    const shouldInit = await p.confirm({
      message: "Would you like to set up better-result now?",
      initialValue: true,
    });

    if (p.isCancel(shouldInit) || !shouldInit) {
      p.cancel("Migration cancelled.");
      process.exit(0);
    }

    // Run init flow
    return runInit();
  }

  p.log.info(`Detected version: ${color.cyan(versionInfo.version)}`);

  if (versionInfo.major >= 2) {
    p.log.success("Already on v2 - no migration needed!");
    p.outro(color.green("You're up to date."));
    process.exit(0);
  }

  // v1 detected - guide to v2 migration
  p.log.step(`Migration available: v${versionInfo.major} → v2`);

  console.log();
  console.log(color.dim("  Breaking changes in v2:"));
  console.log(color.dim("  • TaggedError: class-based → factory-based API"));
  console.log(color.dim("  • TaggedError.match → matchError (standalone fn)"));
  console.log(color.dim("  • TaggedError.matchPartial → matchErrorPartial"));
  console.log(color.dim("  • New: Panic for unrecoverable errors"));
  console.log();

  const onCancel = () => {
    p.cancel("Migration cancelled.");
    process.exit(0);
  };

  // Detect defaults
  const detectedPM = detectPackageManager();
  const configuredAgent = detectConfiguredAgent();
  const availableAgents = getAvailableAgents();
  const detectedAgent =
    configuredAgent ?? (availableAgents.length > 0 ? availableAgents[0] : null);

  // Build package manager options
  const pmList = /** @type {PackageManager[]} */ (["npm", "bun", "pnpm"]);
  const pmOptions = pmList.map((pm) => ({
    value: pm,
    label: pm === detectedPM ? `${pm} ${color.dim("(detected)")}` : pm,
  }));
  if (detectedPM) {
    const idx = pmOptions.findIndex((o) => o.value === detectedPM);
    if (idx > 0) {
      const [detected] = pmOptions.splice(idx, 1);
      pmOptions.unshift(detected);
    }
  }

  // Build agent options
  const agents = /** @type {Agent[]} */ (["opencode", "claude", "codex"]);
  const agentOptions = agents.map((agent) => ({
    value: agent,
    label: agent === detectedAgent ? `${agent} ${color.dim("(detected)")}` : agent,
  }));
  if (detectedAgent) {
    const idx = agentOptions.findIndex((o) => o.value === detectedAgent);
    if (idx > 0) {
      const [detected] = agentOptions.splice(idx, 1);
      agentOptions.unshift(detected);
    }
  }

  const responses = await p.group(
    {
      pm: () =>
        p.select({
          message: "Package manager",
          options: pmOptions,
          initialValue: detectedPM ?? "npm",
        }),
      installSkill: () =>
        p.confirm({
          message: "Install AI migration skill? (recommended for large codebases)",
          initialValue: true,
        }),
    },
    { onCancel }
  );

  const selectedPM = /** @type {PackageManager} */ (responses.pm);

  /** @type {Agent | null} */
  let selectedAgent = null;
  let shouldLaunch = false;

  if (responses.installSkill) {
    const toolResponses = await p.group(
      {
        agent: () =>
          p.select({
            message: "AI coding agent",
            options: agentOptions,
            initialValue: detectedAgent ?? "opencode",
          }),
        launch: () =>
          p.confirm({
            message: "Launch agent after install?",
            initialValue: true,
          }),
      },
      { onCancel }
    );

    selectedAgent = /** @type {Agent} */ (toolResponses.agent);
    shouldLaunch = Boolean(toolResponses.launch);
  }

  // Upgrade package
  const s = p.spinner();
  s.start("Upgrading better-result to v2");

  try {
    const installCmd =
      selectedPM === "npm"
        ? "npm install better-result@latest"
        : selectedPM === "bun"
          ? "bun add better-result@latest"
          : "pnpm add better-result@latest";
    execSync(installCmd, { stdio: "ignore", cwd: process.cwd() });
    s.stop("Upgraded to v2");
  } catch {
    s.stop(color.yellow("Upgrade failed - try manually"));
  }

  // Install migration skill + command
  if (selectedAgent) {
    const skills = discoverSkills();
    const migrateSkill = skills.find((s) => s.id === "migrations/v2");

    if (migrateSkill) {
      const meta = parseSkillMeta(migrateSkill.skillFile);
      const s2 = p.spinner();
      s2.start(`Installing migration skill for ${selectedAgent}`);

      const skillResult = installSkill(migrateSkill.path, meta.name, selectedAgent);
      installMigrateCommand(meta.name, selectedAgent);

      s2.stop("Migration skill installed");
      p.log.success(`Skill: ${color.dim(skillResult.message)}`);
    }
  }

  /** Strip ANSI codes for length calculation */
  const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

  /** Print a styled box with title and message */
  function box(title, lines) {
    const titlePlain = stripAnsi(title);
    const maxLen = Math.max(...lines.map((l) => stripAnsi(l).length), titlePlain.length + 4);
    const padding = maxLen - titlePlain.length - 2;
    const top = `${color.dim("┌──")} ${title} ${color.dim("─".repeat(Math.max(0, padding)) + "┐")}`;
    const bot = color.dim(`└${"─".repeat(maxLen + 2)}┘`);
    console.log(top);
    for (const line of lines) {
      const plainLen = stripAnsi(line).length;
      console.log(`${color.dim("│")} ${line}${" ".repeat(maxLen - plainLen)} ${color.dim("│")}`);
    }
    console.log(bot);
  }

  const commandHintLines = [
    `${color.white("Run")} ${color.bold(color.cyan("/migrate-better-result"))} ${color.white("to start migration.")}`,
    "",
    color.yellow("The AI will update TaggedError classes to v2 syntax."),
    color.dim("See MIGRATION.md for manual migration steps."),
  ];

  // Launch or show next steps
  if (selectedAgent && shouldLaunch) {
    if (!hasBinary(AGENT_CONFIG[selectedAgent].cli)) {
      p.log.warn(`${selectedAgent} binary not found`);
      box(color.bold("Next steps"), commandHintLines);
      p.outro(`Install ${selectedAgent}, then run: ${color.cyan(AGENT_CONFIG[selectedAgent].cli)}`);
      process.exit(0);
    }

    console.log();
    box(color.green("Once the agent opens"), commandHintLines);
    console.log();

    const confirmLaunch = await p.text({
      message: `Press ${color.bold(color.cyan("Enter"))} to launch ${color.bold(selectedAgent)}...`,
      placeholder: "",
      defaultValue: "",
    });

    if (p.isCancel(confirmLaunch)) {
      p.cancel("Migration cancelled.");
      process.exit(0);
    }

    launchAgent(selectedAgent);
  } else if (selectedAgent) {
    const manualLines = [
      `${color.white("Run:")} ${color.bold(color.cyan(AGENT_CONFIG[selectedAgent].cli))}`,
      "",
      ...commandHintLines,
    ];
    console.log();
    box(color.bold("Next steps"), manualLines);
    p.outro(color.green("Ready to migrate!"));
    process.exit(0);
  } else {
    console.log();
    p.log.info(`See ${color.cyan("MIGRATION.md")} for manual migration steps.`);
    p.outro(color.green("Package upgraded to v2!"));
    process.exit(0);
  }
}

/** Install migrate command wrapper */
function installMigrateCommand(skillName, agent) {
  const cwd = process.cwd();
  const config = AGENT_CONFIG[agent];
  const commandDir = join(cwd, config.commandDir);
  const commandFile = join(commandDir, "migrate-better-result.md");

  mkdirSync(commandDir, { recursive: true });

  if (existsSync(commandFile)) {
    return { success: true, message: `${commandFile}`, existed: true };
  }

  const commandContent = `---
description: Migrate TaggedError classes from better-result v1 to v2
---

Load and use the ${skillName} skill to migrate this codebase.

First, invoke the skill:

\`\`\`
skill({ name: '${skillName}' })
\`\`\`

Then follow the skill instructions to migrate TaggedError classes.

<user-request>
$ARGUMENTS
</user-request>
`;

  writeFileSync(commandFile, commandContent);
  return { success: true, message: `${commandFile}`, existed: false };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const command = args[0];

  if (command === "migrate") {
    return runMigrate();
  }

  if (command !== "init") {
    printHelp();
    process.exit(command ? 1 : 0);
  }

  return runInit();
}

// ─────────────────────────────────────────────────────────────────────────────
// Init Command
// ─────────────────────────────────────────────────────────────────────────────

async function runInit() {
  // ─────────────────────────────────────────────────────────────────────────
  // Interactive init flow
  // ─────────────────────────────────────────────────────────────────────────

  console.log();
  p.intro(color.bgCyan(color.black(" better-result ")));

  const skills = discoverSkills();
  const adoptSkill = skills.find((s) => s.id === "adopt");
  if (!adoptSkill) {
    p.log.error("adopt skill not found in package");
    process.exit(1);
  }

  const meta = parseSkillMeta(adoptSkill.skillFile);

  // Detect defaults
  const detectedPM = detectPackageManager();
  const configuredAgent = detectConfiguredAgent();
  const availableAgents = getAvailableAgents();
  const detectedAgent =
    configuredAgent ?? (availableAgents.length > 0 ? availableAgents[0] : null);

  // Build package manager options
  const pmList = /** @type {PackageManager[]} */ (["npm", "bun", "pnpm"]);
  const pmOptions = pmList.map((pm) => ({
    value: pm,
    label: pm === detectedPM ? `${pm} ${color.dim("(detected)")}` : pm,
  }));
  if (detectedPM) {
    const idx = pmOptions.findIndex((o) => o.value === detectedPM);
    if (idx > 0) {
      const [detected] = pmOptions.splice(idx, 1);
      pmOptions.unshift(detected);
    }
  }

  // Build agent options
  const agents = /** @type {Agent[]} */ (["opencode", "claude", "codex"]);
  const agentOptions = agents.map((agent) => ({
    value: agent,
    label: agent === detectedAgent ? `${agent} ${color.dim("(detected)")}` : agent,
  }));
  if (detectedAgent) {
    const idx = agentOptions.findIndex((o) => o.value === detectedAgent);
    if (idx > 0) {
      const [detected] = agentOptions.splice(idx, 1);
      agentOptions.unshift(detected);
    }
  }

  const onCancel = () => {
    p.cancel("Setup cancelled.");
    process.exit(0);
  };

  const responses = await p.group(
    {
      pm: () =>
        p.select({
          message: "Package manager",
          options: pmOptions,
          initialValue: detectedPM ?? "npm",
        }),
      installTools: () =>
        p.confirm({
          message: "Install AI agent skill + command?",
          initialValue: true,
        }),
    },
    { onCancel }
  );

  const selectedPM = /** @type {PackageManager} */ (responses.pm);

  // Conditional: agent selection + opensrc + launch option
  /** @type {Agent | null} */
  let selectedAgent = null;
  let shouldLaunch = false;
  let installOpensrc = false;

  if (responses.installTools) {
    const toolResponses = await p.group(
      {
        agent: () =>
          p.select({
            message: "AI coding agent",
            options: agentOptions,
            initialValue: detectedAgent ?? "opencode",
          }),
        opensrc: () =>
          p.confirm({
            message: `Add source code for better AI context? ${color.dim(`(${link("opensrc", "https://github.com/anthropics/opensrc")})`)}`,
            initialValue: true,
          }),
        launch: () =>
          p.confirm({
            message: "Launch agent after install?",
            initialValue: true,
          }),
      },
      { onCancel }
    );

    selectedAgent = /** @type {Agent} */ (toolResponses.agent);
    installOpensrc = Boolean(toolResponses.opensrc);
    shouldLaunch = Boolean(toolResponses.launch);
  }

  // Install package
  const s = p.spinner();
  s.start("Installing better-result package");

  try {
    const installCmd =
      selectedPM === "npm"
        ? "npm install better-result"
        : selectedPM === "bun"
          ? "bun add better-result"
          : "pnpm add better-result";
    execSync(installCmd, { stdio: "ignore", cwd: process.cwd() });
    s.stop("Package installed");
  } catch {
    s.stop("Package install failed (may already be installed)");
  }

  // Install source code via opensrc for better AI context
  if (installOpensrc) {
    const s3 = p.spinner();
    s3.start("Fetching source code for AI context");

    try {
      // --modify to auto-update .gitignore, tsconfig, AGENTS.md
      execSync("npx -y opensrc better-result --modify", { stdio: "ignore", cwd: process.cwd() });
      s3.stop("Source code added to opensrc/");
    } catch (err) {
      s3.stop(color.yellow("Source fetch failed (opensrc may not be available)"));
    }
  }

  // Install skill + command (if selected)
  if (selectedAgent) {
    const s2 = p.spinner();
    s2.start(`Installing skill + command for ${selectedAgent}`);

    const skillResult = installSkill(adoptSkill.path, meta.name, selectedAgent);
    const commandResult = installCommand(meta.name, selectedAgent);

    s2.stop("Skill + command installed");

    p.log.success(
      `Skill: ${color.dim(skillResult.message)}${skillResult.existed ? color.dim(" (existed)") : ""}`
    );
    p.log.success(
      `Command: ${color.dim(commandResult.message)}${commandResult.existed ? color.dim(" (existed)") : ""}`
    );
  }

  /** Strip ANSI codes for length calculation */
  const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

  /** Print a styled box with title and message */
  function box(title, lines) {
    const titlePlain = stripAnsi(title);
    const maxLen = Math.max(...lines.map((l) => stripAnsi(l).length), titlePlain.length + 4);
    const padding = maxLen - titlePlain.length - 2;
    const top = `${color.dim("┌──")} ${title} ${color.dim("─".repeat(Math.max(0, padding)) + "┐")}`;
    const bot = color.dim(`└${"─".repeat(maxLen + 2)}┘`);
    console.log(top);
    for (const line of lines) {
      const plainLen = stripAnsi(line).length;
      console.log(`${color.dim("│")} ${line}${" ".repeat(maxLen - plainLen)} ${color.dim("│")}`);
    }
    console.log(bot);
  }

  const commandHintLines = [
    `${color.white("Run")} ${color.bold(color.cyan("/adopt-better-result"))} ${color.white("to start adoption.")}`,
    "",
    color.yellow("This will analyze your codebase and suggest changes."),
    color.dim("It may take a few minutes depending on project size."),
  ];

  // Launch or show next steps
  if (selectedAgent && shouldLaunch) {
    if (!hasBinary(AGENT_CONFIG[selectedAgent].cli)) {
      p.log.warn(`${selectedAgent} binary not found`);
      box(color.bold("Next steps"), commandHintLines);
      p.outro(`Install ${selectedAgent}, then run: ${color.cyan(AGENT_CONFIG[selectedAgent].cli)}`);
      process.exit(0);
    }

    console.log();
    box(color.green("Once the agent opens"), commandHintLines);
    console.log();

    const confirmLaunch = await p.text({
      message: `Press ${color.bold(color.cyan("Enter"))} to launch ${color.bold(selectedAgent)}...`,
      placeholder: "",
      defaultValue: "",
    });

    if (p.isCancel(confirmLaunch)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    launchAgent(selectedAgent);
  } else if (selectedAgent) {
    const manualLines = [
      `${color.white("Run:")} ${color.bold(color.cyan(AGENT_CONFIG[selectedAgent].cli))}`,
      "",
      ...commandHintLines,
    ];
    console.log();
    box(color.bold("Next steps"), manualLines);
    p.outro(color.green("Done!"));
    process.exit(0);
  } else {
    p.outro(color.green("Done!"));
    process.exit(0);
  }
}

main().catch((err) => {
  p.log.error(err.message);
  process.exit(1);
});
