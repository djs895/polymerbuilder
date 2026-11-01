<template>
  <button
    type="button"
    :disabled="!available || busy"
    class="rounded bg-blue-400 px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
    @click="$emit('apply')"
  >
    {{ busy ? '处理中…' : '应用删除' }}
  </button>
</template>

<script setup>
// 父组件提供状态；本组件只展示按钮并发送事件，不持有分子数据。
defineProps({ available: Boolean, busy: Boolean });
defineEmits(['apply']);
</script>
