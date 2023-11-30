<script lang="ts" setup>

import PairingCode from '/@/components/PairingCode.vue';
import {inject, onMounted, ref} from 'vue';
import BBBWebSocket from '/@/websocket';
import LoadingSpinner from '/@/components/LoadingSpinner.vue';
import ConnectionError from '/@/components/ConnectionError.vue';
import RoomOffer from '/@/components/RoomOffer.vue';

const config = inject('config');

const pin = ref<string | null>(null);
const offer = ref<object | null>(null);
const ws_connection_failed = ref(false);


const onConnectionChanged = (status: boolean) => {
  ws_connection_failed.value = !status;
};

const onNewPin = (newPin: string) => {
  pin.value = newPin;
};

const onNewOffer = (urls, pairingCode ) => {
  console.log('new offer', urls, pairingCode);
  offer.value = {urls, pairingCode};
  window.electronAPI.newOffer();
};

window.electronAPI.handleTriggerNewPin(() => {
  ws.reconnect(config.room, 1);
});


let ws = null;

function connect(){
  ws = new BBBWebSocket(config.control_server.ws, config.control_server.reconnect_interval, config.control_server.ping_interval);
  ws.setConnectionStatusCallback(onConnectionChanged);
  ws.setNewPinCallback(onNewPin);
  ws.setOfferCallback(onNewOffer);
  ws.connect(config.room);
}


onMounted(() => {
  connect();
});

function onAcceptOffer() {
  window.electronAPI.acceptOffer(JSON.parse(JSON.stringify(offer.value)));
  ws.acceptOffer();
  offer.value = null;
}

function onRejectOffer() {
  window.electronAPI.rejectOffer();
  ws.rejectOffer();
  offer.value = null;
}


</script>

<template>
  <main class="flex h-screen place-items-center justify-center px-6 py-24 sm:py-32 lg:px-8">
    <div class="text-center max-w-lg">
      <img
        src="/assets/BigBlueButton_icon.svg.png"
        alt="Vite Logo"
        class="mx-auto h-12 w-auto"
      />
      <h1 class="mt-4 text-3xl font-bold text-white sm:text-5xl">BigBlueButton</h1>

      <div class="block mt-4 w-full">
        <div class="flex items-center flex-col justify-center px-10 ">
          <loading-spinner
            v-if="!pin"
            class="my-10"
          />

          <connection-error v-if="ws_connection_failed" />

          <pairing-code
            v-if="pin && !offer"
            :pin="pin"
          />

          <room-offer
            v-if="offer"
            :offer="offer"
            @accept="onAcceptOffer"
            @reject="onRejectOffer"
          />
        </div>
      </div>
    </div>
  </main>
</template>
