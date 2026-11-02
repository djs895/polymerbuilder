import {
  ViewerResources,
  releaseRenderedObjects,
} from "../utils/viewerResources.js";
import { findLeavingGroups } from "../utils/LeavingGroupFinder.js";

/**
 * 输入：两个由原子 serial 组成的端点数组。
 * 输出：是否表示同一条键，忽略端点顺序。
 * 副作用：无，不修改输入。
 */
function sameBond(pair, serials) {
  return pair?.length === 2
    && serials?.length === 2
    && serials.includes(pair[0])
    && serials.includes(pair[1]);
}

export class MoleculeViewerController {
  /**
   * 输入：viewer.vue 明确传入的依赖。
   * 构造阶段只准备状态和回调，不访问尚未挂载的 DOM，也不创建查看器。
   */
  constructor({ containerRef, props, emit, origin, createViewer }) {
    // 外部依赖：在挂载、点击、模型替换时读取，dispose 时清除引用。
    this.containerRef = containerRef;
    this.props = props;
    this.emit = emit;
    this.origin = origin;
    this.createViewer = createViewer;

    // mount 创建资源，dispose 通过资源管理器释放它们。
    this.resources = new ViewerResources();
    this.viewer = null;
    this.model = null;
    this.modelText = null;

    // 显示参数在构造时赋值，绘制和点击时读取，各实例独立保存。
    this.sphereScale = 0.3;
    this.siteSphereScale = this.sphereScale * 1.5;
    this.siteColors = {
      head: 0xFF1493,
      tail: 0x00D6B2,
    };
    this.defaultStyle = {
      stick: {
        radius: 0.25,
        colorscheme: "Jmol",
      },
      sphere: {
        scale: this.sphereScale,
        colorscheme: "Jmol",
      },
    };

    // addBondCylinders 写入 { shape, pair }，刷新及清理时遍历。
    this.bondEntries = [];
    // addBondCylinders 写入 shape -> pair 的对应关系。
    // 事件只需接收 shape，就能在处理方法中找回端点编号。
    this.pairs = new WeakMap();
    // 父组件通过 setSiteSelection 更新，绘制和事件方法读取。
    this.selection = {
      bondSerials: null,
      retainedSerial: null,
    };
    // 普通选择模式的原子 index，由 handleAtomClick 更新。
    this.item = null;
    // 浏览器返回的动画帧编号，null 表示没有待执行任务。
    this.frame = null;
    // dispose 设置为 true，后续事件据此停止操作。
    this.disposed = false;

    /**
     * 每个实例只绑定一次，不在每条键的循环内创建捕获业务变量的回调。
     * atom：3Dmol 将原子作为第一个参数传入。
     * bond/hover/unhover：3Dmol 将圆柱 shape 作为第一个参数传入。
     * refresh：浏览器调用，传入的时间戳在本方法中不使用。
     */
    this.callbacks = {
      atom: this.handleAtomClick.bind(this),
      bond: this.handleBondClick.bind(this),
      hover: this.handleBondHover.bind(this),
      unhover: this.handleBondUnhover.bind(this),
      refresh: this.refreshSite.bind(this),
    };
  }

  /**
   * 调用方：组件的 onMounted。
   * 输入：无，从实例依赖中读取 DOM 和初始 PDB。
   * 副作用：创建查看器、模型、交互对象并首次绘制。
   */
  mount() {
    if (this.disposed || this.viewer) return;

    const container = this.containerRef.value;
    const browser = container.ownerDocument.defaultView;

    try {
      // 同步创建时记录 window/body 上的外部监听，以便卸载时移除。
      this.viewer = this.resources.create(
        this.createViewer,
        container,
        { backgroundColor: "white" },
        [browser, container.ownerDocument.body],
      );

      this.viewer.setHoverDuration(50);
      this.loadModel(this.props.pdbText);
      this.viewer.zoomTo();
      this.refreshSite();
      this.modelText = this.props.pdbText;
    } catch (error) {
      // 初始化中途失败时，也尝试释放已经创建的资源。
      this.dispose();
      throw error;
    }
  }

