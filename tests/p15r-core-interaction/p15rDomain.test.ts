import {shouldDismissBottomSheet} from '../../src/components/AppBottomSheet';
import {
  compactTaskLabelConfig,
  getCompactTaskLabel,
  normalizeTaskTitleForDisplay,
} from '../../src/domain/taskDisplay';
import {isPointInsideMapBounds} from '../../src/domain/taskPriority';

describe('P15R interaction rules', () => {
  it('uses the specified bottom-sheet drag threshold', () => {
    expect(shouldDismissBottomSheet({translationY: 40, velocityY: 0.2, visibleHeight: 600})).toBe(false);
    expect(shouldDismissBottomSheet({translationY: 108, velocityY: 0.2, visibleHeight: 600})).toBe(true);
    expect(shouldDismissBottomSheet({translationY: 20, velocityY: 0.95, visibleHeight: 600})).toBe(true);
  });

  it('keeps compact labels meaningful and leaves the original title unchanged', () => {
    const original = '  完成混凝土课程   报告初稿  ';
    expect(normalizeTaskTitleForDisplay(original)).toBe('完成混凝土课程 报告初稿');
    expect(getCompactTaskLabel(original, 8)).toBe('完成混凝土…初稿');
    expect(getCompactTaskLabel('整理 🧪 实验记录', 8)).toContain('🧪');
    expect(original).toBe('  完成混凝土课程   报告初稿  ');
  });

  it('adapts label density and rejects map releases outside the real bounds', () => {
    expect(compactTaskLabelConfig(2, false)).toMatchObject({numberOfLines: 2, maxWidth: 104});
    expect(compactTaskLabelConfig(5, false)).toMatchObject({numberOfLines: 2, maxWidth: 84});
    expect(compactTaskLabelConfig(8, true)).toMatchObject({numberOfLines: 2, maxWidth: 112});
    const bounds = {left: 10, top: 20, width: 200, height: 300};
    expect(isPointInsideMapBounds(110, 170, bounds)).toBe(true);
    expect(isPointInsideMapBounds(9, 170, bounds)).toBe(false);
    expect(isPointInsideMapBounds(110, 321, bounds)).toBe(false);
  });
});
