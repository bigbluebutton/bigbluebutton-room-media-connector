<script lang="ts" setup>
import PairingCode from './components/PairingCode.vue';
import {inject, onMounted, ref} from 'vue';
import BBBWebSocket from './websocket';
import LoadingSpinner from './components/LoadingSpinner.vue';
import ConnectionError from './components/ConnectionError.vue';
import VerifyConnection from './components/VerifyConnection.vue';
import ConfigMissing from './components/ConfigMissing.vue';
import {XMarkIcon} from '@heroicons/vue/24/solid';
import type {Config} from '../../common/config.ts';

// @ts-expect-error
const config: Config = inject('config');

// @ts-expect-error
const configPath: string = inject('configPath');

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

const onJoinUrl = (url: string, layoutIndex: number) => {
  window.electronAPI.joinMeeting(url, layoutIndex);
};

/*
@TODO: Remove, old implementation where plugin created multiple urls
const onJoinUrls = urls => {
  window.electronAPI.joinMeeting(urls);
};
*/

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

let ws: BBBWebSocket;

function connect() {
  ws = new BBBWebSocket(
    config.room,
    config.control_server.ws,
    config.control_server.reconnect_interval,
    config.control_server.ping_interval,
  );
  ws.setConnectionStatusCallback(onConnectionChanged);
  ws.setPairingPinCallback(onPairingPin);
  ws.setVerificationCallback(onVerification);
  ws.setJoinUrlCallback(onJoinUrl);
  // @TODO: Remove, old implementation where plugin created multiple urls
  // ws.setJoinUrlsCallback(onJoinUrls);
  ws.setPluginDisconnectedCallback(onPluginDisconnected);

  ws.connect();
}

onMounted(() => {
  if (config) {
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
  if(verificationCode.value) {
    window.electronAPI.verificationRejected();
    verificationCode.value = null;
  }
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
      v-if="!config.hide_close_button"
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
          v-if="config"
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
            :auto-reject-time="config.auto_reject_time"
            :verification-code="verificationCode"
            @accept="onVerificationAccepted"
            @reject="onVerificationRejected"
          />
        </div>
        <config-missing
          v-else
          :config-path="configPath"
        />
      </div>
    </div>
  </main>
</template>
