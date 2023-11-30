<template>
  <div class="rounded-md bg-red-600 p-4">
    <div class="flex justify-center">
      <ExclamationTriangleIcon
        class="h-10 w-10 text-white"
        aria-hidden="true"
      />
    </div>
    <div class="ml-3">
      <h3 class="font-medium text-white">Connection error</h3>
      <div class="mt-2 text-sm text-white">
        <span>Could not connect to BigBlueButton Media System Pairing Server</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ExclamationTriangleIcon } from '@heroicons/vue/24/solid';

</script>
