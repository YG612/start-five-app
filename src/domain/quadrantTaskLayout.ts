import type {Quadrant} from './quadrant';

export const TASK_LAYOUT_LONG_PRESS_MS = 1_000;
export const TASK_LAYOUT_PRE_ARM_SLOP_DP = 10;
export const TASK_LAYOUT_DRAG_START_SLOP_DP = 6;
export const QUADRANT_LAYOUT_GRID_DIVISIONS = 12;

export type QuadrantPlacement = Readonly<{
  xRatio: number;
  yRatio: number;
}>;

export type QuadrantTaskLayoutRecord = Readonly<{
  taskId: string;
  placement: QuadrantPlacement;
}>;

export type PlacementCandidate = Readonly<{
  id: string;
  desired: QuadrantPlacement;
  size: LayoutSize;
}>;

export type LayoutRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type LayoutSize = Readonly<{width: number; height: number}>;

export type TaskLayoutMode =
  | Readonly<{status: 'idle'}>
  | Readonly<{
      status: 'armed';
      taskId: string;
      originQuadrant: Quadrant;
      originPlacement: QuadrantPlacement;
    }>
  | Readonly<{
      status: 'dragging';
      taskId: string;
      originQuadrant: Quadrant;
      originPlacement: QuadrantPlacement;
      pointerOffsetX: number;
      pointerOffsetY: number;
      candidateQuadrant: Quadrant | null;
    }>
  | Readonly<{status: 'committing'; taskId: string}>;

export type TaskLayoutAction =
  | Readonly<{
      type: 'arm';
      taskId: string;
      originQuadrant: Quadrant;
      originPlacement: QuadrantPlacement;
    }>
  | Readonly<{
      type: 'start_drag';
      pointerOffsetX: number;
      pointerOffsetY: number;
      candidateQuadrant: Quadrant | null;
    }>
  | Readonly<{type: 'move'; candidateQuadrant: Quadrant | null}>
  | Readonly<{type: 'commit'}>
  | Readonly<{
      type: 'settle';
      quadrant: Quadrant;
      placement: QuadrantPlacement;
    }>
  | Readonly<{type: 'cancel_drag'}>
  | Readonly<{type: 'exit'}>;

export const IDLE_TASK_LAYOUT_MODE: TaskLayoutMode = {status: 'idle'};

export function taskLayoutReducer(
  state: TaskLayoutMode,
  action: TaskLayoutAction,
): TaskLayoutMode {
  switch (action.type) {
    case 'arm':
      return {
        status: 'armed',
        taskId: action.taskId,
        originQuadrant: action.originQuadrant,
        originPlacement: clampPlacement(action.originPlacement),
      };
    case 'start_drag':
      return state.status !== 'armed'
        ? state
        : {
            status: 'dragging',
            taskId: state.taskId,
            originQuadrant: state.originQuadrant,
            originPlacement: state.originPlacement,
            pointerOffsetX: action.pointerOffsetX,
            pointerOffsetY: action.pointerOffsetY,
            candidateQuadrant: action.candidateQuadrant,
          };
    case 'move':
      return state.status !== 'dragging' || state.candidateQuadrant === action.candidateQuadrant
        ? state
        : {...state, candidateQuadrant: action.candidateQuadrant};
    case 'commit':
      return state.status !== 'dragging'
        ? state
        : {status: 'committing', taskId: state.taskId};
    case 'settle':
      return state.status !== 'committing'
        ? state
        : {
            status: 'armed',
            taskId: state.taskId,
            originQuadrant: action.quadrant,
            originPlacement: clampPlacement(action.placement),
          };
    case 'cancel_drag':
      return state.status !== 'dragging'
        ? state
        : {
            status: 'armed',
            taskId: state.taskId,
            originQuadrant: state.originQuadrant,
            originPlacement: state.originPlacement,
          };
    case 'exit':
      return IDLE_TASK_LAYOUT_MODE;
  }
}

