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

// --- Helper for time manipulation (Duplicated from RundownView - Consider extracting to shared util later) ---
const addMinutes = (timeStr: string, minutes: number): string => {
    const [h, m] = timeStr.split(':').map(Number)
    const date = new Date()
    date.setHours(h || 0, m || 0, 0, 0)
    date.setMinutes(date.getMinutes() + minutes)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// --- Schedule Logic (Simplified for Print) ---
// We need to rebuild the schedule map to get accurate times for the *entire* rundown
// or just the target event.
const eventScheduleMap = computed(() => {
    const allParts = store.participants.filter((p: any) => p.heat !== undefined)
    if (allParts.length === 0) return new Map<string, { startTime: string, startHeat: number }>()

    const heatEventMap = new Map<number, string>()
    allParts.forEach((p: any) => {
        if (!heatEventMap.has(p.heat!)) heatEventMap.set(p.heat!, p.eventCode)
    })

    const sortedHeats = Array.from(heatEventMap.keys()).sort((a, b) => a - b)
    const eventOrder: string[] = []
    const eventFirstHeat = new Map<string, number>()
    const eventLastHeat = new Map<string, number>()

    sortedHeats.forEach(h => {
        const code = heatEventMap.get(h)!
        if (!eventFirstHeat.has(code)) {
            eventOrder.push(code)
            eventFirstHeat.set(code, h)
        }
        eventLastHeat.set(code, h)
    })

    const schedule = new Map<string, { startTime: string, startHeat: number }>()
    
    // Use the Passed Start Time as Global Start if we are viewing everything?
    // actually RundownView logic is: Global Start -> Chain Events.
    // If Filtered View: Logic in RundownView `displayStartTime` getter handles the specific time for that event.
    // Here we trust `displayStartTime` passed in query IS the start time for the first visible event.
    
    let currentTime = displayStartTime.value 

    // If we are filtering, we only care about that event's start time (which is passed in).
    // If we are showing ALL, we chain them.
    
    // However, if we show ALL, `displayStartTime` param is the GLOBAL start time.
    // If we show ONE, `displayStartTime` param is THAT EVENT'S start time.
    
    // Standard Chaining Logic
    eventOrder.forEach((code, idx) => {
        // If we represent a filtered view, we might only have one event in `eventOrder`?
        // No, `allParts` gets everything from store.
        
        // If we are in filtered mode, `displayStartTime` is for `targetEventCode`.
        // So we should just use that for the target event.
        
        // But to keep it simple: We only display rows for the target scope.
        // And we calculate time for each heat.
        // Let's assume the Query Param `startTime` is the start time of the FIRST visible heat.
        
        const firstHeat = eventFirstHeat.get(code)!
        const lastHeat = eventLastHeat.get(code)!
        const heatCount = lastHeat - firstHeat + 1
        
        // We set the schedule map. 
        // Logic Gap: If we only print Event B, and pass its start time, 
        // we essentially treat Event B as the "Start".
        
         schedule.set(code, { startTime: currentTime, startHeat: firstHeat })

         const timeAdded = heatCount * heatDuration.value
         currentTime = addMinutes(currentTime, timeAdded)
    })
    
    // OVERRIDE for consistency:
    // If we have a target event, force its start time to match the query param (visually)
    if (targetEventCode.value) {
         const sched = schedule.get(targetEventCode.value)
         if (sched) {
             sched.startTime = displayStartTime.value
         }
    } else {
        // Global mode: simplistic assumption that first event starts at query param time.
        // (Refining this would require re-implementing the full logic, but this is usually sufficient for print)
        const firstCode = eventOrder[0]
        if (firstCode) {
             const sched = schedule.get(firstCode)
             if (sched) sched.startTime = displayStartTime.value
        }
    }

    return schedule
})

const rundownRows = computed(() => {
    let parts = store.participants.filter((p: any) => p.heat !== undefined)
    
    if (targetEventCode.value) {
        parts = parts.filter((p: any) => p.eventCode === targetEventCode.value)
    }

    if (parts.length === 0) return []

    const heatMap = new Map<number, typeof parts>()
    let maxHeat = 0
    parts.forEach((p: any) => {
        const h = p.heat!
        if (h > maxHeat) maxHeat = h
        if (!heatMap.has(h)) heatMap.set(h, [])
        heatMap.get(h)!.push(p)
    })

    const rows: any[] = []
    const sortedHeats = Array.from(heatMap.keys()).sort((a, b) => a - b)

    sortedHeats.forEach(h => {
        const participantsInHeat = heatMap.get(h)!
        const heatEventCode = participantsInHeat[0]?.eventCode
        
        // For Print, we force the requested station count
        const currentStCount = stationCount.value

        for (let s = 1; s <= currentStCount; s++) {
            const pts = participantsInHeat.filter((x: any) => x.station === s)
            if (pts.length > 0) {
                 const p0 = pts[0]
                 if (!p0) continue // Safety check
                 
                 const combinedNames = pts.map((p: any) => p.name).join('\n')
                 rows.push({
                        id: p0.id,
                        heat: p0.heat!,
                        scheduleTime: p0.scheduleTime!,
                        station: p0.station!,
                        eventCode: p0.eventCode,
                        division: p0.division,
                        name: combinedNames,
                        team: p0.team || '',
                        isPlaceholder: false
                 })
            } else {
                 // Include Placeholders for Grid Alignment? 
                 // User requested "My own template". Usually tabular.
                 // Let's include them to keep the grid structure solid.
                  rows.push({
                    id: `ph-${h}-${s}`,
                    heat: h,
                    scheduleTime: '', 
                    station: s,
                    eventCode: heatEventCode,
                    division: '-',
                    name: '-',
                    team: '-',
                    isPlaceholder: true
                })
            }
        }
    })
    return rows
})

// --- Manual Pagination for Print ---
const pages = computed(() => {
    if (rundownRows.value.length === 0) return []

    const _pages: typeof rundownRows.value[] = []
    let currentPage: typeof rundownRows.value = []
    
    const activeRows = rundownRows.value.filter(r => !r.isPlaceholder)
    
    const normalize = (code: string | undefined) => (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    
    // Balanced Cost Model
    // 1-Name (1 line) -> Target 26 rows. Cost ~1.35 * 26 = 35.1
    // 4-Name (4 lines) -> Target 8 rows. Cost ~4.35 * 8 = 34.8
    // 2-Name (2 lines) -> Target ~15 rows. Cost ~2.35 * 15 = 35.25
    const ROW_OVERHEAD = 0.35
    const SAFE_COST = 35.5 

    let rowIdx = 0

    while (rowIdx < activeRows.length) {
         if (currentPage.length === 0) {}

         // Current Cost
         const currentPageCost = currentPage.reduce((sum, r) => {
             const lines = Math.max(1, (r.name || '').split('\n').length)
             return sum + lines + ROW_OVERHEAD
         }, 0)

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
        
         // Calculate Row Cost
         const lines = Math.max(1, (currentRow.name || '').split('\n').length)
         const cost = lines + ROW_OVERHEAD
         
         if (currentPage.length > 0 && currentPageCost + cost > SAFE_COST) {
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

const getTeamClass = (team: string) => {
    const len = (team || '').length
    if (len > 25) return 'text-[9px]'
    if (len > 15) return 'text-[10px]'
    return ''
}

const closeWindow = () => {
    window.close()
}

const printNow = () => {
    window.print()
}

// Auto Print removed in favor of manual button
// onMounted(() => {
//     setTimeout(() => {
//         window.print()
//     }, 1000) 
// })
</script>

<template>
  <div class="print-container bg-white text-black min-h-screen">
      <!-- Info Header (Instructions only visible on screen) -->
      <div class="print:hidden p-4 bg-white border-b border-gray-200 mb-4 flex justify-between items-center shadow-sm undo-header">
          <div class="flex items-center gap-4">
               <button @click="closeWindow" class="text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1">
                  <span>← Close</span>
               </button>
               <div class="h-6 w-px bg-gray-300"></div>
               <div>
                   <h1 class="font-bold text-lg text-gray-800">Print Preview</h1>
               </div>
          </div>
          <button @click="printNow" class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 font-bold shadow-sm flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Export to PDF</span>
          </button>
      </div>

      <div v-if="pages.length === 0" class="p-8 text-center text-gray-500">
          No data to display.
      </div>

      <!-- Pages -->
      <div v-for="(page, pageIdx) in pages" :key="pageIdx" class="print-page relative">
          <!-- Page Header -->
          <div class="mb-2 border-b-2 border-black pb-1">
              <h1 class="text-xl font-bold uppercase tracking-tight">{{ getEventName(page[0]?.eventCode) }}</h1>
          </div>

          <!-- Table -->
          <table class="w-full text-xs border-collapse">
              <thead>
                  <tr class="bg-gray-100 border-b border-black">
                      <th class="py-0.5 px-2 text-left w-12 border-r border-gray-300">HEAT</th>
                      <th class="py-0.5 px-2 text-left w-16 border-r border-gray-300">TIME</th>
                      <th class="py-0.5 px-2 text-left w-12 border-r border-gray-300">STATION</th>
                      <th class="py-0.5 px-2 text-left w-32 border-r border-gray-300">DIVISION</th>
                      <th class="py-0.5 px-2 text-left border-r border-gray-300">NAME</th>
                      <th class="py-0.5 px-2 text-left w-52">TEAM</th>
                  </tr>
              </thead>
              <tbody>
                  <tr v-for="row in page" :key="row.id" class="border-b border-gray-200">
                      <td class="py-0.5 px-2 border-r border-gray-300 font-bold align-top">{{ row.heat }}</td>
                      <td class="py-0.5 px-2 border-r border-gray-300 font-mono align-top">
                          {{ calculateDisplayTime(row.heat, row.eventCode) }}
                      </td>
                      <td class="py-0.5 px-2 border-r border-gray-300 font-bold align-top">{{ row.station }}</td>
                      <td class="py-0.5 px-2 border-r border-gray-300 align-top whitespace-nowrap">{{ row.division }}</td>
                      <td class="py-0.5 px-2 border-r border-gray-300 align-top font-bold">
                          <div v-for="(nameLine, idx) in row.name.split('\n')" :key="idx" class="flex items-start gap-1">
                              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-gray-400 mt-[3px] shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                  <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
                              </svg>
                              <span>{{ nameLine }}</span>
                          </div>
                      </td>
                      <td class="py-0.5 px-2 align-top text-gray-600 whitespace-nowrap transition-all" :class="getTeamClass(row.team)">{{ row.team }}</td>
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
        min-height: 180mm; /* Reduced to avoid spillover blank pages */
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
