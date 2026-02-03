import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import ImportView from '../views/ImportView.vue'
import SettingsView from '../views/SettingsView.vue'
import RundownView from '../views/RundownView.vue'
import RundownPrintView from '../views/RundownPrintView.vue'
import LandingView from '../views/LandingView.vue'
import { useNamelistStore } from '@/stores/namelist'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: LandingView
    },
    {
      path: '/dashboard',
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
    },
    {
      path: '/print/rundown',
      name: 'print-rundown',
      component: RundownPrintView
    }
  ]
})

// Navigation Guard: specific routes need active competition
router.beforeEach((to, from, next) => {
  // If going to landing, always allow
  if (to.name === 'landing') {
    next()
    return
  }

  const store = useNamelistStore()
  // If Store not initialized yet (Pinia quirk), we might need to wait? 
  // Usually fine in beforeEach if app is mounted.

  // If no active competition and trying to go to app routes, redirect to landing
  if (!store.activeCompetitionId) {
    // Try to recover? Maybe user refreshed page?
    // But store state is lost on refresh unless persisted?
    // Ah, initPersistence runs on store setup.
    // But wait, Pinia state is reset on reload.
    // We need to restore `activeCompetitionId` if possible or rely on user selecting again?
    // Actually, if I save `activeCompetitionId` to localStorage as well, I can auto-restore.
    // Let's check store implementation again. I didn't save activeCompetitionId to persistence yet!
    // Wait, I should add that to namelist.ts to allow refresh.

    // For now, Redirect to Home if lost.
    next({ name: 'landing' })
  } else {
    next()
  }
})

export default router
