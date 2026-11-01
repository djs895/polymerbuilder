# Apply deletion implementation plan

User approved an independent button, pure PDB transformation, and explicit state orchestration. Preserve existing uncommitted changes; implement in place without new dependencies.

- [ ] Test and implement `removeAtomsFromPdb(text, serials, atoms)`: single-model PDB only; preserve retained atom lines; clean attached records; reconstruct explicit bonds from the current model, including bond orders. Reject unsupported structural references and model/text mismatches.
- [ ] Test and implement `PdbDeletionController`: atom-query dependency, apply/restart/import text lifecycle, endpoint preservation, error and duplicate-click guards. Keep UI and parser dependencies separate.
- [ ] Add stateless `ApplyDeletion.vue`, wire home refs and callbacks, expose model snapshot, disable inferred bonds only for generated text.
- [ ] Verify tests/build and independent review. No manual browser validation claimed.

Scope: calculations and deletion only; no polymer chain construction. All new business dependencies use parameters, imports or instance state. Current original model restoration uses the existing viewer watch.
