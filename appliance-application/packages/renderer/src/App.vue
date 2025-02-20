<script lang="ts" setup>
import PairingCode from '/@/components/PairingCode.vue';
import {inject, onMounted, ref} from 'vue';
import BBBWebSocket from '/@/websocket';
import LoadingSpinner from '/@/components/LoadingSpinner.vue';
import ConnectionError from '/@/components/ConnectionError.vue';
import VerifyConnection from '/@/components/VerifyConnection.vue';
import ConfigMissing from '/@/components/ConfigMissing.vue';
import {XMarkIcon} from '@heroicons/vue/24/solid';

const config = inject('config');

const pin = ref<string | null>(null);
const verificationCode = ref<string | null>(null);
const ws_connection_failed = ref(false);

const onConnectionChanged = (status: boolean) => {
  ws_connection_failed.value = !status;
};

const onPairingPin = (newPin: string) => {
  pin.value = newPin;
};

const onVerification = (newVerificationCode: string) => {
  pin.value = null;
  verificationCode.value = newVerificationCode;
  window.electronAPI.requireVerification();
};

const onJoinUrls = urls => {
  window.electronAPI.joinURLs(urls);
};

window.electronAPI.handleLeftMeeting(() => {
  ws.disconnectFromPlugin();
});

window.electronAPI.handleVerificationAccepted(() => {
  ws.acceptVerification();
  verificationCode.value = null;
});

window.electronAPI.handleVerificationRejected(() => {
  ws.rejectVerification();
  verificationCode.value = null;
});

let ws = null;

function connect() {
  ws = new BBBWebSocket(
    config.config.room,
    config.config.control_server.ws,
    config.config.control_server.reconnect_interval,
    config.config.control_server.ping_interval,
  );
  ws.setConnectionStatusCallback(onConnectionChanged);
  ws.setPairingPinCallback(onPairingPin);
  ws.setVerificationCallback(onVerification);
  ws.setJoinUrlCallback(onJoinUrls);
  ws.setPluginDisconnectedCallback(onPluginDisconnected);
  ws.connect();
}

onMounted(() => {
  if (config.config) {
    connect();
  }
});

function onVerificationAccepted() {
  window.electronAPI.verificationAccepted();
  ws.acceptVerification();
  verificationCode.value = null;
}

function onPluginDisconnected() {
  window.electronAPI.pluginDisconnected();
}

function onVerificationRejected() {
  window.electronAPI.verificationRejected();
  ws.rejectVerification();
  verificationCode.value = null;
}

const closeApp = () => {
  window.electronAPI.close();
};
</script>

<template>
  <main class="flex h-screen place-items-center justify-center px-6 py-24 sm:py-32 lg:px-8">
    <button
      v-if="config.config.hide_close_button !== true"
      class="absolute top-5 right-5 rounded-full bg-red-500 p-2 hover:bg-red-600"
      @click="closeApp"
    >
      <XMarkIcon
        class="h-5 w-5 text-white"
        aria-hidden="true"
      />
    </button>

    <div class="text-center max-w-lg">
      <img
        src="/assets/BigBlueButton_icon.svg.png"
        alt="Vite Logo"
        class="mx-auto h-12 w-auto"
      />
      <h1 class="mt-4 text-3xl font-bold text-white sm:text-5xl">BigBlueButton</h1>

      <div class="block mt-4 w-full">
        <div
          v-if="config.config"
          class="flex items-center flex-col justify-center px-10"
        >
          <loading-spinner
            v-if="!pin"
            class="my-10"
          />

          <connection-error v-if="ws_connection_failed" />

          <pairing-code
            v-if="pin && !verificationCode"
            :pin="pin"
          />

          <verify-connection
            v-if="verificationCode"
            :auto-reject-time="config.config.auto_reject_time"
            :verification-code="verificationCode"
            @accept="onVerificationAccepted"
            @reject="onVerificationRejected"
          />
        </div>
        <config-missing
          v-else
          :config-path="config.path"
        />
      </div>
    </div>
  </main>
</template>
