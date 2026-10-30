/**
 * 头尾离去基团分析与删除工具。
 *
 * 本文件只处理数据，不依赖 Vue 或 3Dmol，也不会修改 viewer 的显示。
 * 调用者取得返回结果后，可自行决定是否将新结构应用到模型。
 *
 * 输入格式：
 * atoms：[{ serial: 1, x: 0, y: 0, z: 0, ... }, ...]
 *   serial 必须唯一且非空；其余坐标、元素等属性原样保留。
 * bonds：[{ serials: [1, 2], order: 1 }, ...]
 *   serials 是两个原子的编号，不是原子数组下标。
 *   order 等属性不参与遍历，但会保留在返回的键数据中。
 * sites：{
 *   head: { bondSerials: [2, 3], retainedSerial: 3 },
 *   tail: { bondSerials: [4, 5], retainedSerial: 4 },
 * }
 *   retainedSerial 是用户点击的保留端；同一条键的另一端是删除起点。
 *
 * 注意：不能直接将 3Dmol 原子对象的 bonds 索引数组作为本工具的 bonds。
 * 需要先将模型内索引转换为 serial，并组织成上述独立键列表。
 * atoms 应为原子属性数据，连接关系统一由独立的 bonds 列表维护；
 * 本工具不会重写 atoms 内额外保存的 bonds、bondOrder 或 index 字段。
 */

// 将数字编号 1 与字符串编号 "1" 视为同一个原子。
// 只在内部比较时转换；对外返回的编号保留输入中的原始类型。
const keyOf = serial => String(serial);

/**
 * 从 start 出发，收集当前图中所有可到达的原子编号。
 * graph 是 Map<编号, Set<相邻编号>>；调用前已验证起点和连接关系。
 *
 * DFS（深度优先）：使用栈，后进入的节点先处理，沿分支深入。
 * BFS（广度优先）：使用队列，先进入的节点先处理，逐层向外扩展。
 * 两者的访问顺序不同，但对同一连通部分应得到相同的原子集合。
 */
function traverse(graph, start, method) {
  const visited = new Set([start]);
  const pending = [start];
  let cursor = 0;

  // DFS 使用迭代栈而非递归，避免长分子链导致调用栈溢出。
  // BFS 使用游标而非 shift()，避免每次取出节点时搬移整个数组。
  while (method === "dfs" ? pending.length > 0 : cursor < pending.length) {
    const current = method === "dfs"
      ? pending.pop()
      : pending[cursor++];

    for (const neighbor of graph.get(current)) {
      if (visited.has(neighbor)) continue;

      // 加入待处理列表时立即标记，避免环或多条路径导致重复入队。
      visited.add(neighbor);
      pending.push(neighbor);
    }
  }

  return visited;
}

/**
 * 分析两端需要删除的基团，不修改任何输入数据。
 *
 * 处理顺序：建图 → 验证标定 → 虚拟断开两条键 → 遍历 → 检查保留端。
 * 返回头部、尾部及合并去重后的删除编号列表。
 * 验证失败会抛出 Error，由未来接入本模块的调用者捕获并提示用户。
 *
 * @param {Array<{serial: number|string}>} atoms 原子属性数组
 * @param {Array<{serials: Array<number|string>}>} bonds 独立键列表
 * @param {Object} sites 已标定的 head 和 tail
 * @param {"dfs"|"bfs"} method 遍历方法，默认深度优先
 * @returns {{headAtomSerials: Array, tailAtomSerials: Array, deleteAtomSerials: Array}}
 */
