# GAP-P0-10R1 candidate lock changelog (excluded from lock)

## Authority

- Status: `PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY`.
- Prior candidate self
  `8a02ca7c546f55a11f714d01328cd6d918854fcbd7484ec09288f20677794152`:
  `REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED`.
- Its failure was that Tests 1 and 2 did not prove durable disabled/denied
  convergence across a second byte restart.
- The two-entry candidate freezes only the test specification and focused
  recovery contract. This changelog is excluded from the manifest.

## Controlled fixture correction

- React 19 / RNTL asynchronous calls received only the required `await`
  handling. The three behavioral cases and their semantic oracles were not
  changed.
- Tests 1 and 2 now use only the public scheduling repository and freshly
  constructed services over byte-restarted backends. They require durable
  disabled/denied snapshots and prove another reconciliation cannot recreate
  a logical platform reminder. No persistence key or envelope is inspected.
- Test 3 remained unchanged during this review correction.
- No production file or prior test asset was modified.

## Focused evidence

- TypeScript `--noEmit`: exit `0`, no diagnostics.
- Exactly one isolated Jest run targeted
  `tests/gap-p0-10r1/tomorrowFirstReminderRecovery.contract.test.tsx` under
  the matching root: `3 failed / 3 total`.
- All three failures are legitimate product capability reds: orphan reminder
  cleanup is missing, reconciliation does not react to denied permission
  drift, and operational enable failures have no distinct retry UI.
- No prior suite, broad regression, quality gate, or native build ran.

One fresh independent reviewer must accept the exact two-entry candidate
before production work is authorized.
