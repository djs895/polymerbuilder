/**
 * 输入：同一个模型的完整原子列表。
 * 输出：以 serial 为编号的无向邻接表。
 * 无副作用；重复编号或缺失邻接原子时抛错。
 */
function buildGraph(atoms) {
  const serialByIndex = new Map();
  const graph = new Map();

  for (const atom of atoms) {
    if (
      atom.index == null || atom.serial == null ||
      serialByIndex.has(atom.index) || graph.has(atom.serial)
    ) {
      throw new Error("原子编号缺失或重复");
    }
    serialByIndex.set(atom.index, atom.serial);
    graph.set(atom.serial, new Set());
  }

  for (const atom of atoms) {
    // 模型中的 bonds 存储 index，需要转换成 serial。
    for (const neighborIndex of atom.bonds ?? []) {
      if (!serialByIndex.has(neighborIndex)) {
        throw new Error(`原子 ${atom.serial} 的邻接原子不存在`);
      }
      const neighborSerial = serialByIndex.get(neighborIndex);
      graph.get(atom.serial).add(neighborSerial);
      graph.get(neighborSerial).add(atom.serial);
    }
  }
  return graph;
}

/**
 * 输入：邻接表、一个已确认位点。
 * 输出：待清除原子的 serial 集合。
 * 无副作用；位点无效或断键后仍连通时抛错。
 */
function findGroup(graph, site) {
  const { bondSerials, retainedSerial } = site ?? {};
  if (
    !Array.isArray(bondSerials) || bondSerials.length !== 2 ||
    !bondSerials.includes(retainedSerial)
  ) {
    throw new Error("请选择一条键，并指定保留端");
  }

  const [a, b] = bondSerials;
  if (a === b || !graph.get(a)?.has(b)) {
    throw new Error("选中的键不存在或无效");
  }

  const leavingSerial = a === retainedSerial ? b : a;
  const visited = new Set([leavingSerial]);
  const stack = [leavingSerial];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const neighbor of graph.get(current)) {
      // 双向跳过选中的键，模拟断键，不修改邻接表。
      const isCutBond =
        (current === a && neighbor === b) ||
        (current === b && neighbor === a);
      if (isCutBond) continue;
      if (neighbor === retainedSerial) {
        throw new Error("断键后仍能到达保留端，无法分离该基团");
      }
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      stack.push(neighbor);
    }
  }
  return visited;
}

/**
 * 输入：model.selectedAtoms({}) 的完整结果和已确认的 { head, tail } 位点。
 * 输出：{ head: serial[], tail: serial[] }。
 * 无副作用；搜索失败或头尾结果冲突时抛错，不返回部分结果。
 */
export function findLeavingGroups(atoms, sites) {
  if (!sites?.head || !sites?.tail) {
    throw new Error("请先完成头尾位点标定");
  }
  const graph = buildGraph(atoms);
  const head = findGroup(graph, sites.head);
  const tail = findGroup(graph, sites.tail);

  if (
    head.has(sites.tail.retainedSerial) ||
    tail.has(sites.head.retainedSerial)
  ) {
    throw new Error("待清除基团包含另一端的保留原子");
  }
  for (const serial of head) {
    if (tail.has(serial)) {
      throw new Error("头尾待清除基团重叠，请重新标定位点");
    }
  }
  return { head: [...head], tail: [...tail] };
}
