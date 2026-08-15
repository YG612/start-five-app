export const USER_COPY = {
  activationUnavailable: '暂时没有找到上次的进度。你的本机任务没有被修改。',
  enterAgain: '重新进入',
  dayReview: '今日回顾',
  firstStep: '第一小步',
  growthValue: '成长值',
  lighterToday: '今天轻一点',
  suggestion: '给你的一个建议',
  restoreNeedsPreview: '当前已有任务，请先预览并选择恢复方式。',
  homeUnavailable: '任务暂时没有加载出来，请稍后重试。',
  taskSaveFailed: '任务没有保存成功，内容还在，请重试。',
  taskStartFailed: '这次没有开始成功，任务仍然保留，请重试。',
  taskCompleteFailed: '任务暂时没有完成，原内容仍然保留，请重试。',
  taskDeleteFailed: '任务没有删除，原内容仍然保留，请重试。',
  taskMoveFailed: '任务没有移动，已经回到原来的位置，请重试。',
  taskMoveUndoFailed: '暂时无法撤销移动，请重试。',
  progressSaveFailed: '进度没有保存成功，原来的进度仍然保留，请重试。',
  completionUndoFailed: '暂时无法撤销完成，请重试。',
  reminderFailed: '任务已经保存，但提醒暂时没有设置成功。请重试同步提醒；任务无需重新保存。',
  refreshFailed: '任务暂时没有刷新出来，请重试。',
  rewardReason: '完成了，成长值已经更新。',
} as const;

export function userFacingError(_reason: unknown, fallback: string): string {
  return fallback;
}
