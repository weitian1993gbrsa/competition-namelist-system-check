import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useNamelistStore, initPersistence } from './stores/namelist'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// Initialize Persistence
initPersistence()

app.mount('#app')
