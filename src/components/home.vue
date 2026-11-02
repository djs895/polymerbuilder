<template>
    <div class="flex flex-col bg-gray-100 text-sm text-gray-700 h-screen">
        <!-- 表头部分包括polymerbuilder和四种文件处理的动作 -->
        <header class="flex h-12 shrink-0 items-center justify-between px-4 border-b border-gray-200 bg-white">
            <div class="flex items-center gap-3 text-gray-800 font-semibold">
                polymerbuilder
            </div>
            <div class="flex items-center gap-3 text-gray-800">
                <span class="rounded px-2 py-1 bg-gray-500 border">新建</span>
                <span class="rounded px-2 py-1 bg-gray-500 border">打开</span>
                <span class="rounded px-2 py-1 bg-gray-500 border">清除</span>
                <details class="relative">
                    <summary class="cursor-pointer rounded bg-gray-200 px-2 py-1">保存</summary>
                    <button
                        type="button"
                        :disabled="!polymerResult || deletionBusy || isImporting"
                        @click="exportPdb(pdbText, polymerResult)"
                        class="absolute right-0 z-20 mt-1 w-36 rounded bg-white p-2 shadow hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >保存 PDB 文件</button>
                </details>
            </div>
        </header>

        <main class="flex flex-1 overflow-hidden p-3">
            <aside class="w-62 shrink-0 overflow-y-auto rounded-md border border-gray-200 bg-white">
                <!-- section1用来处理文件的导入 -->
                <section class="border border-b border-gray-200">
                    <div class="flex flex-1 p-2 items-center border-b border-gray-200 text-blue-400 font-semibold">单体导入</div>
                    <div class="space-y-3 p-3">
                        <div class="flex text-sm gap-3">
                            <button v-for="item in ['SMILES', 'PDB', '文件导入']" :key="item" @click="active = item"
                                :class="[' flex-1 px-1 py-1 rounded', active === item ? 'bg-blue-400' : 'bg-gray-200']">{{
                                    item
                                }}</button>
                        </div>
                        <div>
                            <input id="smiles-input" v-if="active === 'SMILES'"
                                class=" w-full h-12 border border-gray-300 text-sm bg-gray-100 text-center"
                                placeholder="请输入SMILES字符串">
                            <!-- 把pdbinput绑定到input标签，使pdbinput可以获取input输入的pdb -->
                            <input id="pdb-input" v-if="active === 'PDB'"
                                ref="pdbInput"
                                type="file"
                                accept=".pdb,.ent"
                                :disabled="isImporting || deletionBusy"
                                @change="importError = ''"
                                class=" w-full h-12 border border-gray-300 text-sm bg-gray-100 text-center"
                                aria-label="选择 PDB 文件">
                            <p v-if="active === 'PDB' && importError" role="alert" class="mt-2 text-red-500">
                                {{ importError }}
                            </p>
                            <div class="flex justify-end py-2 text-center">
                                <button
                                    type="button"
                                    @click="importPdb"
                                    :disabled="isImporting || deletionBusy"
                                    class="flex w-30 py-2 rounded  bg-gray-200 text-sm text-black  items-center justify-center hover:bg-blue-400 disabled:opacity-50">
                                    {{ isImporting ? '读取中…' : '导入' }}</button>
                            </div>

                        </div>
                    </div>
                </section>
                <!-- sextion2进行反应活性位点的标定 -->
                <section class="border border-b border-gray-200">
                    <div class="flex items-center justify-between p-2 border-b border-gray-200">
                        <span class="text-blue-400 font-semibold">位点标定</span>
                        <button
                            type="button"
                            @click="startSiteSetting"
                            :disabled="isImporting || deletionBusy"
                            class="px-2 py-1 rounded bg-gray-200 hover:bg-blue-400"
                        >
                            {{ editingSite ? '重新标定' : '参数设置' }}
                        </button>
                    </div>
                    <div class="space-y-3 p-3">
                        <div class="flex flex-col text-sm">
                            <div class="flex flex-col text-sm">
                                <div class="flex items-center justify-center mt-2">
                                    <span class="font-semibold flex flex-1">
                                        头端
                                    </span>
                                    <!-- 已确认结果优先显示；确认前显示当前选中的端点 serial。 -->
                                    <div class="flex flex-2 py-2 px-3 bg-gray-200">
                                        {{ polymerResult ? '原单体 ' : '' }}{{ connectionSites?.headSerial ?? sites.head?.retainedSerial ?? (phase === 'head' ? atom : null) ?? '待选择' }}
                                    </div>
                                    <div class="flex flex-1 items-center justify-center ">
                                        <div class="w-3 h-3 rounded-full bg-green-500"></div>
                                    </div>
                                </div>
                                <div class="flex items-center justify-center mt-2">
                                    <span class="font-semibold flex flex-1">
                                        尾端
                                    </span>
                                    <div class="flex flex-2 py-2 px-3 bg-gray-200">
                                        {{ polymerResult ? '原单体 ' : '' }}{{ connectionSites?.tailSerial ?? sites.tail?.retainedSerial ?? (phase === 'tail' ? atom : null) ?? '待选择' }}
                                    </div>
                                    <div class="flex flex-1 items-center justify-center ">
                                        <div class="w-3 h-3 rounded-full bg-red-500"></div>
                                    </div>
                                </div>
                            </div>
                            <div class="flex justify-end py-2 text-center">
                                <button
                                    @click="settingChange"
                                    :disabled="!editingSite || !canConfirm || isImporting || deletionBusy"
                                    class="flex w-30 py-2 rounded  text-sm text-black bg-gray-200 items-center justify-center hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                                    {{ phase === 'head' ? '确认头部'
                                        : phase === 'tail' ? '确认尾部并应用'
                                        : '标定完成' }}</button>
                            </div>
                            <p v-if="siteError" role="alert" class="text-red-500">{{ siteError }}</p>
                            <p v-if="leavingGroups" class="text-gray-500">
                                待清除原子：头端 {{ leavingGroups.head.length }} 个，尾端 {{ leavingGroups.tail.length }} 个
                            </p>
                            <div class="flex justify-end mt-2">
                                <ApplyDeletion :available="!!leavingGroups && !isImporting"
                                    :busy="deletionBusy" @apply="applyDeletion" />
                            </div>
                        </div>
                    </div>
                </section>
                <section v-if="setting===true" class="border-b border-gray-200">
                    <div class="flex flex-1 p-2 items-center border-b border-gray-200 text-blue-400 font-semibold ">聚合设置
                    </div>
                    <div class="space-y-3 p-3  text-sm">
                        <div class="flex flex-col">
                            <div class="flex">
                                <div class="flex flex-1 font-semibold  ">
                                    聚合类型
                                </div>
                                <select v-model="polymerType" aria-label="聚合类型" :disabled="deletionBusy || isImporting"
                                    class="flex-2 min-w-0 py-1 bg-gray-200">
                                    <option value="head-tail">头尾连接</option>
                                    <option value="head-head">头头/尾尾交替</option>
                                </select>
                            </div>
                            <div class="flex mt-2">
                                <div class="flex flex-1 font-semibold  ">
                                    聚合度
                                </div>
                                <input v-model.number="polymerN" type="number" min="1" step="1" aria-label="聚合度"
                                    :disabled="deletionBusy || isImporting" class="flex-2 min-w-0 w-0 py-1 bg-gray-200">
                            </div>
                            <div class="flex mt-2">
                                <div class="flex flex-1 font-semibold  ">
                                    键长（Å）
                                </div>
                                <input v-model.number="polymerBondLength" type="number" min="0" step="any" placeholder="请输入"
                                    aria-label="目标键长（Å）" :disabled="deletionBusy || isImporting"
                                    class="flex-2 min-w-0 w-0 py-1 bg-gray-200">
                            </div>
                        </div>
                        <div class="flex justify-end py-2 text-center">
                                <button
                                    type="button" @click="applyPolymer"
                                    :disabled="!monomerTemplate || deletionBusy || isImporting"
                                    class="flex w-30 py-2 rounded text-sm text-black bg-gray-200 items-center justify-center hover:bg-blue-500 disabled:opacity-50">
                                    应用设置</button>
                        </div>
                        <p v-if="!monomerTemplate" class="text-gray-500">请先应用原子删除。</p>
                        <p v-if="polymerError" role="alert" class="text-red-500">{{ polymerError }}</p>
                    </div>
                </section>
            </aside>
            <middle class="relative flex-1 overflow-hidden rounded-md border border-gray-200 bg-white">
                <!-- 把viewer标签绑定为refsiteViewer获取操作viewer的DOM元素 -->
                <viewer
                    ref="siteViewer"
                    :pdb-text="pdbText"
                    :infer-bonds="inferBonds"
                    :site-mode="editingSite && !isImporting && !deletionBusy"
                    @bond-click="selectBond"
                    @atom-click="selectAtom"
                />
            </middle>
            <aside class="w-50 shrink-0 overflow-y-auto rounded-md border border-gray-200 bg-white">
                <section class="border border-b border-gray-200">
                    <div class="flex p-2 items-center border-b border-gray-200 text-blue-400 font-semibold">
                        当前结构信息
                    </div>
                    <div class="space-y-3 p-3">
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">结构名称</span>
                            <span class="text-sm text-gray-500">{{ polymerResult ? '聚合物' : '单体' }}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">聚合类型</span>
                            <span class="text-sm text-gray-500">{{ polymerResult ? (polymerResult.type === 'head-tail' ? '头尾' : '头头/尾尾') : '—' }}</span>
                        </div>                        
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">聚合度</span>
                            <span class="text-sm text-gray-500">{{ polymerResult?.n ?? '—' }}</span>
                        </div>                        
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">原子数</span>
                            <span class="text-sm text-gray-500">{{ polymerResult?.atomCount ?? '—' }}</span>
                        </div>                        
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">分子量</span>
                            <span class="text-sm text-gray-500">—</span>
                        </div>                        
                    </div>
                </section>
                <section class="border border-b border-gray-200">
                    <div class="flex p-2 items-center border-b border-gray-200 text-blue-400 font-semibold">
                        任务状态
                    </div>
                    <div class="space-y-3 p-3">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center">
                                <div class="rounded-full h-3 w-3 border border-gray-200"></div>
                                <span class="text-gray-500 p-1">生成结构</span>
                            </div>
                            <span class="text-gray-500">
                                {{ deletionBusy ? '处理中' : polymerResult ? '完成' : '待生成' }}
                            </span>

                        </div>
                        
                    </div>

                </section>
                <section class="h-full border border-b border-gray-200">
                </section>
            </aside>
        </main>
    </div>