export function clampRatio(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

export function clampPlacement(placement: QuadrantPlacement): QuadrantPlacement {
  return {
    xRatio: clampRatio(placement.xRatio),
    yRatio: clampRatio(placement.yRatio),
  };
}

export function isQuadrantPlacement(value: unknown): value is QuadrantPlacement {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.xRatio === 'number' && Number.isFinite(candidate.xRatio) &&
    candidate.xRatio >= 0 && candidate.xRatio <= 1 &&
    typeof candidate.yRatio === 'number' && Number.isFinite(candidate.yRatio) &&
    candidate.yRatio >= 0 && candidate.yRatio <= 1;
}

export function normalizePointInRect(
  point: Readonly<{x: number; y: number}>,
  rect: LayoutRect,
): QuadrantPlacement {
  if (rect.width <= 0 || rect.height <= 0) return {xRatio: 0.5, yRatio: 0.5};
  return clampPlacement({
    xRatio: (point.x - rect.x) / rect.width,
    yRatio: (point.y - rect.y) / rect.height,
  });
}

export function pointForPlacement(
  placement: QuadrantPlacement,
  rect: LayoutRect,
): Readonly<{x: number; y: number}> {
  const safe = clampPlacement(placement);
  return {
    x: rect.x + rect.width * safe.xRatio,
    y: rect.y + rect.height * safe.yRatio,
  };
}

export function constrainTaskCenter(
  center: Readonly<{x: number; y: number}>,
  contentRect: LayoutRect,
  taskSize: LayoutSize,
): Readonly<{x: number; y: number}> {
  const halfWidth = Math.min(contentRect.width / 2, Math.max(0, taskSize.width / 2));
  const halfHeight = Math.min(contentRect.height / 2, Math.max(0, taskSize.height / 2));
  return {
    x: Math.min(contentRect.x + contentRect.width - halfWidth, Math.max(contentRect.x + halfWidth, center.x)),
    y: Math.min(contentRect.y + contentRect.height - halfHeight, Math.max(contentRect.y + halfHeight, center.y)),
  };
}

export function quadrantAtTaskCenter(
  center: Readonly<{x: number; y: number}>,
  quadrantRects: Readonly<Partial<Record<Quadrant, LayoutRect>>>,
): Quadrant | null {
  const order: readonly Quadrant[] = ['Q1', 'Q2', 'Q3', 'Q4'];
  return order.find(quadrant => {
    const rect = quadrantRects[quadrant];
    return rect !== undefined && rect.width > 0 && rect.height > 0 &&
      center.x >= rect.x && center.x <= rect.x + rect.width &&
      center.y >= rect.y && center.y <= rect.y + rect.height;
  }) ?? null;
}

export function snapPlacementToGrid(
  placement: QuadrantPlacement,
  divisions = QUADRANT_LAYOUT_GRID_DIVISIONS,
): QuadrantPlacement {
  const safeDivisions = Math.max(1, Math.floor(divisions));
  const safe = clampPlacement(placement);
  return {
    xRatio: Math.round(safe.xRatio * safeDivisions) / safeDivisions,
    yRatio: Math.round(safe.yRatio * safeDivisions) / safeDivisions,
  };
}

function overlaps(
  leftCenter: Readonly<{x: number; y: number}>,
  leftSize: LayoutSize,
  rightCenter: Readonly<{x: number; y: number}>,
  rightSize: LayoutSize,
): boolean {
  return Math.abs(leftCenter.x - rightCenter.x) < (leftSize.width + rightSize.width) / 2 &&
    Math.abs(leftCenter.y - rightCenter.y) < (leftSize.height + rightSize.height) / 2;
}

export function nearestAvailablePlacement(input: Readonly<{
  desired: QuadrantPlacement;
  contentRect: LayoutRect;
  taskSize: LayoutSize;
  occupied: readonly Readonly<{placement: QuadrantPlacement; size: LayoutSize}>[];
  divisions?: number;
}>): QuadrantPlacement {
  const divisions = Math.max(1, Math.floor(input.divisions ?? QUADRANT_LAYOUT_GRID_DIVISIONS));
  const desired = snapPlacementToGrid(input.desired, divisions);
  const candidates: QuadrantPlacement[] = [];
  for (let y = 0; y <= divisions; y += 1) {
    for (let x = 0; x <= divisions; x += 1) {
      candidates.push({xRatio: x / divisions, yRatio: y / divisions});
    }
  }
  candidates.sort((left, right) => {
    const leftDistance = (left.xRatio - desired.xRatio) ** 2 + (left.yRatio - desired.yRatio) ** 2;
    const rightDistance = (right.xRatio - desired.xRatio) ** 2 + (right.yRatio - desired.yRatio) ** 2;
    return leftDistance - rightDistance || left.yRatio - right.yRatio || left.xRatio - right.xRatio;
  });
  for (const candidate of candidates) {
    const center = constrainTaskCenter(
      pointForPlacement(candidate, input.contentRect),
      input.contentRect,
      input.taskSize,
    );
    const blocked = input.occupied.some(item => overlaps(
      center,
      input.taskSize,
      constrainTaskCenter(
        pointForPlacement(item.placement, input.contentRect),
        input.contentRect,
        item.size,
      ),
      item.size,
    ));
    if (!blocked) return normalizePointInRect(center, input.contentRect);
  }
  return normalizePointInRect(
    constrainTaskCenter(
      pointForPlacement(desired, input.contentRect),
      input.contentRect,
      input.taskSize,
    ),
    input.contentRect,
  );
}

export function nearestPackingPlacement(input: Readonly<{
  desired: QuadrantPlacement;
  contentRect: LayoutRect;
  taskSize: LayoutSize;
}>): QuadrantPlacement {
  const columns = Math.max(
    1,
    Math.floor(input.contentRect.width / Math.max(1, input.taskSize.width)),
  );
  const rows = Math.max(
    1,
    Math.floor(input.contentRect.height / Math.max(1, input.taskSize.height)),
  );
  const placements: QuadrantPlacement[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = columns === 1
        ? input.contentRect.x + input.contentRect.width / 2
        : input.contentRect.x + input.taskSize.width / 2 +
          column * (input.contentRect.width - input.taskSize.width) / (columns - 1);
      const y = rows === 1
        ? input.contentRect.y + input.contentRect.height / 2
        : input.contentRect.y + input.taskSize.height / 2 +
          row * (input.contentRect.height - input.taskSize.height) / (rows - 1);
      placements.push(normalizePointInRect({x, y}, input.contentRect));
    }
  }
  const desired = clampPlacement(input.desired);
  return placements.sort((left, right) => {
    const leftDistance = (left.xRatio - desired.xRatio) ** 2 +
      (left.yRatio - desired.yRatio) ** 2;
    const rightDistance = (right.xRatio - desired.xRatio) ** 2 +
      (right.yRatio - desired.yRatio) ** 2;
    return leftDistance - rightDistance ||
      left.yRatio - right.yRatio ||
      left.xRatio - right.xRatio;
  })[0] ?? desired;
}

