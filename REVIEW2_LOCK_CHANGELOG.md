# Review-2 Test Lock Changelog

## 2026-08-04T20:06:35+08:00 — CEO-authorized controlled amendment

- CEO authorization (verbatim): “好的授权，继续做到你能达到的最好情况” and “让项目继续推进，这种不重要的事情不需要我授权，我要的是高质量APP，请不断推进给出高质量内容”.
- Conflict reason: the former review-2 resume assertion expected a timer resumed at `remainingMs: 3_750` to publish `remainingMs: 2_750` only after advancing `1_000 ms`. The locked review-3 contract requires publication on the next visible-second boundary: after `749 ms` there is no publication and at `750 ms` the timer publishes `remainingMs: 3_000`. One bounded refresh schedule cannot satisfy both contracts. Product semantics therefore follow the review-3 boundary-aligned rule.
- Amendment scope: only `REVIEW2_TEST_SPEC.md`, `tests/review2/defaultTimerCadence.regression.test.tsx`, and `REVIEW2_LOCK.sha256` changed. This changelog was created. No production source, configuration, package metadata, dependency, other review-2 test, or original/review-1/review-3 locked artifact changed.
- Previous `REVIEW2_LOCK.sha256` file SHA-256: `e07858fa66e73f5abc191d5b5d1f61a39ea1f417ccb101e7ad88401fe3948b5b`.
- New `REVIEW2_LOCK.sha256` file SHA-256: `3f955e92d533566247b076187f79a7bbf5f3ad8359e2eb780a64e4e66aa8fd1b`.
- `REVIEW2_TEST_SPEC.md` SHA-256 changed from `4347a9e758943622bea8474a00f17320685264af6907ace7339db953122fab66` to `45088d2bd5ff9c8d22e7b0c04a3250be73e3fe6f3ebf55192c0066870cf83fd9`.
- `tests/review2/defaultTimerCadence.regression.test.tsx` SHA-256 changed from `15b767e905f10eab121b01a4419dff0f8b132f4cceafb72b3e9846fa1d9956ba` to `de1b3424a1cede9d699463fb0c0130ed10ee39679c444a19c483c6d5daf42f6a`.
- Exact old test semantics: after resume at `remainingMs: 3_750`, advance `1_000 ms` and require the last snapshot to be `{state: 'running', durationMs: 5_000, remainingMs: 2_750}`.
- Exact new test semantics: record `callsAtResume`; after `749 ms`, require the listener call count to remain unchanged; after the following `1 ms`, require exactly one additional call whose last snapshot is `{state: 'running', durationMs: 5_000, remainingMs: 3_000}`.
- Exact specification clarification: resume still publishes the calibrated `3_750 ms` snapshot immediately, then schedules the next publication at the next visible-second boundary instead of waiting a fixed one-second interval.
- Unchanged `tests/review2/startLifecycle.regression.test.tsx` SHA-256: `619c1becf3bb17b0311fe7052cbc742201c8207cb37168fa360e757d890d5612`.
- Manifest coverage remains `REVIEW2_TEST_SPEC.md` plus every file under `tests/review2`, sorted by POSIX-style relative path. This changelog and the manifest itself are excluded, following the original `TEST_LOCK_CHANGELOG.md` convention.
- Canonical changelog SHA-256: `6c371f3c95d4f5baf49c9bd0a586a3650621cfd9b60cd80052f7490fc6d2dee0`. To verify, replace only these 64 hexadecimal characters with 64 ASCII zeroes and hash the complete UTF-8 file bytes.
