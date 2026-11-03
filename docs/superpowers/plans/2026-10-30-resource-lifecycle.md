# Resource lifecycle refactor implementation plan

> Execute inline using executing-plans; verify with test-driven-development and a final independent review.

**Goal:** Preserve the existing UI, component and utility interfaces while replacing implicit business closures and releasing obsolete viewer resources.

**Architecture:** A per-component MoleculeViewerController owns rendering and interactions. SiteSelection owns Vue refs and a disposable effect scope. Module-level helpers receive their data explicitly. A small 3Dmol 2.5.5 adapter records construction-time global listeners for removal and disconnects the library's observers.

**Tech stack:** Existing Vue 3, Vite, 3Dmol 2.5.5, Node built-in tests; no new runtime dependencies.

**Spec:** User-approved design in this chat: ordinary class methods, explicit arguments, stable bound callbacks, unchanged interfaces and functionality. The missing no-closures skill is superseded for this task by the user's instruction to proceed under those discussed rules.

## Constraints and rulings

- Work in the existing checkout as requested; preserve the pre-existing viewer.vue edits and untracked moleculeGraph.js. Do not commit, stash or reset user changes.
- Bind callbacks once; dispose registrations and clear references. No business function implicitly captures a function/component variable; imported module helpers and constants are allowed.
- Keep Vue refs and watch batching, and preserve reset's immediate notification.
- No dependency source edits. The 3Dmol adapter temporarily records window/body event registration only during synchronous construction and restores the original methods in finally.
- Do not lose a shared WebGL context. Release owned model/shape geometries and materials, disconnect observers, remove canvas and clear callback references.

## Review focus

1. Multiple component instances and detached/destructured methods.
2. Queued watch/RAF callbacks after disposal or model replacement.
3. Model indices versus atom serials, confirmed head/tail highlights.
4. Abandoned async file imports and repeated disposal.
5. Third-party global listeners, observers, GPU resources and constructor failures.

## Tasks

- [ ] Capture baseline selection/PDB/graph behavior with Node tests; baseline build.
- [ ] Add SiteSelection and retain useSiteSelection(onChange)'s public return shape; test notification batching and scope disposal.
- [ ] Add the lifecycle adapter and MoleculeViewerController; integrate viewer.vue; test real viewer creation/replacement/disposal in a browser where available.
- [ ] Move home business state into ordinary class methods; remove utility captures without altering results.
- [ ] Run all tests, closure audit, production build and independent review; report limits honestly.

## Execution ledger

- Baseline: current checkout is main with user edits in viewer.vue and untracked moleculeGraph.js.
- Baseline build: sandbox spawn EPERM; rerun outside sandbox passed. Existing warnings: 3Dmol eval and bundle size >500 kB.
