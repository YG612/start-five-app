import {getQuadrant, QUADRANT_POSITION} from '../../../src/domain/quadrant';

describe('SF-003 binary Eisenhower quadrant truth table', () => {
  it.each([
    {important: true, urgent: true, quadrant: 'Q1'},
    {important: true, urgent: false, quadrant: 'Q2'},
    {important: false, urgent: true, quadrant: 'Q3'},
    {important: false, urgent: false, quadrant: 'Q4'},
  ] as const)(
    'maps important=$important urgent=$urgent to $quadrant',
    ({important, urgent, quadrant}) => {
      expect(getQuadrant(important, urgent)).toBe(quadrant);
    },
  );

  it('locks the four quadrants to stable grid positions and display order', () => {
    expect(QUADRANT_POSITION).toEqual({
      Q1: {row: 0, column: 0, order: 0},
      Q2: {row: 0, column: 1, order: 1},
      Q3: {row: 1, column: 0, order: 2},
      Q4: {row: 1, column: 1, order: 3},
    });
  });

  it.each([
    [1, true],
    [true, 'yes'],
    [null, false],
    [undefined, false],
  ])('rejects non-binary flags %#', (important, urgent) => {
    expect(() => getQuadrant(important as boolean, urgent as boolean)).toThrow(
      expect.objectContaining({code: 'INVALID_QUADRANT_FLAG'}),
    );
  });
});