  /**
   * 输入：PDB 原始文本 text。
   * 副作用：创建模型、设置默认样式、注册原子及化学键交互。
   *
   * 调用前应已创建 viewer，并清理需要替换的旧模型。
   */
  loadModel(text) {
    this.model = this.viewer.addModel(text, "pdb", {
      keepH: true, assignBonds: this.props.inferBonds !== false,
    });
    this.viewer.setStyle({}, this.defaultStyle);
    this.viewer.setClickable({}, true, this.callbacks.atom);
    this.addBondCylinders();
  }

  /**
   * 输入：无，读取当前 model 的成键信息。
   * 副作用：创建透明交互圆柱，写入 bondEntries 和 pairs。
   *
   * atom.bonds 存储模型内 index。
   * 向父组件上报时使用 serial，两种编号不能混用。
   */
  addBondCylinders() {
    const atoms = this.model.selectedAtoms({});
    const byIndex = new Map();
    for (const atom of atoms) {
      byIndex.set(atom.index, atom);
    }

    // 无向键会从两个端点被遍历到，使用统一标识去重。
    const seen = new Set();

    for (const atom of atoms) {
      for (const index of atom.bonds ?? []) {
        const other = byIndex.get(index);
        if (!other || atom.index === index) continue;
        const key = [
          Math.min(atom.index, index),
          Math.max(atom.index, index),
        ].join(":");

        if (seen.has(key)) continue;
        seen.add(key);

        const pair = [atom.serial, other.serial];

        const shape = this.viewer.addCylinder({
          start: { x: atom.x, y: atom.y, z: atom.z },
          end: { x: other.x, y: other.y, z: other.z },
          // 比默认棒状键稍粗，方便鼠标拾取。
          radius: 0.27,
          fromCap: 0,
          toCap: 0,

          // 默认不显示，仅在悬停和选择时改变透明度。
          color: "orange",
          opacity: 0,
          clickable: true,
          hoverable: true,

          // 3Dmol 触发事件时将 shape 传入这些绑定方法。
          callback: this.callbacks.bond,
          hover_callback: this.callbacks.hover,
          unhover_callback: this.callbacks.unhover,
        });
        this.pairs.set(shape, pair);
        this.bondEntries.push({ shape, pair });
      }
    }
  }

  /**
   * 输入：待检查键的两个 serial。
   * 输出："head"、"tail" 或 undefined。
   * 副作用：无，只读取已确认的位点数据。
   */
  confirmedBondRole(pair) {
    const headBond = this.selection.sites?.head?.bondSerials;
    const tailBond = this.selection.sites?.tail?.bondSerials;

    if (sameBond(pair, headBond)) return "head";
    if (sameBond(pair, tailBond)) return "tail";
    return undefined;
  }

  /**
   * 调用方：3Dmol 的圆柱点击事件。
   * 输入：被点击的 shape。
   * 副作用：在标定模式下向父组件发送 bond-click。
   */
  handleBondClick(shape) {
    if (this.disposed || !this.props.siteMode) return;
    const pair = this.pairs.get(shape);
    // 已确认的头尾键不重复上报。
    if (pair && !this.confirmedBondRole(pair)) {
      this.emit("bond-click", pair);
    }
  }

  /**
   * 调用方：3Dmol 的悬停事件。
   * 输入：鼠标进入的 shape。
   * 副作用：尝试显示半透明橙色圆柱。
   */
  handleBondHover(shape) {
    this.setHoverOpacity(shape, 0.45);
  }

  /**
   * 调用方：3Dmol 的离开事件。
   * 输入：鼠标离开的 shape。
   * 副作用：尝试隐藏临时悬停高亮。
   */
  handleBondUnhover(shape) {
    this.setHoverOpacity(shape, 0);
  }

  /**
   * 输入：目标圆柱和透明度；副作用：更新样式并绘制。
   * 已确认位点或已有选中键时，高亮由选择状态管理，悬停不覆盖它。
   */
  setHoverOpacity(shape, opacity) {
    if (this.disposed || !this.viewer) return;
    const pair = this.pairs.get(shape);
    if (
      !pair
      || this.confirmedBondRole(pair)
      || this.selection.bondSerials
    ) {
      return;
    }

    shape.updateStyle({ opacity });
    this.viewer.render();
  }

