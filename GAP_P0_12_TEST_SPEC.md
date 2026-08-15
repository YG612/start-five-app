# GAP-P0-12 — Local backup and empty-install restore (R3)

Status: tests-first contract; the only proposed public addition is
`StartFiveAppComposition.localBackup`.

## Real public harness

Every composition is created synchronously through the actual
`createStartFiveApp({storageBackend, now, idGenerator, focusRuntimeClock,
tomorrowFirstNotifications, public})` signature. The return value is used
directly as `StartFiveAppComposition`; there is no wrapper, `ready` promise,
dependency proxy, fixture dependency, test-only task API, or synthetic public
state reader.

Fixtures are created through the existing `composition.service` task methods.
State and history assertions use `composition.service.getState()` and
`composition.reviewHistory.listReceiptHistory()`. Cold-start behavior mounts
the real `composition.AppRoot` and observes its onboarding/workspace routes.
Only a local structural cast exposes the proposed `composition.localBackup`:

- `exportBackup(): Promise<{bytes, digestSha256, preview}>`
- `inspectBackup(bytes): Promise<{digestSha256, preview}>`
- `restoreBackup(bytes): Promise<{status, digestSha256, preview}>`
- `recoverPendingRestore(): Promise<{status, digestSha256?}>`

Until that property exists, each of the exactly three journeys fails only with
`LOCAL_BACKUP_UNAVAILABLE`, after the real factory has constructed normally.

## Contract pinned by the three journeys

1. A backup covers all seven registered application stores; its transport
   journal is excluded. Serialization is canonical and deterministic, and its
   lowercase SHA-256 digest covers the exact returned bytes. Export/inspect are
   read-only and never touch notification scheduling.
2. Export participates in the same coordination gate as every store writer.
   The test pauses an actual `composition.service.createTask` write from inside
   the shared backend `setItem`, then starts export. Export must wait and return
   bytes exactly equal to the after-write export and different from the
   before-write export; accepting the before-write snapshot is forbidden.
3. Malformed, truncated, unsupported-future-schema, and corrupted-reference
   vectors are rejected before durable bytes, public state/history, or the
   notification scheduler changes. A valid backup is likewise rejected on a
   target made nonempty through the real public task service.
4. Restore is allowed only into an empty install. Repeating an already committed
   digest is idempotent. A durable monotonic journal makes every set boundary
   restart-recoverable and is not exported.
5. Generic key/value-blind failures are injected on future set ordinals 1, 2,
   and 4. The fake models an ambiguous storage failure: the write may be durable
   even though `setItem` rejects, so recovery must inspect persisted state.
6. On a byte restart, the real `AppRoot` starts cold recovery before exposing
   either first-activation onboarding or the normal workspace. The test pauses
   the first recovery set, proves that neither route is visible, releases it,
   and then requires the workspace plus exact restored public state/history.
7. Notification reconciliation uses the existing
   `TomorrowFirstNotifications.get/replace` seam. Repeated restore/recovery
   leaves canonical backup bytes unchanged. At most one initial replacement is
   allowed; repeated recovery, same-digest restore, and another byte restart
   must not increment `replace` calls and must preserve the exact logical-ID
   sequence.

## Public backup wire format

The returned bytes are UTF-8 canonical JSON: object keys are lexicographically
sorted, arrays retain declared order, and no insignificant whitespace is
present. The complete public v1 object is:

```text
{
  schemaVersion: 1,
  manifest: {
    stores: [{alias, payloadId, encoding: "base64", recordCount}],
    references: [{sourceStore, sourceId, relation, targetStore, targetId}]
  },
  payloads: {[payloadId]: base64OpaqueStoreBytes},
  contentDigestSha256: lowercaseSha256(canonicalJson({schemaVersion, manifest, payloads}))
}
```

`manifest.stores` contains exactly seven unique aliases. Every `payloadId`
exists exactly once in `payloads`; every declared reference resolves to a
record represented by the declared target store. The fixture's public task
plus first step therefore publishes at least one reference targeting `tasks`.
The artifact's separately returned `digestSha256` remains SHA-256 of the full
wire bytes, including `contentDigestSha256`.

The future-schema vector changes only `schemaVersion` to `2` and recomputes
`contentDigestSha256`, so integrity and JSON parsing pass before version
rejection. The reference-invalid vector changes only one declared task
`targetId` to a missing ID and recomputes the digest; store payload strings are
byte-for-byte untouched, so parsing, integrity, and schema checks pass and only
cross-store validation can reject it. Corrupt and truncated vectors remain
opaque byte mutations.

The generic set failure is ambiguous: `setItem` durably persists and then
rejects. Consequently ordinal 1 proves that the first restore write is a full
`prepared` journal sufficient for cold recovery. Recovery is invoked only by a
fresh real `AppRoot`; a bounded public-route `waitFor` must reach the workspace
without ever observing onboarding.
