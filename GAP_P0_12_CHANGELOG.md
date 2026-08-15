# GAP-P0-12 tests-first changelog

- 2026-08-12: REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED — obsolete R1 candidate self SHA-256 `9810985a54cd78a61f663cfd0b347e642df9c54e081828afb01d8cca758960d3`. It invented a proxy dependency bag, `{composition, ready}`, task/state aliases, and activation callbacks that the public app does not expose.
- 2026-08-12: R2 uses the real synchronous factory signature and direct `StartFiveAppComposition`. The only proposed surface accessed by a local structural cast is `composition.localBackup`.
- 2026-08-12: R2 seeds and mutates tasks through `composition.service`, reads state/history through existing public composition members, and mounts the actual `AppRoot` to pin recovery before the first visible activation route.
- 2026-08-12: R2 strengthens the writer race: the concurrent export must equal the after-write bytes and must differ from the first export.
- 2026-08-12: TypeScript's only fixture finding was mechanically corrected by awaiting this repository's asynchronous RN `render`. Scoped Jest then constructed the real composition and reported exactly three legal-red failures, all solely `LOCAL_BACKUP_UNAVAILABLE` at `composition.localBackup`.
- 2026-08-12: R2 candidate manifest self SHA-256 is `f409337b4eed3392671d4f539ab0401e351255ddd32c8cd85c2372868c9311e7`.
- 2026-08-12: The candidate manifest contains exactly the specification, test kit, and one exactly-three-test journey suite. This changelog is excluded from the manifest.
- 2026-08-12: REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED — obsolete R2 candidate self SHA-256 `f409337b4eed3392671d4f539ab0401e351255ddd32c8cd85c2372868c9311e7`. Its future-schema/reference vectors were arbitrary byte edits rather than independently valid public wire artifacts, and it did not pin notification reconciliation idempotence across another byte restart.
- 2026-08-12: R3 publishes the canonical v1 JSON wire fields required to construct semantic invalid vectors, recomputes their embedded integrity digest, preserves opaque store payloads for the missing-reference case, and keeps corrupt/truncated vectors opaque.
- 2026-08-12: R3 preserves ambiguous persist-then-throw set faults at ordinals 1, 2, and 4, removes the custom recovery pause, and uses bounded real-AppRoot route observation.
- 2026-08-12: R3 snapshots scheduler calls/IDs after initial reconciliation and requires repeated recovery, `already_restored`, and an additional byte restart to make no further replacement and preserve exact IDs.
- 2026-08-12: R3 TypeScript passes. Scoped Jest constructs the real composition and reports exactly three legal-red failures, all solely `LOCAL_BACKUP_UNAVAILABLE` at the proposed `composition.localBackup` surface.
- 2026-08-12: R3 candidate manifest has exactly three entries and self SHA-256 `9937444684ff42bf076bce3c7aebc1d3493a9cc4de653dc44a7a0377dad8d8c8`.
