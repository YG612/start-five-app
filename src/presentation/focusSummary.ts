export function formatFocusSummary(count: number, minutes: number): string {
  const safeCount = Math.max(0, Math.floor(count));
  const safeMinutes = Math.max(0, Math.floor(minutes));
  const minuteText = safeCount > 0 && safeMinutes === 0
    ? '不足1分钟'
    : `${safeMinutes}分钟`;
  return `${safeCount}次 / ${minuteText}`;
}
