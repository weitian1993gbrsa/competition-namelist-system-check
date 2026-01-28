import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import ImportView from '../views/ImportView.vue'
import SettingsView from '../views/SettingsView.vue'
import RundownView from '../views/RundownView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView
    },
    {
      path: '/import',
      name: 'import',
      component: ImportView
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView
    },
    {
      path: '/rundown',
      name: 'rundown',
      component: RundownView
    }
  ]
})

export default router
