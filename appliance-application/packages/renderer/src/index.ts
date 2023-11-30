import {createApp} from 'vue';
import App from '/@/App.vue';

import '/@/style.css';
import '../assets/bigbluebutton-font/export/style.css';

const config = await window.electronAPI.getSettings();

const app = createApp(App);

app.provide('config', config);

app.mount('#app');
