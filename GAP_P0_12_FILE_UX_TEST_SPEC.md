# GAP-P0-12 file backup UX

Status: tests-first public UI/bridge contract. The backup engine is already
covered by GAP-P0-12; this slice covers only the user-visible file handoff.

## Proposed public seam

`createStartFiveApp` may receive an optional top-level `backupFileBridge`:

```ts
type BackupFileBridge = Readonly<{
  save(input: Readonly<{
    suggestedName: string;
    mimeType: 'application/json';
    bytes: string;
  }>): Promise<'saved' | 'cancelled'>;
  pick(): Promise<Readonly<{name: string; bytes: string}> | null>;
}>;
```

The string is the exact UTF-8 JSON file content. Platform adapters may perform
native base64 conversion internally, but that representation is not exposed to
the application or these tests.

## Exactly two public journeys

1. From the real workspace, **数据与备份 → 导出备份** exports the exact
   canonical engine artifact through `backupFileBridge.save`, using
   `start-five-backup-YYYY-MM-DD.json` and `application/json`. A native cancel
   is a normal result and leaves the page usable; a subsequent save shows
   **备份已保存**. Both attempts leave durable bytes, public task state, receipt
   history, and scheduling state unchanged.
2. **导入备份** treats picker cancellation as a no-op and turns invalid JSON
   into the readable **无法读取备份文件，请选择有效的备份**, without writes.
   A valid file is inspected first and shows its file name, seven-store count,
   total record count, and reminder count. Neither preview, **取消恢复**, nor
   **返回工作台** restores anything. On an empty install only the explicit
   **确认恢复** may invoke restore; success returns to the workspace with the
   exact public task state from the backup. A nonempty install may still
   inspect, but confirmation must be blocked with **仅支持空安装恢复**.

The tests mount the actual public `AppRoot`, seed/read only through public
composition services, and use a deterministic bridge fake. They do not inspect
storage keys or re-test backup wire internals.
