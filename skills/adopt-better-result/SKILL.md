---
name: adopt-better-result
description: Adopt better-result in an existing TypeScript codebase. Use for a repository-wide error-handling audit and proposal, or for implementing a named vertical slice with TaggedError and Result.
---

# Adopt better-result

Start with evidence, then work at the scale named by the user.

## Choose the branch

- **Audit branch:** Use when the user requests a repository-wide audit or proposal, or has not named an implementation slice. Complete the audit branch before changing production code.
- **Named-slice branch:** Use when the user explicitly requests implementation of a function, module, boundary, or previously proposed slice. Limit evidence collection to that slice and its propagation path.

An approved slice from the audit branch continues through the named-slice branch.

## Audit branch: repository-wide proposal

### 1. Establish the repository and API facts

Read the repository instructions, package manifests, source layout, test commands, and architecture documentation. Determine whether `better-result` is installed and which version/API is available. Prefer installed types and source over remembered APIs.

Map every production-code area before studying individual failures. Exclude generated and vendored code from the audit; inspect tests for intended behavior.

**Complete when:** every production-code area is listed, the validation commands are known, and the available `better-result` API has been verified.

### 2. Audit every production-code area

Follow [`references/repository-audit.md`](references/repository-audit.md). Trace search evidence into end-to-end failure paths, keep grouped sites accountable with counts, and record obscured paths as unknown.

Write the audit to the repository's established documentation or planning location, falling back to `docs/better-result-adoption.md`.

**Complete when:** the report satisfies the coverage and completion requirements in `repository-audit.md`.

### 3. Design the target model

Apply the failure taxonomy in [`references/tagged-errors.md`](references/tagged-errors.md) and make each boundary decision with [`references/result-boundaries.md`](references/result-boundaries.md). Add the proposed dispositions, user-facing mappings, boundary decisions, and ranked vertical migration slices to the report.

Recommend the best first slice and explain why it is bounded and valuable.

**Complete when:** every catalogued failure has a disposition, every boundary has a recorded codec decision, and one first slice is recommended.

### 4. Present the approval gate

Present the report and recommendation. The audit branch's only repository change is the report.

**Complete when:** the report is presented. An explicit approval of one named vertical slice starts the implementation branch; otherwise the run ends here.

## Named-slice branch: implementation

### 1. Establish the slice and API facts

Read the repository instructions, validation commands, installed `better-result` API, relevant production code, and tests. Trace the named failure source through its immediate callers to its handling or transport boundary. Reuse an existing adoption report when present; otherwise retain the evidence for the implementation summary.

**Complete when:** the slice boundary, current behavior, failure variants, callers, side effects, and transport boundaries are accounted for, and the available API is verified.

### 2. Implement one vertical slice

Follow [`references/vertical-slice-migration.md`](references/vertical-slice-migration.md), using [`references/tagged-errors.md`](references/tagged-errors.md) for failure dispositions and [`references/result-boundaries.md`](references/result-boundaries.md) for boundary contracts. Keep the implementation within the named propagation path.

**Complete when:** the path is consistently Result-based from failure source to its chosen handling boundary, with every error variant handled and every control-flow seam accounted for.

### 3. Verify and report

Run the repository's applicable format, lint, type-check, and relevant test commands. Update an existing adoption report with completed work, deviations, discoveries, and validation evidence; otherwise include them in the user-facing summary. End after recommending the next slice.

**Complete when:** all applicable checks pass, or every failure is reported with evidence, and the report or summary accurately describes the repository's current state.
