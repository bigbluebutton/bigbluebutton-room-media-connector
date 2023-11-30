<script lang="ts" setup>

import PinCode from '/@/components/PinCode.vue';

defineProps({
  pin: String,
});

</script>

<template>
  <p class="my-8 text-white">To join this room into your BigBlueButton Meeting, click on + and enter this code</p>

  <pin-code :pin="pin" />
</template>
