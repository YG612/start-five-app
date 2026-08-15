# GAP-P0-05R1 candidate lock changelog

## Status

**PENDING ONE DELTA REVIEW / NO NEW PRODUCTION AUTHORITY.**

Candidate manifest self:
`8cea956ea6e5f1d3033eb06d596be8a8c0b8ec8a6c0428fa92000b5002ea0844`.

This changelog is deliberately excluded from the three-entry candidate
manifest.

## Controlled supersession

The frozen GAP-P0-05 candidate self
`66664505662a3ab2cd3ff4e6073214408b68ebc8377f0dfe6443de0ab4d76609`
passed independent test review and remains byte-for-byte unchanged. It is
**CONTROLLED SUPERSEDED FOR FIXTURE CONSISTENCY / NEVER USED FOR PRODUCTION**.
This is not a quality-failure characterization of the original review.

## Exact R1 delta

- mechanically copied the original six-test contract and testkit into
  `tests/gap-p0-05r1/`;
- changed only the restart and exactly-once-expiry task seeds from the default
  pending task to
  `makeAppTask({status: 'in_progress', startedAt: P0_05_STARTED_AT})`;
- preserved all six test names, assertions, clocks, IDs, failure branches, and
  behavior oracles; and
- changed no production file, original GAP-P0-05 asset, or old test root.

The R1 testkit hash is exactly equal to the frozen original testkit hash:
`a3f02b0ad44d260c5cd3cf68fd0faf368f42432603770fda91ecfa197239b9aa`.

## Verification

- R1 Jest root: **1 suite passed / 6 tests passed / 0 failed / 0 snapshots**,
  14.219 seconds, no open-handle error.
- Main `tsc --noEmit`: **exit 0**.
- No old regression, GAP-P0-02B bulk, broad suite, formal quality gate, or
  registry command was run.

One independent delta reviewer must accept the exact manifest self above
before R1 may authorize any production repair.
