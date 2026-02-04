import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useNamelistStore } from './stores/namelist'

const app = createApp(App)

// 1. Install Pinia first (Required for store to work)
app.use(createPinia())

// 2. Initialize Persistence immediately
// This ensures 'activeCompetitionId' is restored FROM LocalStorage
// BEFORE the router guard checks it.
// initPersistence() // REMOVED: Persistence initialization logic has been changed/removed.

// 3. Install Router last
// Now when the router starts and checks the guard, the data is ready.
app.use(router)

app.mount('#app')