export function findLeavingGroups(atoms, bonds, sites, method = "dfs") {
  if (method !== "dfs" && method !== "bfs") {
    throw new Error("遍历方法必须是 dfs 或 bfs。");
  }

  // 邻接表独立于输入数据：稍后断边只影响这张临时图。
  const graph = new Map();

  for (const atom of atoms) {
    if (atom.serial == null || keyOf(atom.serial).trim() === "") {
      throw new Error("原子缺少 serial 编号。");
    }

    const key = keyOf(atom.serial);
    if (graph.has(key)) {
      throw new Error(`原子编号重复：${atom.serial}`);
    }

    graph.set(key, new Set());
  }

  for (const bond of bonds) {
    if (!Array.isArray(bond.serials) || bond.serials.length !== 2) {
      throw new Error("每条键必须包含两个端点编号。");
    }

    const [a, b] = bond.serials.map(keyOf);
    if (a === b || !graph.has(a) || !graph.has(b)) {
      throw new Error("键包含无效的原子编号。");
    }

    // 化学键按无向边处理，A 能到 B，B 也能到 A。
    // Set 可自动合并重复连接；单键、双键等在连通性分析中等价。
    graph.get(a).add(b);
    graph.get(b).add(a);
  }

  // 两条键都验证成功后才断开，确保检查基于完整的原始连接关系。
  const cuts = ["head", "tail"].map(role => {
    const site = sites?.[role];
    const label = role === "head" ? "头部" : "尾部";

    if (
      !Array.isArray(site?.bondSerials) ||
      site.bondSerials.length !== 2 ||
      site.retainedSerial == null
    ) {
      throw new Error(`请先完成${label}标定。`);
    }

    const [a, b] = site.bondSerials.map(keyOf);
    const retained = keyOf(site.retainedSerial);

    if (a === b || !graph.get(a)?.has(b)) {
      throw new Error(`${label}选择的键不存在。`);
    }

    if (retained !== a && retained !== b) {
      throw new Error(`${label}保留端必须是所选键的端点。`);
    }

    return {
      label,
      a,
      b,
      retained,
      leaving: retained === a ? b : a,
    };
  });

  // [A, B] 和 [B, A] 表示同一条键，不能分别作为头部和尾部。
  const [head, tail] = cuts;
  if (
    (head.a === tail.a && head.b === tail.b) ||
    (head.a === tail.b && head.b === tail.a)
  ) {
    throw new Error("头部和尾部不能选择同一条键。");
  }

  // 同时虚拟断开两条标定键，再分别寻找两端的离去基团。
  // 此时没有真正删除原子，也没有修改传入的 bonds。
  for (const { a, b } of cuts) {
    graph.get(a).delete(b);
    graph.get(b).delete(a);
  }

  const retainedKeys = cuts.map(cut => cut.retained);

  const groups = cuts.map(cut => {
    const group = traverse(graph, cut.leaving, method);

    // 必须同时保护头、尾两个保留端，而不只是当前端。
    // 如果断键后仍能绕路到保留端，直接删除将误删主体，必须中止。
    if (retainedKeys.some(key => group.has(key))) {
      throw new Error(
        `${cut.label}待删除基团仍与保留端连通，可能存在环或保留方向错误，请重新标定。`,
      );
    }

    return group;
  });

  // 使用原始原子顺序输出，消除 DFS、BFS 遍历顺序不同的影响。
  const serialsOf = keys => atoms
    .filter(atom => keys.has(keyOf(atom.serial)))
    .map(atom => atom.serial);

  return {
    headAtomSerials: serialsOf(groups[0]),
    tailAtomSerials: serialsOf(groups[1]),
    // 两端候选基团可能重叠，合并去重后每个原子只删除一次。
    deleteAtomSerials: serialsOf(new Set([...groups[0], ...groups[1]])),
  };
}

/**
 * 使用 DFS 和 BFS 分别分析，结果一致后生成删除基团的新结构。
 *
 * 返回对象包含 atoms、bonds 以及三个删除编号列表。
 * 任何一步失败都会抛出错误，原始结构保持不变。
 *
 * filter() 生成新数组，但保留下来的原子、键对象与输入共享引用；
 * 本函数不修改它们，也不重新编号、不移动坐标、不补氢或调整键级。
 * 若调用方要继续修改返回对象的属性，应自行复制相应对象。
 * 与两个删除起点均不连通的其他分子或片段会原样保留。
 *
 * 对原子数 V、键数 E，分析与过滤的时间复杂度为 O(V + E)。
 */
export function removeLeavingGroups(atoms, bonds, sites) {
  const dfs = findLeavingGroups(atoms, bonds, sites, "dfs");
  const bfs = findLeavingGroups(atoms, bonds, sites, "bfs");

  // 两种算法已按原始原子顺序输出，可以直接比较编号列表。
  // 分别比较头、尾和总集合，防止只比较总集合漏掉两端归属差异。
  for (const field of [
    "headAtomSerials",
    "tailAtomSerials",
    "deleteAtomSerials",
  ]) {
    if (JSON.stringify(dfs[field]) !== JSON.stringify(bfs[field])) {
      throw new Error("DFS 与 BFS 结果不一致，未执行删除。");
    }
  }

  const deleted = new Set(dfs.deleteAtomSerials.map(keyOf));

  return {
    atoms: atoms.filter(atom => !deleted.has(keyOf(atom.serial))),
    // 任一端点被删除，其关联键也必须删除，不能留下悬空引用。
    bonds: bonds.filter(bond =>
      bond.serials.every(serial => !deleted.has(keyOf(serial)))
    ),
    ...dfs,
  };
}