export function assignAvailablePlacements(input: Readonly<{
  candidates: readonly PlacementCandidate[];
  existing: Readonly<Record<string, QuadrantPlacement>>;
  contentRect: LayoutRect;
  reserved?: readonly Readonly<{
    placement: QuadrantPlacement;
    size: LayoutSize;
  }>[];
  divisions?: number;
}>): Readonly<Record<string, QuadrantPlacement>> {
  const sizeById = new Map(input.candidates.map(candidate => [candidate.id, candidate.size]));
  const place = (
    existing: Readonly<Record<string, QuadrantPlacement>>,
  ): Record<string, QuadrantPlacement> => {
    const resolved: Record<string, QuadrantPlacement> = {};
    const occupied: Array<Readonly<{
      placement: QuadrantPlacement;
      size: LayoutSize;
    }>> = (input.reserved ?? []).map(item => ({
      placement: clampPlacement(item.placement),
      size: item.size,
    }));
    for (const candidate of input.candidates) {
      const placement = existing[candidate.id];
      if (placement === undefined) continue;
      const safePlacement = clampPlacement(placement);
      resolved[candidate.id] = safePlacement;
      occupied.push({
        placement: safePlacement,
        size: sizeById.get(candidate.id) ?? candidate.size,
      });
    }
    for (const candidate of input.candidates) {
      if (resolved[candidate.id] !== undefined) continue;
      const placement = nearestAvailablePlacement({
        desired: candidate.desired,
        contentRect: input.contentRect,
        taskSize: candidate.size,
        occupied,
        ...(input.divisions === undefined ? {} : {divisions: input.divisions}),
      });
      resolved[candidate.id] = placement;
      occupied.push({placement, size: candidate.size});
    }
    return resolved;
  };

  const hasOverlap = (resolved: Readonly<Record<string, QuadrantPlacement>>): boolean =>
    input.candidates.some((left, index) => {
      const leftPlacement = resolved[left.id];
      if (leftPlacement === undefined) return false;
      const leftCenter = constrainTaskCenter(
        pointForPlacement(leftPlacement, input.contentRect),
        input.contentRect,
        left.size,
      );
      const overlapsReserved = (input.reserved ?? []).some(item => overlaps(
        leftCenter,
        left.size,
        constrainTaskCenter(
          pointForPlacement(item.placement, input.contentRect),
          input.contentRect,
          item.size,
        ),
        item.size,
      ));
      return overlapsReserved || input.candidates.slice(index + 1).some(right => {
        const rightPlacement = resolved[right.id];
        if (rightPlacement === undefined) return false;
        return overlaps(
          leftCenter,
          left.size,
          constrainTaskCenter(
            pointForPlacement(rightPlacement, input.contentRect),
            input.contentRect,
            right.size,
          ),
          right.size,
        );
      });
    });

  const preservingExisting = place(input.existing);
  // A centered or legacy placement can leave no single-card escape route even
  // when the quadrant can fit the whole set. Reflow only when overlap remains.
  return hasOverlap(preservingExisting) ? place({}) : preservingExisting;
}

