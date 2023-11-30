<template>
  <div class="relative overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
    <div>
      <div class="mt-3 text-center sm:mt-5">
        <h3 class="text-xl font-semibold leading-6 text-gray-900">Connecting ...</h3>
        <div class="mt-2">
          <p class="text-sm text-gray-500">
            A BigBlueButton Meeting is trying to connect to this room.
            Please verify the pairing code and accept the connection if they match.
          </p>
        </div>


        <div class="mt-3 mb-3">
          <span class="text-base font-semibold leading-6 text-gray-900 mb-3 block">Pairing Code</span>
          <pin-code
            :pin="offer.pairingCode"
          />
        </div>
      </div>
    </div>
    <div class="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
      <button
        type="button"
        class="inline-flex w-full justify-center place-items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2"
        @click="acceptOffer"
      >
        Accept
      </button>
      <button
        ref="cancelButtonRef"
        type="button"
        class="mt-3 inline-flex w-full justify-center place-items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0"
        @click="rejectOffer"
      >
        <div class="w-full">
          Reject

          <div class="overflow-hidden rounded-full bg-gray-200 mt-3">
            <div
              class="h-2 rounded-full bg-blue-600"
              :style="{width: autoRejectPercentage+'%'}"
            />
          </div>
        </div>
      </button>
    </div>
  </div>
</template>
<script setup>

import PinCode from '/@/components/PinCode.vue';
import {computed, onMounted, ref} from 'vue';

defineProps({
  offer: Object,
});

const emit = defineEmits(['accept', 'reject']);


const autoRejectTime = 10;
const timerInterval = 1/100;
const timer = ref(0);

const autoRejectPercentage = computed(() => {
  return timer.value/autoRejectTime*100;
});

let interval = null;

onMounted(() => {
  timer.value = autoRejectTime;
  interval = setInterval(() => {
    if (timer.value < 0) {
      rejectOffer();
    } else {
      timer.value = timer.value-timerInterval;
    }
  }, timerInterval*1000);


  window.electronAPI.handleAcceptOffer(() => {
    acceptOffer();
  });

  window.electronAPI.handleRejectOffer(() => {
    rejectOffer();
  });
});




function acceptOffer() {
  console.log('accept');
  clearInterval(interval);
  emit('accept');
}

function rejectOffer() {
  console.log('reject');
  clearInterval(interval);
  emit('reject');
}

</script>
