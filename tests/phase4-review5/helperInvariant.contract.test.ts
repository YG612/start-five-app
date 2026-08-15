import {
  ARRAY_OVER_GET_BUDGET,
  ARRAY_WITHIN_GET_BUDGET,
  auditedProxy,
  CONTAINER_NODE_GET_BUDGET,
  makeExactContainerTree,
  makeLinearChain,
  makeSharedDag,
  makeWideArray,
  MAX_ARRAY_LENGTH,
  MAX_CONTAINER_NODES,
  MAX_NESTING_DEPTH,
  OrdinaryGetBudgetAudit,
  READ_BUDGET_EXCEEDED,
  SHARED_DAG_DEPTH,
  SHARED_DAG_GET_BUDGET,
  SHARED_DAG_LEAF_MULTIPLICITY,
  SHARED_DAG_UNIQUE_NODES,
} from './phase4Review5Fixtures';

describe('P4-HARDENING-5 deterministic fixture invariants', () => {
  it('proves unique identity counts, acyclic sharing multiplier, and the synchronous ordinary-get fuse', () => {
    const dag = makeSharedDag();
    expect(dag.uniqueNodeCount).toBe(SHARED_DAG_UNIQUE_NODES);
    expect(new Set(dag.nodes).size).toBe(SHARED_DAG_UNIQUE_NODES);
    expect(dag.leafMultiplicity).toBe(SHARED_DAG_LEAF_MULTIPLICITY);
    expect(dag.leafMultiplicity).toBe(2 ** SHARED_DAG_DEPTH);
    expect(dag.audit.limit).toBe(SHARED_DAG_GET_BUDGET);

    const pathIdentities = new Set<object>();
    let cursor = dag.root;
    for (let level = SHARED_DAG_DEPTH; level >= 1; level -= 1) {
      expect(pathIdentities.has(cursor)).toBe(false);
      pathIdentities.add(cursor);
      const left = Object.getOwnPropertyDescriptor(cursor, 'left');
      const right = Object.getOwnPropertyDescriptor(cursor, 'right');
      expect(left).toBeDefined();
      expect(right).toBeDefined();
      expect(left && 'value' in left ? left.value : undefined).toBe(
        right && 'value' in right ? right.value : undefined,
      );
      cursor = (left && 'value' in left ? left.value : undefined) as object;
    }
    expect(pathIdentities.has(cursor)).toBe(false);
    pathIdentities.add(cursor);
    expect(pathIdentities.size).toBe(SHARED_DAG_UNIQUE_NODES);
    expect(Object.getOwnPropertyDescriptor(cursor, 'terminal')).toMatchObject({
      value: 'shared-leaf',
    });
    expect(dag.audit.attempts).toBe(0);

    const rootLeft = Object.getOwnPropertyDescriptor(dag.root, 'left');
    expect(Reflect.get(dag.root, 'left')).toBe(
      rootLeft && 'value' in rootLeft ? rootLeft.value : undefined,
    );
    expect(dag.audit.attempts).toBe(1);
    expect(dag.audit.successfulGets).toBe(1);

    const fuseAudit = new OrdinaryGetBudgetAudit(2);
    const fuseProxy = auditedProxy({value: 7}, 'fuse-proof', fuseAudit);
    expect(Reflect.get(fuseProxy, 'value')).toBe(7);
    expect(Reflect.get(fuseProxy, 'value')).toBe(7);
    expect(() => Reflect.get(fuseProxy, 'value')).toThrow(
      READ_BUDGET_EXCEEDED,
    );
    expect(fuseAudit.attempts).toBe(3);
    expect(fuseAudit.successfulGets).toBe(2);
    expect(fuseAudit.exceeded).toBe(true);

    const withinDepth = makeLinearChain(MAX_NESTING_DEPTH);
    const withinWidth = makeWideArray(
      MAX_ARRAY_LENGTH,
      ARRAY_WITHIN_GET_BUDGET,
    );
    const overWidth = makeWideArray(
      MAX_ARRAY_LENGTH + 1,
      ARRAY_OVER_GET_BUDGET,
    );
    const withinTree = makeExactContainerTree(
      MAX_CONTAINER_NODES,
      CONTAINER_NODE_GET_BUDGET,
    );
    const overTree = makeExactContainerTree(
      MAX_CONTAINER_NODES + 1,
      CONTAINER_NODE_GET_BUDGET,
    );
    expect(new Set(withinDepth.nodes).size).toBe(MAX_NESTING_DEPTH);
    expect(withinWidth.target).toHaveLength(MAX_ARRAY_LENGTH);
    expect(overWidth.target).toHaveLength(MAX_ARRAY_LENGTH + 1);
    expect(new Set(withinTree.nodes).size).toBe(MAX_CONTAINER_NODES);
    expect(new Set(overTree.nodes).size).toBe(MAX_CONTAINER_NODES + 1);
    expect(withinDepth.audit.attempts).toBe(0);
    expect(withinWidth.audit.attempts).toBe(0);
    expect(overWidth.audit.attempts).toBe(0);
    expect(withinTree.audit.attempts).toBe(0);
    expect(overTree.audit.attempts).toBe(0);
  });
});
