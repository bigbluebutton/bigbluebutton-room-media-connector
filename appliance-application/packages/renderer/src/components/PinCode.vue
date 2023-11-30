<script lang="ts" setup>

defineProps({
  pin: String,
});

</script>

<template>
  <div
    class="flex gap-x-6 w-full justify-center"
  >
    <input
      v-for="index in pin.length"

      :key="index"
      :value="pin[index-1]"
      disabled
      class="block w-full text-center font-bold rounded-lg aspect-square max-w-full text-3xl border-0 bg-white text-slate-700 border-solid border-2 border-blue-200"
    />
  </div>
</template>
