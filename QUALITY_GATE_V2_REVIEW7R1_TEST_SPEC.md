# Quality Gate V2 Review7R1 Controlled Consistency-Correction Specification

## Status and authority boundary

Review7R1 is a controlled consistency correction of the frozen Review7
candidate. It changes no production source, package script, accepted lock,
registry entry, generated report, or prior test asset. Review7 remains
byte-exact at candidate self SHA-256
`eeaaf8a49e9f5f94efd32df93409c2f58f0fae29edbf5c6cb1ec046a72522db1`
and is **SUPERSEDED FOR PRODUCTION-SHA SELF-CONTRADICTION / NEVER ACCEPTED /
NO PRODUCTION AUTHORITY**.

The only corrected oracle is the frozen-identity assertion that required
`scripts/quality-gate-v2/index.cjs` to retain its pre-repair SHA-256. Such an
assertion makes every authorized production repair fail by definition.
Review7R1 therefore requires that production file to exist as a regular file
and have a lowercase 64-hex SHA-256, without fixing its content to a historical
value. All Review7 behavior, test count, test kit, declaration, path, union,
BigInt, CLI, package, registry, report, and prior-candidate identity contracts
remain semantically unchanged.

Review7R1 is **CONTROLLED CONSISTENCY CORRECTION / PENDING MANAGER ACCEPTANCE /
NO PRODUCTION AUTHORITY**.

## Frozen history and compatibility

Review7R1 retains these exact frozen candidate identities:

- Review4: `a3425a6fd3717cd76a35535ef9f078daf2bcf6a4bfd260e59ae45b6da659c05a`;
- Review5: `51b7310aa27023946ca4419f5ed63acbeb81daa6c6c2d18a5ff335368cbcdecd`;
- Review6: `06fef112b420faa514ceb13cf1131a1100f58d6796da40aab6835734ba4faec1`;
- Review7: `eeaaf8a49e9f5f94efd32df93409c2f58f0fae29edbf5c6cb1ec046a72522db1`.

Review5, Review6, and Review7 remain **REVIEW FAILED OR SUPERSEDED / NEVER
ACCEPTED / NO PRODUCTION AUTHORITY**. No byte of their specifications, tests,
test kits, declarations, or candidate locks may change. Review7's changelog is
excluded from its candidate lock and may receive only the supersession record.

## Review7R1 behavior contract

The seven Review7 test assets are mechanically copied under
`tests/quality-gate-v2-review7r1/`, with only import-path/name adjustments
needed for the new directory and the single frozen-identity correction above.
The suite remains 5 suites / 36 tests. All production-facing behavior oracles
remain equivalent, including:

- complete selected-companion and current-Node ancestor consistency;
- fail-closed or baseline-bound union behavior;
- shell-free validation-to-spawn binding for canonical Windows paths;
- lossless BigInt `dev`/`ino` identity comparison;
- stable code-only public CLI rejection layering;
- retained Review6 classification and union contracts; and
- byte-exact package, accepted registry, canonical report pair, and frozen
  Review4/Review5/Review6 candidate identities.

The frozen-identity suite must verify that
`scripts/quality-gate-v2/index.cjs` exists, is a regular non-reparse file, and
hashes to a lowercase 64-hex SHA-256. It must not require any particular
production digest.

## Evidence and lock rules

No formal Quality Gate CLI or broad regression matrix may run while authoring
this correction. The focused Review7R1 run is expected to show 5 suites / 36
tests = 32 green + 4 legitimate production-dependent red, with global
`tsc --noEmit` at zero diagnostics. Existing evidence for Review4 (20) and
Review2 (16) is retained and need not be rerun.

After mechanical checks, generate
`QUALITY_GATE_V2_REVIEW7R1_LOCK.sha256.candidate` last. Its inventory is this
specification first, followed by all seven regular files under
`tests/quality-gate-v2-review7r1/` in POSIX order. It excludes itself and
`QUALITY_GATE_V2_REVIEW7R1_LOCK_CHANGELOG.md`. All eight assets must be LF-only,
UTF-8 without BOM, regular non-reparse files, and free of focused/skipped tests,
timers, polling, TypeScript suppression, explicit `any`, shell launch, and
parent-environment mutation.

