#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const loadTypeScript = () => {
  const projectRequire = createRequire(path.join(process.cwd(), "package.json"));
  try {
    return projectRequire("typescript");
  } catch (projectError) {
    try {
      return createRequire(import.meta.url)("typescript");
    } catch {
      console.error(
        "TaggedError v3 migration: install TypeScript in the target project before running this codemod",
      );
      if (process.env.DEBUG) console.error(projectError);
      process.exit(2);
    }
  }
};

const ts = loadTypeScript();

const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const excludedDirectoryNames = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "vendor",
]);

const args = process.argv.slice(2);
const modes = args.filter((arg) => arg === "--list" || arg === "--write" || arg === "--check");
if (modes.length > 1) {
  console.error("TaggedError v3 migration: choose one of --list, --write, or --check");
  process.exit(2);
}

const mode = modes[0] ?? "--list";
const roots = args.filter((arg) => !arg.startsWith("--"));
if (roots.length === 0) roots.push(".");

const isTaggedErrorFactory = (expression) => {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 1) return false;

  if (ts.isIdentifier(expression.expression)) {
    return expression.expression.text === "TaggedError";
  }

  return (
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === "TaggedError"
  );
};

const findTrailingCallEdits = (sourceFile) => {
  const edits = [];

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 0 &&
      node.typeArguments !== undefined &&
      node.typeArguments.length > 0 &&
      isTaggedErrorFactory(node.expression)
    ) {
      const typeArgumentsEnd = node.typeArguments.end;
      const deleteEnd = node.end;
      const trailingText = sourceFile.text.slice(typeArgumentsEnd, deleteEnd);
      if (/^>\s*\(\s*\)$/.test(trailingText)) {
        const deleteStart = typeArgumentsEnd + 1;
        const location = sourceFile.getLineAndCharacterOfPosition(deleteStart);
        edits.push({
          start: deleteStart,
          end: deleteEnd,
          line: location.line + 1,
          column: location.character + 1,
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return edits;
};

const collectSourceFiles = async (entryPath) => {
  const absolutePath = path.resolve(entryPath);
  const entries = await readdir(absolutePath, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOTDIR" && sourceExtensions.has(path.extname(absolutePath))) {
      return undefined;
    }
    throw error;
  });

  if (entries === undefined) return [absolutePath];

  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && excludedDirectoryNames.has(entry.name)) continue;

    const childPath = path.join(absolutePath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(childPath)));
    } else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(childPath);
    }
  }
  return files;
};

const files = [...new Set((await Promise.all(roots.map(collectSourceFiles))).flat())].sort();
let matchCount = 0;
let fileCount = 0;

for (const filePath of files) {
  const sourceText = await readFile(filePath, "utf8");
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const edits = findTrailingCallEdits(sourceFile);
  if (edits.length === 0) continue;

  matchCount += edits.length;
  fileCount++;

  for (const edit of edits) {
    console.log(`${path.relative(process.cwd(), filePath)}:${edit.line}:${edit.column}`);
  }

  if (mode === "--write") {
    let migratedText = sourceText;
    for (const edit of edits.sort((left, right) => right.start - left.start)) {
      migratedText = migratedText.slice(0, edit.start) + migratedText.slice(edit.end);
    }
    await writeFile(filePath, migratedText);
  }
}

if (mode === "--write") {
  console.log(`Migrated ${matchCount} TaggedError declaration(s) in ${fileCount} file(s).`);
} else if (matchCount === 0) {
  console.log("No better-result 2.x TaggedError trailing calls found.");
} else {
  console.log(
    `Found ${matchCount} better-result 2.x TaggedError trailing call(s) in ${fileCount} file(s).`,
  );
}

if (mode === "--check" && matchCount > 0) process.exit(1);
