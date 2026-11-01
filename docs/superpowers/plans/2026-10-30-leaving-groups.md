# Leaving Groups Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement and verify this small change in the current session.

**Goal:** Calculate head/tail leaving-group serials using iterative DFS without changing the molecule.

**Architecture:** A pure `LeavingGroupFinder.js` converts model indices to serial adjacency and searches each site independently. The viewer exposes a query; small parameter-driven settings handlers validate the tail candidate before committing selection and store results in home.vue.

**Tech Stack:** Existing Vue 3, JavaScript ES modules, node:test; no new dependencies.

**Spec:** The user-approved code and first-version design in this chat: skip one selected bond, traverse from its non-retained endpoint, reject cycles and conflicting head/tail groups.

## Global Constraints

- Preserve existing uncommitted work; edit only this feature's integration points.
- Business dependencies must be explicit parameters or instance state (no-closures).
- Keep current site data shape and serial/index distinction.
- Do not delete atoms or implement ring-opening polymerization.
- User authorized implementation and verification; no further design approval needed.

## Review Focus

- Sparse/shuffled indices, one-sided bonds and disconnected atoms.
- Cycles, overlapping groups and removal of the other retained endpoint.
- Invalid tail selection must remain editable; success must store both results.
- Restart/import reset must clear results and errors.
- Missing model and repeated component instances must not reuse stale data.

## Task 1: Search module

- [x] Add `tests/leavingGroups.test.js` with literal fixtures covering the above graph cases, input immutability and invalid data.
- [x] Run `node --test tests/leavingGroups.test.js` and observe missing-feature failure.
- [x] Add `src/utils/LeavingGroupFinder.js` exporting `findLeavingGroups(atoms, sites)` -> `{ head: serial[], tail: serial[] }`; errors throw without partial output.
- [x] Run the search tests; expect all passing.

## Task 2: Minimal integration

- [x] Add `tests/siteSettings.test.js` using real selection state, query controller and settings handlers; test confirmation, correction after failure, missing model, reset and isolation.
- [x] Observe failure before implementation.
- [x] Add `src/utils/siteSettings.js` with parameter-driven confirmation/start/reset handlers.
- [x] Add controller query and viewer exposure; bind handlers with explicit state in home.vue and show errors beneath confirmation.
- [x] Run `node --test`, `npm run build`, and `git diff --check`.
- [x] Independent read-only review of the changed code.

## Execution record

- Ruling: Work in the existing dirty workspace without commits or worktree migration, preserving the user's current viewer/controller changes that this integration depends on.
- Baseline: five existing node:test cases passed.
- Task 1 complete: missing-module failure observed before implementation; eight graph tests then passed.
- Task 2 complete: missing-module failure observed before implementation; full suite 17/17 passed on 2026-11-01. Build exited 0 with 3Dmol eval and chunk-size warnings. Diff whitespace check passed.
- Ruling: Allow restart during editing so an invalid confirmed head can be corrected; show group counts after success. Existing importer and useSiteSelection closures are outside this feature; all added handlers use explicit arguments or instance state.
- Browser/WebGL manual interaction has not been verified.
- Independent review found no actionable defects and independently reran all 17 tests successfully.
