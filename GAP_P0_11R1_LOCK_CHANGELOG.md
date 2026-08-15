# GAP-P0-11R1 candidate lock changelog (excluded from lock)

The prior self `acd0369a98d724fb944f22f22e6a948b9007731ae5c9e2d9f830e010a184ae60` is **REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED** because its test imported a missing production type.

1. Added exactly two public AppRoot tests in one file: storage-layer durable-presence delegation and same-mount bootstrap retry. Neither test reads or writes a persistence key/envelope or encodes a private atomic record.
2. Single isolated Jest run: 2 tests executed, 2 expected reds. Test 1 observed the public probe was never called; Test 2 observed the retry action was absent from the visible read-error UI.
3. The controlled correction replaces only that missing import with a structurally equivalent local interface while still requiring production to export the contract. Corrected single-run evidence is recorded below.
4. Static production pin: the default data/storage implementation must recognize main mirror plus authoritative atomic authority, recoverable journal, and held/published lock state. Independent code review, not a test fixture that fabricates private records, must verify that mapping.
5. Corrected controlled evidence: TypeScript completed with 0 errors; isolated Jest executed exactly 2 tests and retained exactly the two intended reds (probe not delegated, retry action absent). No scenario or oracle changed.