  /**
   * 输入：原子编号、球体大小及颜色；给当前模型的指定原子增加样式。
   * 清除继承的元素配色，确保指定颜色生效；由调用者统一 render。
   */
  highlightAtom(serial, scale, color) {
    this.viewer.addStyle(
      { model: this.model, serial },
      {
        sphere: {
          scale,
          color,
          colorscheme: undefined,
        },
      },
    );
  }

  /**
   * 读取最新 selection，设置当前键端点、已确认头尾和当前保留端样式。
   * 父组件负责生成选择状态，此方法只显示状态，不直接 render。
   */
  highlightSites() {
    const {
      bondSerials,
      retainedSerial,
      phase,
      sites,
    } = this.selection;

    for (const serial of bondSerials ?? []) {
      this.highlightAtom(serial, this.sphereScale, "orange");
    }

    // 继续选择尾部时，已经确认的头部颜色持续保留。
    for (const role of ["head", "tail"]) {
      const serial = sites?.[role]?.retainedSerial;
      if (serial != null) {
        this.highlightAtom(
          serial,
          this.siteSphereScale,
          this.siteColors[role],
        );
      }
    }
    // 当前保留端使用当前阶段对应的颜色。
    if (
      retainedSerial != null
      && this.siteColors[phase] !== undefined
    ) {
      this.highlightAtom(
        retainedSerial,
        this.siteSphereScale,
        this.siteColors[phase],
      );
    }
  }

  /**
   * 调用方：home.vue 通过组件暴露的方法调用。
   * 输入：位点标定状态 value。
   * 副作用：保存该状态引用，并安排一次动画帧刷新。
   *
   * 同一帧多次通知只安排一个任务，执行时读取最后保存的 selection。
   */
  setSiteSelection(value) {
    if (this.disposed) return;
    this.selection = value;
    // 尚未挂载时先保存状态，mount 会负责首次绘制。
    if (!this.viewer || this.frame !== null) return;
    this.frame = requestAnimationFrame(this.callbacks.refresh);
  }

  /**
   * 输入：父组件传入的头尾位点；输出：两端待清除原子的 serial 数组。
   * 只读取当前模型，不改变原子、键或显示；模型不可用时抛错。
   */
  findLeavingGroups(sites) {
    if (this.disposed || !this.model) throw new Error("分子模型尚未就绪");
    return findLeavingGroups(this.model.selectedAtoms({}), sites);
  }

  /** 输入：调用方当前 PDB 文本；输出：脱离渲染对象的拓扑快照，无副作用。 */
  getAtomSnapshot(text) {
    if (this.disposed || !this.model || text !== this.modelText) {
      throw new Error('分子模型尚未就绪，请等待刷新完成');
    }
    const result = [];
    for (const atom of this.model.selectedAtoms({})) {
      result.push({
        index: atom.index, serial: atom.serial,
        bonds: [...(atom.bonds ?? [])], bondOrder: [...(atom.bondOrder ?? [])],
      });
    }
    return result;
  }

  /**
   * mount 或浏览器动画帧调用，不使用回调参数，读取实例中的最新状态。
   * 副作用：清除普通原子选择，刷新键和位点高亮并绘制。
   */
  refreshSite() {
    this.frame = null;
    if (this.disposed || !this.viewer) return;
    this.item = null;
    this.viewer.setStyle({}, this.defaultStyle);
    for (const { shape, pair } of this.bondEntries) {
      const role = this.confirmedBondRole(pair);
      const selected = sameBond(pair, this.selection.bondSerials);
      // 普通键透明，当前键红色，已确认键优先使用头尾颜色。
      let color = "orange";
      if (selected) color = "red";
      if (role) color = this.siteColors[role];
      shape.updateStyle({
        color,
        opacity: role || selected ? 1 : 0,
      });
    }
    this.highlightSites();
    this.viewer.render();
  }

