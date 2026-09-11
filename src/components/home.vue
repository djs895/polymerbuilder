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
                <span class="rounded px-2 py-1 bg-gray-500 border">保存</span>
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
                            <input id="pdb-input" v-if="active === 'PDB'"
                                type="file"
                                class=" w-full h-12 border border-gray-300 text-sm bg-gray-100 text-center"
                                placeholder="请输入SMILES字符串">
                            <div class="flex justify-end py-2 text-center">
                                <div
                                    @click="resetSetting()"
                                    class="flex w-30 py-2 rounded  bg-gray-200 text-sm text-black  items-center justify-center hover:bg-blue-400">
                                    导入</div>
                            </div>

                        </div>
                    </div>
                </section>
                <!-- sextion2进行反应活性位点的标定 -->
                <section class="border border-b border-gray-200">
                    <div class="flex flex-1 p-2 items-center border-b border-gray-200 text-blue-400 font-semibold ">位点标定
                    </div>
                    <div class="space-y-3 p-3">
                        <div class="flex ">
                            <div class="flex flex-1 font-semibold items-center justify-center">标定方式</div>
                            <div class="flex flex-1 items-center justify-center">
                                <button class="w-3 h-3 rounded-full border flex items-center justify-center"
                                    @click="mode = 'auto';resetSetting()"
                                    
                                    :class="mode === 'auto' ? 'border-blue-500' : 'border-gray-300'">
                                    <span v-if="mode === 'auto'" class="w-3 h-3 rounded-full bg-blue-500"></span>
                                </button>
                                <span :class="mode === 'auto' ? 'text-blue-500' : 'text-gray-400'">
                                    自动识别
                                </span>
                            </div>
                            <div class="flex flex-1 items-center justify-center">
                                <button class="w-3 h-3 rounded-full border flex items-center justify-center"
                                    @click="mode = 'manual';resetSetting()"
                                    :class="mode === 'manual' ? 'border-blue-500' : 'border-gray-300'">
                                    <span v-if="mode === 'manual'" class="w-3 h-3 rounded-full bg-blue-500"></span>
                                </button>
                                <span :class="mode === 'manual' ? 'text-blue-500' : 'text-gray-400'">
                                    手动识别
                                </span>
                            </div>
                        </div>
                        <div class="flex flex-col text-sm">
                            <div v-if="mode === 'auto'"></div>
                            <div v-if="mode === 'manual'" class="flex flex-col text-sm">
                                <div class="flex items-center justify-center mt-2">
                                    <span class="font-semibold flex flex-1">
                                        头端
                                    </span>
                                    <div class="flex flex-2 py-2 px-3 bg-gray-200">C1</div>
                                    <div class="flex flex-1 items-center justify-center ">
                                        <div class="w-3 h-3 rounded-full bg-green-500"></div>
                                    </div>
                                </div>
                                <div class="flex items-center justify-center mt-2">
                                    <span class="font-semibold flex flex-1">
                                        尾端
                                    </span>
                                    <div class="flex flex-2 py-2 px-3 bg-gray-200">C1</div>
                                    <div class="flex flex-1 items-center justify-center ">
                                        <div class="w-3 h-3 rounded-full bg-red-500"></div>
                                    </div>
                                </div>
                            </div>
                            <div class="flex justify-end py-2 text-center">
                                <button
                                    @click="settingChange"
                                    class="flex w-30 py-2 rounded  text-sm text-black bg-gray-200 items-center justify-center hover:bg-blue-500">
                                    应用设置</button>
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
                                <div class="flex flex-2 py-1 bg-gray-200 ">
                                    123
                                </div>
                            </div>
                            <div class="flex mt-2">
                                <div class="flex flex-1 font-semibold  ">
                                    聚合度
                                </div>
                                <div class="flex flex-2 py-1 bg-gray-200 ">
                                    123
                                </div>
                            </div>
                            <div class="flex mt-2">
                                <div class="flex flex-1 font-semibold  ">
                                    构型
                                </div>
                                <div class="flex flex-2 py-1 bg-gray-200 ">
                                    123
                                </div>
                            </div>
                        </div>
                        <div class="flex justify-end py-2 text-center">
                                <button
                                    class="flex w-30 py-2 rounded  text-sm text-black bg-gray-200 items-center justify-center hover:bg-blue-500">
                                    应用设置</button>
                        </div>
                    </div>
                </section>
            </aside>
            <middle class="relative flex-1 overflow-hidden rounded-md border border-gray-200 bg-white">
                <viewer />
            </middle>
            <aside class="w-50 shrink-0 overflow-y-auto rounded-md border border-gray-200 bg-white">
                <section class="border border-b border-gray-200">
                    <div class="flex p-2 items-center border-b border-gray-200 text-blue-400 font-semibold">
                        当前结构信息
                    </div>
                    <div class="space-y-3 p-3">
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">结构名称</span>
                            <span class="text-sm text-gray-500">polymer</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">聚合类型</span>
                            <span class="text-sm text-gray-500">polymer</span>
                        </div>                        
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">聚合度</span>
                            <span class="text-sm text-gray-500">polymer</span>
                        </div>                        
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">原子数</span>
                            <span class="text-sm text-gray-500">polymer</span>
                        </div>                        
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">分子量</span>
                            <span class="text-sm text-gray-500">polymer</span>
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
                                完成
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
import { ref } from 'vue'
import viewer from './viewer.vue'
import parsePdb from "../utils/pdb.js"
const active = ref('SMILES')
const mode = ref('auto')
const setting=ref(false)
const pdbText = `
HETATM    1  C1  UNL     1       0.000   0.000   0.000  1.00  0.00           C
HETATM    2  O1  UNL     1       1.430   0.000   0.000  1.00  0.00           O
HETATM    3  H1  UNL     1      -0.540   0.935   0.000  1.00  0.00           H
HETATM    4  H2  UNL     1      -0.540  -0.935   0.000  1.00  0.00           H
CONECT    1    2    3    4
CONECT    2    1
CONECT    3    1
CONECT    4    1
END
`;
var parsedData = parsePdb(pdbText)
console.log(parsedData)

function settingChange(){
    setting.value=true
}
function resetSetting() {
    setting.value = false
}
</script>
