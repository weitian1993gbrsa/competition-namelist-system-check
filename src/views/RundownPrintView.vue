<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useNamelistStore } from '@/stores/namelist'
import { addMinutes } from '@/services/rundownService'

const route = useRoute()
const store = useNamelistStore()

// --- Configuration ---
const targetEventCode = computed(() => (route.query.event as string) || '')
const heatDuration = computed(() => Number(route.query.heatDuration) || 2)

// Competition Title (Read-only from Store)
const competitionTitle = computed(() => store.competitionTitle || (route.query.title as string) || 'COMPETITION CHAMPIONSHIPS')

// Auto-detect max station used if not provided, else default to 12
const stationCount = computed(() => {
    if (route.query.stationCount) return Number(route.query.stationCount)
    if (store.participants.length === 0) return 12
    const max = store.participants.reduce((m, p) => Math.max(m, p.station || 0), 0)
    return max > 0 ? max : 12
})

const rowsPerPage = computed(() => Number(route.query.rows) || 25)
const overrideStartTime = computed(() => route.query.startTime as string | undefined)
const displayStartTime = computed(() => overrideStartTime.value || '09:00')

// --- Schedule Logic ---
const eventScheduleMap = computed(() => {
    const allParts = store.participants.filter((p: any) => p.heat !== undefined)
    if (allParts.length === 0) return new Map()

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
    let currentTime = displayStartTime.value 

    eventOrder.forEach((code) => {
        const firstHeat = eventFirstHeat.get(code)!
        const lastHeat = eventLastHeat.get(code)!
        const heatCount = lastHeat - firstHeat + 1
        
        schedule.set(code, { startTime: currentTime, startHeat: firstHeat })

        const timeAdded = heatCount * heatDuration.value
        currentTime = addMinutes(currentTime, timeAdded)
    })
    
    if (targetEventCode.value && overrideStartTime.value) {
         const sched = schedule.get(targetEventCode.value)
         if (sched) sched.startTime = displayStartTime.value
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
    const currentStCount = stationCount.value

    sortedHeats.forEach(h => {
        const participantsInHeat = heatMap.get(h)!
        const heatEventCode = participantsInHeat[0]?.eventCode
        
        for (let s = 1; s <= currentStCount; s++) {
            const pts = participantsInHeat.filter((x: any) => x.station === s)
            if (pts.length > 0) {
                 const p0 = pts[0]
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

// --- Manual Pagination ---
const pages = computed(() => {
    if (rundownRows.value.length === 0) return []

    const _pages: typeof rundownRows.value[] = []
    let currentPage: typeof rundownRows.value = []
    const activeRows = rundownRows.value.filter(r => !r.isPlaceholder)
    const normalize = (code: string | undefined) => (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    
    // SAFETY ADJUSTMENT:
    const ROW_OVERHEAD = 0.35
    const BASE_COST_PER_ROW = 1.0 + ROW_OVERHEAD
    const TARGET_ROWS = rowsPerPage.value
    // Adjusted safety buffer to account for the new Title taking up vertical space
    const SAFE_COST = (TARGET_ROWS * BASE_COST_PER_ROW) - 2.5 

    let rowIdx = 0
    while (rowIdx < activeRows.length) {
         const currentRow = activeRows[rowIdx]
         if (!currentRow) break

         const lines = Math.max(1, (currentRow.name || '').split('\n').length)
         const cost = lines + ROW_OVERHEAD

         let forceBreak = false
         if (currentPage.length > 0) {
             const prevRow = currentPage[currentPage.length - 1]
             if (normalize(prevRow.eventCode) !== normalize(currentRow.eventCode)) {
                 forceBreak = true
             }
         }

         const currentPageCost = currentPage.reduce((sum, r) => {
             const l = Math.max(1, (r.name || '').split('\n').length)
             return sum + l + ROW_OVERHEAD
         }, 0)
         
         if (forceBreak || (currentPage.length > 0 && currentPageCost + cost > SAFE_COST)) {
             _pages.push(currentPage)
             currentPage = []
             if (forceBreak) continue 
         }

         currentPage.push(currentRow)
         rowIdx++
    }

    if (currentPage.length > 0) _pages.push(currentPage)
    return _pages
})

const calculateDisplayTime = (heat: number, eventCode: string, originalTime: string) => {
    if (!overrideStartTime.value) return originalTime || '-'
    const sched = eventScheduleMap.value.get(eventCode)
    if (!sched) return '-'
    const diff = heat - sched.startHeat
    const offset = diff * heatDuration.value
    return addMinutes(sched.startTime, offset)
}

const getEventName = (code: string) => store.events.find(e => e.code === code)?.name || code
const getTeamClass = (team: string) => (team || '').length > 25 ? 'text-[9px]' : (team || '').length > 15 ? 'text-[10px]' : ''
const closeWindow = () => window.close()
const printNow = () => window.print()
</script>

<template>
  <div class="print-container bg-white text-black min-h-screen">
      <div class="print:hidden p-4 bg-white border-b border-gray-200 mb-4 flex justify-between items-center shadow-sm undo-header">
          <div class="flex items-center gap-4">
               <button @click="closeWindow" class="text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1">
                  <span>← Close</span>
               </button>

          </div>
          <button @click="printNow" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-bold shadow-sm flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Print / Save as PDF</span>
          </button>
      </div>

      <div v-if="pages.length === 0" class="p-8 text-center text-gray-500">No data to display.</div>

      <div v-for="(page, pageIdx) in pages" :key="pageIdx" class="print-page relative">
          <div class="mb-1 border-b-2 border-black pb-1">
              <div class="text-center w-full mb-1">
                  <h2 class="text-2xl font-bold uppercase tracking-wider">{{ competitionTitle }}</h2>
              </div>
              
              <div class="flex justify-between items-end">
                  <h1 class="text-base font-bold uppercase tracking-tight text-gray-800">{{ getEventName(page[0]?.eventCode) }}</h1>
              </div>
          </div>

          <table class="w-full text-xs border-collapse">
              <thead>
                  <tr class="bg-gray-100 border-b border-black">
                      <th class="py-0.5 px-2 text-center w-12 border-r border-gray-300">HEAT</th>
                      <th class="py-0.5 px-2 text-left w-16 border-r border-gray-300">TIME</th>
                      <th class="py-0.5 px-2 text-center w-12 border-r border-gray-300">STATION</th>
                      <th class="py-0.5 px-2 text-left w-32 border-r border-gray-300">DIVISION</th>
                      <th class="py-0.5 px-2 text-left border-r border-gray-300">NAME</th>
                      <th class="py-0.5 px-2 text-left w-52">TEAM</th>
                  </tr>
              </thead>
              <tbody>
                  <tr v-for="row in page" :key="row.id" class="border-b border-gray-200 break-inside-avoid even:bg-gray-100">
                      <td class="py-0.5 px-2 border-r border-gray-300 font-bold align-top text-center">{{ row.heat }}</td>
                      <td class="py-0.5 px-2 border-r border-gray-300 font-mono align-top">
                          {{ calculateDisplayTime(row.heat, row.eventCode, row.scheduleTime) }}
                      </td>
                      <td class="py-0.5 px-2 border-r border-gray-300 font-bold align-top text-center">{{ row.station }}</td>
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

          <div class="absolute bottom-0 w-full pt-2 border-t border-black flex justify-between text-[10px] text-gray-500">
              <div>Generated by GB ROPE SKIPPING ACADEMY, MALAYSIA</div>
              <div>{{ pageIdx + 1 }} / {{ pages.length }}</div>
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
    
    body { 
        margin: 0; 
        padding: 0;
    }

    .print-container {
        margin: 0 !important;
        padding: 0 !important;
        width: 100%;
        max-width: none;
        box-shadow: none;
        font-family: 'Calibri', sans-serif;
    }
    
    .undo-header {
        display: none !important;
    }
    /* Ensure backgrounds print */
    tr {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }

    .print-page {
        break-after: page;
        height: auto; 
        min-height: 180mm; 
        overflow: visible;
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
    height: 190mm;
    margin-bottom: 10mm;
    background: white;
}
</style>