  /**
   * 调用方：3Dmol 的原子点击事件。
   * 输入：atom，由 3Dmol 提供 index、serial、model 和坐标。
   *
   * 标定模式只上报当前键端点；普通模式切换原子选中样式。
   * 两种模式都会在有效点击时更新 origin.position。
   */
  handleAtomClick(atom) {
    if (this.disposed || !this.viewer) return;
    if (this.props.siteMode) {
      if (!this.selection.bondSerials?.includes(atom.serial)) return;
      this.origin.position = [atom.x, atom.y, atom.z];
      this.emit("atom-click", atom.serial);
      return;
    }
    this.viewer.setStyle({}, this.defaultStyle);
    if (this.item !== atom.index) {
      this.item = atom.index;
      this.viewer.setStyle(
        { model: atom.model, index: this.item },
        {
          stick: { radius: 0.25, color: "red" },
          sphere: {
            scale: this.sphereScale,
            color: 0xFF00FF,
          },
        },
      );
    } else {
      // 再次点击同一原子时取消普通选择。
      this.item = null;
    }
    this.origin.position = [atom.x, atom.y, atom.z];
    // 普通原子样式更新后，重新补上已确认位点的高亮。
    this.highlightSites();
    this.viewer.render();
  }

  /**
   * 输入：无，读取已保存的动画帧编号。
   * 副作用：取消待执行刷新，并恢复无任务状态。
   * 模型替换和实例释放前调用。
   */
  cancelRefresh() {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
    }
    this.frame = null;
  }

  /**
   * 输入：无，处理当前模型和交互圆柱。
   * 副作用：解除事件引用，释放渲染资源并移除旧模型。
   * 保留 viewer 本身，允许随后加载另一个模型。
   *
   * hoverTimeout、renderedMolObj 等属于 3Dmol 内部字段；升级时需重新核对。
   */
  clearModel() {
    this.modelText = null;
    if (!this.viewer) return;
    clearTimeout(this.viewer.hoverTimeout);
    clearTimeout(this.viewer.longTouchTimeout);
    this.viewer.current_hover = null;
    // 清除旧 atom/shape 上的绑定，防止外部保留旧对象时继续持有控制器。
    for (const atom of this.model?.selectedAtoms({}) ?? []) {
      atom.clickable = false;
      atom.callback = undefined;
    }
    for (const { shape } of this.bondEntries) {
      shape.updateStyle({
        clickable: false,
        hoverable: false,
        callback: undefined,
        hover_callback: undefined,
        unhover_callback: undefined,
      });
      releaseRenderedObjects(shape.renderedShapeObj);
      this.viewer.removeShape(shape);
    }
    // 清空遍历记录和查找关系，不再持有旧圆柱及端点数据。
    this.bondEntries.length = 0;
    this.pairs = new WeakMap();
    if (this.model) {
      releaseRenderedObjects(this.model.renderedMolObj);
      this.viewer.removeModel(this.model);
    }
    this.model = null;
    // 清除查看器维护的拾取缓存，避免保留旧模型交互对象。
    this.viewer.clickables?.splice(0);
    this.viewer.hoverables?.splice(0);
  }

  /**
   * 调用方：组件 watch。
   * 输入：Vue 传入的最新 PDB 文本 text。
   * 副作用：清理旧模型，重置选择，载入新模型并调整视野。
   */
  replaceModel(text) {
    if (this.disposed || !this.viewer) return;
    this.cancelRefresh();
    this.selection = {
      bondSerials: null,
      retainedSerial: null,
    };
    this.item = null;
    delete this.origin.position;
    this.clearModel();
    this.loadModel(text);
    this.viewer.zoomTo();
    this.viewer.render();
    // 只有完整加载并绘制后才确认来源，供父组件验证刷新结果。
    this.modelText = text;
  }

  /**
   * 调用方：组件卸载钩子，或初始化失败处理。
   * 输入：无。
   * 副作用：停止任务、释放资源、清除外部依赖引用。
   *
   * disposed 阻止重复释放，已经排队的业务回调也会根据标记停止。
   */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelRefresh();
    try {
      this.clearModel();
    } finally {
      try {
        // 即使模型清理抛错，也尝试清理外部监听和观察器。
        this.resources.dispose();
      } finally {
        // 即使资源清理抛错，也断开控制器自身持有的业务引用。
        this.bondEntries.length = 0;
        this.pairs = new WeakMap();
        this.viewer = null;
        this.model = null;
        this.selection = null;
        this.containerRef = null;
        this.props = null;
        this.emit = null;
        this.origin = null;
        this.createViewer = null;
        this.callbacks = null;
      }
    }
  }
}