</template>


<script setup>
import { ref, shallowRef, watch } from 'vue'
import viewer from './viewer.vue'
import ApplyDeletion from './ApplyDeletion.vue'
import { PdbDeletionController } from '../controllers/PdbDeletionController.js'
import { PolymerBuildController } from '../controllers/PolymerBuildController.js'
import { importPdbFile } from '../utils/importPdbFile.js'
import { useSiteSelection } from '../composables/useSiteSelection.js'
import {
    confirmSiteSettings, updateViewerSelection,
} from '../utils/siteSettings.js'
const active = ref('SMILES')
const setting=ref(false)
// 默认预览；只有点击“参数设置”后才开启位点交互。
//用来保存是否在位点标定状态
const editingSite = ref(false)
//将viewer绑定到siteViewer获取操作元素DOM
const siteViewer = ref(null)
//存于一个ref中绑定至input标签
const pdbInput = ref(null)
//用来确定是否有文件已经导入
const isImporting = ref(false)
//保存在当前导入时产生的error
const importError = ref('')

// 父组件持有唯一一套标定状态：接收点击事件，再通知 viewer 更新样式。
const selection = useSiteSelection(updateViewerSelection.bind(null, siteViewer))
const {
    phase, atom, sites, canConfirm,
    selectBond, selectAtom,
} = selection
// 确认成功时写入；模板读取数量，后续聚合可读取两端 serial 数组。
const leavingGroups = shallowRef(null)
const siteError = ref('')
// 每个组件实例持有独立 ref，处理函数通过显式参数读取最新值。
const siteState = {
    selection, siteViewer, editingSite, setting, leavingGroups, siteError,
}
// Vue 按钮事件调用绑定函数；业务状态来自绑定参数，不捕获 setup 变量。
const settingChange = confirmSiteSettings.bind(null, siteState)
// 保存 PDB 原始文本，作为解析器和查看器共同的数据来源。
const pdbText = ref(`
HEADER    PROPENE
HETATM    1  C1  PRO A   1      -1.260   0.000   0.000  1.00  0.00           C
HETATM    2  C2  PRO A   1       0.080   0.000   0.000  1.00  0.00           C
HETATM    3  C3  PRO A   1       0.840   1.320   0.000  1.00  0.00           C
HETATM    4  H1  PRO A   1      -1.800   0.940   0.000  1.00  0.00           H
HETATM    5  H2  PRO A   1      -1.800  -0.940   0.000  1.00  0.00           H
HETATM    6  H3  PRO A   1       0.620  -0.940   0.000  1.00  0.00           H
HETATM    7  H4  PRO A   1       1.910   1.120   0.000  1.00  0.00           H
HETATM    8  H5  PRO A   1       0.580   1.900   0.890  1.00  0.00           H
HETATM    9  H6  PRO A   1       0.580   1.900  -0.890  1.00  0.00           H
CONECT    1    2    2    4    5
CONECT    2    1    1    3    6
CONECT    3    2    7    8    9
CONECT    4    1
CONECT    5    1
CONECT    6    2
CONECT    7    3
CONECT    8    3
CONECT    9    3
END
`);
// 删除控制器拥有恢复来源与连接端快照；页面只连接状态和事件。
const deletion = new PdbDeletionController({ pdbText, siteState, isImporting })
const { busy: deletionBusy, connectionSites, inferBonds, monomerTemplate } = deletion
const applyDeletion = deletion.apply.bind(deletion)
const startSiteSetting = deletion.restart.bind(deletion)
const resetSetting = deletion.resetSettings.bind(deletion)
const polymer = new PolymerBuildController({
    template: monomerTemplate, busy: deletionBusy, isImporting,
    replaceText: deletion.replaceText.bind(deletion),
})
const {
    type: polymerType, n: polymerN, bondLength: polymerBondLength,
    result: polymerResult, error: polymerError,
} = polymer
const applyPolymer = polymer.apply.bind(polymer)
// Vue 传入模板的新旧值；绑定方法从当前实例清空对应结果，无 setup 捕获。
watch(monomerTemplate, polymer.reset.bind(polymer), { flush: 'sync' })
// 文件读取器只接收输入状态和回调，不依赖删除控制器的内部实现。
const importPdb = importPdbFile.bind(null, {
    active, pdbInput, isImporting, importError, busy: deletionBusy,
    acceptText: deletion.acceptText.bind(deletion), reset: resetSetting,
})

/** 输入模板传入的 PDB 文本和聚合结果；触发下载并释放临时资源。 */
function exportPdb(text, result) {
    if (!result || !text.trim()) return

    const blob = new Blob([text], { type: 'chemical/x-pdb' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `polymer-${result.type}-${result.n}.pdb`

    try {
        document.body.appendChild(link)
        link.click()
    } finally {
        link.remove()
        // 定时器显式传入 URL；绑定内置方法的接收者，不捕获组件状态。
        setTimeout(URL.revokeObjectURL.bind(URL), 1000, url)
    }
}

</script>
