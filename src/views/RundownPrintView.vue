<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useNamelistStore } from '@/stores/namelist'

const route = useRoute()
const store = useNamelistStore()

// --- Configuration from Query Params ---
const targetEventCode = computed(() => (route.query.event as string) || '')
const heatDuration = computed(() => Number(route.query.heatDuration) || 2)
const stationCount = computed(() => Number(route.query.stationCount) || 12)
const rowsPerPage = computed(() => Number(route.query.rows) || 25)
const displayStartTime = computed(() => (route.query.startTime as string) || '09:00')

// ... (logic)

// --- Manual Pagination for Print ---
const pages = computed(() => {
    if (rundownRows.value.length === 0) return []

    const _pages: typeof rundownRows.value[] = []
    let currentPage: typeof rundownRows.value = []
    
    const activeRows = rundownRows.value.filter(r => !r.isPlaceholder)
    
    const normalize = (code: string | undefined) => (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    // Force stricter limit for Landscape A4 to avoid footer overlap
    const SAFE_LINES = 23 

    let rowIdx = 0

    while (rowIdx < activeRows.length) {
         if (currentPage.length === 0) {}

         // Current Cost
         const currentPageCost = currentPage.reduce((sum, r) => sum + Math.max(1, (r.name || '').split('\n').length), 0)
         const remainingLines = SAFE_LINES - currentPageCost

         // Check Event Change
         const currentRow = activeRows[rowIdx]
         if (!currentRow) break
         
         // Event Break Logic
         if (currentPage.length > 0) {
             const prevRow = currentPage[currentPage.length - 1]
             if (normalize(prevRow.eventCode) !== normalize(currentRow.eventCode)) {
                 _pages.push(currentPage)
                 currentPage = []
                 continue
             }
         }
        
         // Add Row logic (Simplified: One by one)
         const cost = Math.max(1, (currentRow.name || '').split('\n').length)
         
         if (currentPage.length > 0 && currentPageCost + cost > SAFE_LINES) {
             _pages.push(currentPage)
             currentPage = []
             continue
         }

         currentPage.push(currentRow)
         rowIdx++
    }

    if (currentPage.length > 0) _pages.push(currentPage)
    
    return _pages
})

const calculateDisplayTime = (heat: number, eventCode: string) => {
    // If we have a direct schedule time from `rows`, use it?
    // The row object usually doesn't have the calculated absolute time string, just the scheduled offset maybe?
    // Actually the `scheduleTime` in participant is often just the initial scheduled time.
    // Let's use the map for consistency.
    
    // Fallback: use store config just in case map is empty (rare)
    const sched = eventScheduleMap.value.get(eventCode)
    if (!sched) return '-'
    
    const diff = heat - sched.startHeat
    const offset = diff * heatDuration.value
    return addMinutes(sched.startTime, offset)
}

const getEventName = (code: string) => {
    return store.events.find(e => e.code === code)?.name || code
}

const closeWindow = () => {
    window.close()
}

// Auto Print
onMounted(() => {
    setTimeout(() => {
        window.print()
    }, 1000) // Small delay to ensure render
})
</script>

<template>
  <div class="print-container bg-white text-black min-h-screen">
      <!-- Info Header (Instructions only visible on screen) -->
      <div class="print:hidden p-4 bg-blue-50 border-b border-blue-100 mb-4 flex justify-between items-center undo-header">
          <div>
              <p class="text-sm text-blue-800 font-bold">🖨️ Print Preview</p>
              <p class="text-xs text-blue-600">Press Ctrl+P or use browser menu to print. Adjust Scale in print settings if needed.</p>
          </div>
          <button @click="closeWindow" class="text-sm text-gray-500 hover:text-gray-700 underline">Close Window</button>
      </div>

      <div v-if="pages.length === 0" class="p-8 text-center text-gray-500">
          No data to display.
      </div>

      <!-- Pages -->
      <div v-for="(page, pageIdx) in pages" :key="pageIdx" class="print-page relative">
          <!-- Page Header -->
          <div class="mb-4 border-b-2 border-black pb-2">
              <div class="flex justify-between items-end">
                  <div>
                      <h1 class="text-2xl font-bold uppercase tracking-tight">{{ getEventName(page[0]?.eventCode) }}</h1>
                      <div class="text-sm font-mono mt-1">
                          HEAT DURATION: {{ heatDuration }} MIN | STATIONS: {{ stationCount }}
                      </div>
                  </div>
                  <div class="text-right">
                       <div class="text-xs font-bold text-gray-500 uppercase">Rundown Schedule</div>
                       <div class="text-xl font-bold">{{ displayStartTime }} START</div>
                  </div>
              </div>
          </div>

          <!-- Table -->
          <table class="w-full text-xs border-collapse">
              <thead>
                  <tr class="bg-gray-100 border-b border-black">
                      <th class="py-1 px-2 text-left w-12 border-r border-gray-300">HEAT</th>
                      <th class="py-1 px-2 text-left w-16 border-r border-gray-300">TIME</th>
                      <th class="py-1 px-2 text-left w-12 border-r border-gray-300">STATION</th>
                      <th class="py-1 px-2 text-left w-24 border-r border-gray-300">DIVISION</th>
                      <th class="py-1 px-2 text-left border-r border-gray-300">NAME</th>
                      <th class="py-1 px-2 text-left w-48">TEAM</th>
                  </tr>
              </thead>
              <tbody>
                  <tr v-for="row in page" :key="row.id" class="border-b border-gray-200">
                      <td class="py-1 px-2 border-r border-gray-300 font-bold align-top">{{ row.heat }}</td>
                      <td class="py-1 px-2 border-r border-gray-300 font-mono align-top">
                          {{ calculateDisplayTime(row.heat, row.eventCode) }}
                      </td>
                      <td class="py-1 px-2 border-r border-gray-300 font-bold align-top">{{ row.station }}</td>
                      <td class="py-1 px-2 border-r border-gray-300 align-top">{{ row.division }}</td>
                      <td class="py-1 px-2 border-r border-gray-300 align-top font-bold whitespace-pre-line">{{ row.name }}</td>
                      <td class="py-1 px-2 align-top text-gray-600">{{ row.team }}</td>
                  </tr>
              </tbody>
          </table>

          <!-- Footer -->
          <div class="absolute bottom-0 w-full pt-2 border-t border-black flex justify-between text-[10px] text-gray-500">
              <div>Generated by Competition System</div>
              <div>Page {{ pageIdx + 1 }} of {{ pages.length }}</div>
          </div>
      </div>
  </div>
</template>

<style scoped>
/* A4 Dimensions and Print Handling */
@media print {
    @page {
        size: A4 landscape;
        margin: 10mm;
    }
    .print-container {
        background: white;
        width: 100%;
        max-width: none;
    }
    .undo-header {
        display: none !important;
    }
    .print-page {
        break-after: page;
        min-height: 190mm; /* A4 Landscape height approx */
        padding-bottom: 20px;
    }
    .print-page:last-child {
        break-after: avoid;
    }
}

/* Screen Preview Styling */
.print-container {
    max-width: 297mm; /* A4 Landscape Width */
    margin: 0 auto;
    padding: 10mm;
    background: white;
    box-shadow: 0 0 20px rgba(0,0,0,0.1);
}

.print-page {
    position: relative;
    height: 190mm; /* A4 Landscape Height minus margins */
    margin-bottom: 10mm;
    background: white;
    overflow: hidden;
}
</style>
