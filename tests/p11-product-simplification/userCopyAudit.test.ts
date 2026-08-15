import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const REACHABLE_UI = [
  'src/screens/CoreFlowScreen.tsx',
  'src/screens/DayClosureScreen.tsx',
  'src/screens/FirstActivationScreen.tsx',
  'src/screens/FocusHistoryScreen.tsx',
  'src/screens/LocalBackupScreen.tsx',
  'src/screens/PostFocusReviewScreen.tsx',
  'src/screens/QuadrantHomeScreen.tsx',
  'src/screens/TaskWorkspaceScreen.tsx',
] as const;

const FORBIDDEN_USER_TERMS = [
  '行动指针',
  '成长洞察',
  '成长物',
  '低状态模式',
  '本次积分',
  '积分原因',
  '总积分',
  '专注复盘',
  '第一动作',
  '今日总结',
  '今日收尾',
  '结束今天',
  '手动紧急度',
  '数据区',
  '主导航',
  '工作台',
  '回执',
  '状态机',
  '启动状态读取失败',
  '重试首次启动检查',
  '仅支持空安装恢复',
  '最低可交付版本',
] as const;

describe('P11-02 reachable user copy', () => {
  it.each(REACHABLE_UI)('%s contains no forbidden product terminology', file => {
    const source = readFileSync(resolve(__dirname, '..', '..', file), 'utf8');
    for (const term of FORBIDDEN_USER_TERMS) {
      expect(source).not.toContain(term);
    }
  });
});
