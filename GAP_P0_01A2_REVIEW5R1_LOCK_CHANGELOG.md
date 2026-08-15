# GAP-P0-01A2 Review5R1 candidate audit log

## 2026-08-09 - controlled gate-settlement correction

- Original Review5 candidate self
  `cb335bd66869bd1da1b4af09cdf4b45f7a00d26d3980fb0931ba02b3c8392187`
  remains exact but is **CONTROLLED SUPERSEDED / NEVER ACCEPTED** because its
  armed gate's `applied` promise could be settled by the earlier plan-lock CAS.
- R1 adds one specification and mechanically copies the two Review5 TypeScript
  files below `tests/gap-p0-01a2-review5r1/`. The original Review5 directory and
  candidate are not edited.
- The contract suite is byte-identical to its Review5 source. The helper changes
  only the local gate variable flow: `delayedGate` is assigned exclusively when
  the primary-record condition enters and waits, and only that local gate is
  settled after the physical comparison.
- The recorded production diagnostic SHA-256 is
  `9795542d40a52f5eeab6e7eb89bfdeedbb58dfb70064865ae4736b6df3f5705d`.
  It proves why the original early `true` signal contradicted the actual old-CAS
  behavior, but production is not part of this candidate manifest.
- No production, original Review5 asset, prior test/lock, configuration,
  package, registry, report, native project, unrelated workstream, or
  `outputs/qingji-ai` file is modified by this correction.
- Main `tsc --noEmit` completed with exit 0 and zero diagnostics.
- Mechanical diff verification proves the R1 contract suite is byte-identical
  to Review5 (`ab4fecd99ef59f4d9e3d60316f7cf11006fc251790c9477126774996e8f59674`)
  and the helper diff contains only the single local gate-ownership hunk
  specified above, with no trailing-byte or unrelated change.
- Final R1 candidate self:
  `2a9aab86be87fb288bfd722ef1b7c8b17e5efa1453bbce64e4c22f9f5465b1f0`.
  Its three entries, every listed SHA-256, exact two-file recursive inventory,
  regular non-reparse status, and zero forbidden-category matches were
  mechanically reverified.

The R1 changelog is audit-only and intentionally excluded from the candidate
manifest. Status: **PENDING ONE INDEPENDENT TEST REVIEW / NO PRODUCTION
AUTHORITY.**
