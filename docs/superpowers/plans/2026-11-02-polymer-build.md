# Polymer assembly implementation plan

User approved the code design in chat and authorized implementation. Existing home.vue owns the settings UI; no new settings component.

## Contracts

- `captureMonomerGeometry(atoms, sites)` saves head/tail retained and removed serials, coordinate arrays, unit direction (retained -> removed), original bond length before deletion.
- `placeMonomer(template, anchor, joiningRole, options)` rotates around the new monomer's removed atom then translates to the target retained endpoint; transforms both reference sites and all real atoms.
- `buildPolymer(type, template, {n,bondLength,twist})` produces `{units,connections}`. Separate head-tail and head-head implementations; head-head alternates head/head and tail/tail. n is total units.
- `serializePolymer(result)` remaps all local IDs to unique PDB serials and outputs explicit internal/inter-unit connections.
- Deletion commits a plain, independent `{atoms,geometry}` template only after successful rendering. Builds always use this template. Import/restart invalidate it.
- Controller owns UI coordination and rollback through existing text replacement; algorithms do not read Vue/component state. Shared busy state prevents concurrent operations.

## Execution

- [x] Pure geometry, placement, separate builders, validation and output modules with node:test coverage.
- [x] Capture/template lifecycle and independent build controller with flow tests.
- [x] Existing home.vue settings: type, n, explicit target length, twist and apply action.
- [x] Full tests/build and main-agent code/diff review. Delegated independent review was interrupted by a usage limit.

No implicit business closures; no dependency installation or commits. Preserve existing user changes and sample PDB. Reuse lowercase MathUtils rotation methods; core.js's path-only loop is not a full molecule assembler.

## Limits

This implements geometric assembly and new single bonds, not force-field relaxation or chemical reaction inference. Target bond length is explicit user input. PDB numbering/coordinate limits must be checked before rendering.

## Verification

- `node --test`: 46 tests passed, including real 3Dmol parser roundtrips for both connection modes.
- Flow tests cover immutable spatial snapshots, repeated builds, failed-render rollback, template invalidation, and instance isolation.
- `npm run build`: passed; existing 3Dmol eval and bundle-size warnings remain.
- `git diff --check`: passed. No interactive browser/WebGL verification was performed.

Usage: mark head/tail, apply deletion, choose connection type and total unit count, enter target bond length in Å, optionally set twist in degrees, then apply settings. Repeating this operation uses the saved monomer. Restarting site marking restores the imported molecule.