export function reflowPackedPlacements(input: Readonly<{
  pinned: PlacementCandidate;
  candidates: readonly PlacementCandidate[];
  contentRect: LayoutRect;
  reserved?: readonly Readonly<{
    placement: QuadrantPlacement;
    size: LayoutSize;
  }>[];
  divisions?: number;
}>): Readonly<Record<string, QuadrantPlacement>> {
  const packedPinnedPlacement = nearestPackingPlacement({
    desired: input.pinned.desired,
    contentRect: input.contentRect,
    taskSize: input.pinned.size,
  });
  const reserved = (input.reserved ?? []).map(item => ({
    placement: clampPlacement(item.placement),
    size: item.size,
  }));
  const pinnedPlacement = nearestAvailablePlacement({
    desired: packedPinnedPlacement,
    contentRect: input.contentRect,
    taskSize: input.pinned.size,
    occupied: reserved,
    ...(input.divisions === undefined ? {} : {divisions: input.divisions}),
  });
  const resolved: Record<string, QuadrantPlacement> = {
    [input.pinned.id]: pinnedPlacement,
  };
  const occupied: Array<Readonly<{
    placement: QuadrantPlacement;
    size: LayoutSize;
  }>> = [...reserved, {placement: pinnedPlacement, size: input.pinned.size}];
  for (const candidate of input.candidates) {
    if (candidate.id === input.pinned.id) continue;
    const desired = nearestPackingPlacement({
      desired: candidate.desired,
      contentRect: input.contentRect,
      taskSize: candidate.size,
    });
    const placement = nearestAvailablePlacement({
      desired,
      contentRect: input.contentRect,
      taskSize: candidate.size,
      occupied,
      ...(input.divisions === undefined ? {} : {divisions: input.divisions}),
    });
    resolved[candidate.id] = placement;
    occupied.push({placement, size: candidate.size});
  }
  return resolved;
}

export function placementsDiffer(
  left: QuadrantPlacement,
  right: QuadrantPlacement,
  tolerance = 0.005,
): boolean {
  return Math.abs(left.xRatio - right.xRatio) > tolerance ||
    Math.abs(left.yRatio - right.yRatio) > tolerance;
}
