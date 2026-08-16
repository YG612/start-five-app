export type CompactTaskLabelConfig = Readonly<{
  maxEquivalentChars: number;
  maxWidth: number;
  numberOfLines: 1 | 2;
}>;

export function normalizeTaskTitleForDisplay(title: string): string {
  return title.replace(/\s+/gu, ' ').trim();
}

function graphemes(value: string): readonly string[] {
  const output: string[] = [];
  for (const character of Array.from(value)) {
    if (
      output.length > 0 &&
      (/\p{Mark}/u.test(character) || character === '\uFE0F' || output[output.length - 1]?.endsWith('\u200D'))
    ) {
      output[output.length - 1] += character;
    } else if (character === '\u200D' && output.length > 0) {
      output[output.length - 1] += character;
    } else {
      output.push(character);
    }
  }
  return output;
}

export function getCompactTaskLabel(
  title: string,
  maxEquivalentChars: number,
): string {
  const normalized = normalizeTaskTitleForDisplay(title);
  const parts = graphemes(normalized);
  const limit = Math.max(4, Math.floor(maxEquivalentChars));
  if (parts.length <= limit) return normalized;
  const front = Math.max(2, Math.ceil((limit - 1) * 0.6));
  const tail = Math.max(1, limit - front - 1);
  return `${parts.slice(0, front).join('')}…${parts.slice(-tail).join('')}`;
}

export function compactTaskLabelConfig(
  quadrantTaskCount: number,
  highlighted: boolean,
): CompactTaskLabelConfig {
  if (highlighted) {
    return {maxEquivalentChars: 14, maxWidth: 112, numberOfLines: 2};
  }
  if (quadrantTaskCount <= 3) {
    return {maxEquivalentChars: 12, maxWidth: 104, numberOfLines: 2};
  }
  return {maxEquivalentChars: 8, maxWidth: 84, numberOfLines: 1};
}

