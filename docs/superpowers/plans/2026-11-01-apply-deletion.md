# Apply deletion implementation plan

User approved an independent button, pure PDB transformation, and explicit state orchestration. Preserve existing uncommitted changes; implement in place without new dependencies.

- [x] Test and implement `removeAtomsFromPdb(text, serials, atoms)`: single-model PDB only; preserve retained atom lines; clean attached records; reconstruct explicit bonds from the current model, including bond orders. Reject unsupported structural references and model/text mismatches.
- [x] Test and implement `PdbDeletionController`: atom-query dependency, apply/restart/import text lifecycle, endpoint preservation, error and duplicate-click guards. Keep UI and parser dependencies separate.
- [x] Add stateless `ApplyDeletion.vue`, wire home refs and callbacks, expose model snapshot, disable inferred bonds only for generated text.
- [x] Verify tests/build and independent review. No manual browser validation claimed.

Scope: calculations and deletion only; no polymer chain construction. All new business dependencies use parameters, imports or instance state. Current original model restoration uses the existing viewer watch.

## Verification (2026-11-02)

- 28 node:test cases pass, including actual 3Dmol parser roundtrip, double-bond retention, file-read races, model acknowledgement failure and rollback.
- `npm run build` succeeds; dependency eval and bundle-size warnings remain. `git diff --check` passes.
- First independent review found early state commit on rendering failure. A regression test reproduced it; `replaceText` now validates the completed viewer model before committing selection/group changes and restores previous text/inference on failure.
- Final independent review found viewer selection lost during rollback. The regression test now simulates this clearing; rollback explicitly restores the existing selection snapshot. All 28 tests and the build passed after the fix.
- No manual browser/WebGL interaction verified. Existing changes were preserved; no dependencies added.

## Module interfaces

- `ApplyDeletion.vue`: `available`, `busy` props and `apply` event; no molecule state.
- `removeAtomsFromPdb(text, serials, atoms)`: pure text conversion, no Vue or viewer dependency.
- `PdbDeletionController`: explicit refs and site interface; owns original text, connection endpoints, apply/restart/acceptText lifecycle.
- `importPdbFile(state)`: file-reading and stale-request checks; calls the injected text receiver.
- Viewer: returns topology snapshots and confirms the text only after loading/rendering succeeds.
