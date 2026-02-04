<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNamelistStore } from '@/stores/namelist'
import type { Participant } from '@/config/defaults'

const router = useRouter()
const store = useNamelistStore()

const selectedEventCode = ref<string>('') 

// Local state for inputs (initialized with default or current event config)
const currentConfig = computed(() => store.getRundownConfig(selectedEventCode.value))

// REMOVED: const startTime = ref(currentConfig.value.startTime) 
const heatDuration = ref(currentConfig.value.heatDuration)
const stationCount = ref(currentConfig.value.stationCount)
const rowsPerPage = ref(currentConfig.value.rowsPerPage) // Default to 30

// Watch for Event Selection Change -> Reload Config
watch(selectedEventCode, () => {
    const newConfig = store.getRundownConfig(selectedEventCode.value)
    // startTime is handled by displayStartTime computed
    heatDuration.value = newConfig.heatDuration
    stationCount.value = newConfig.stationCount
    rowsPerPage.value = newConfig.rowsPerPage
})

// Custom Auto-Save for Configuration Inputs
watch([heatDuration, stationCount, rowsPerPage], () => {
    store.updateRundownConfig({
        startTime: currentConfig.value.startTime, 
        heatDuration: Number(heatDuration.value),
        stationCount: Number(stationCount.value),
        rowsPerPage: Number(rowsPerPage.value)
    }, selectedEventCode.value || 'GLOBAL')
})

// Helper for time manipulation (Optimized)
const addMinutes = (timeStr: string, minutes: number): string => {
    if (!timeStr) return '00:00'
    const [h, m] = timeStr.split(':').map(Number)
    const date = new Date()
    date.setHours(h || 0, m || 0, 0, 0)
    date.setMinutes(date.getMinutes() + minutes)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const displayStartTime = computed({
    get: () => currentConfig.value.startTime || '09:00',
    set: (val) => {
        store.updateRundownConfig({
            ...currentConfig.value,
            startTime: val
        }, selectedEventCode.value)
    }
})

const rundownRows = computed(() => {
    // Filter scheduled participants and ensure objects are compatible for UI state
    const rows = store.participants
        .filter(p => p.heat !== undefined && p.station !== undefined)
        .map(p => ({
            ...p,
            isConflict: false, 
            isPlaceholder: false 
        }))

    // Sort by Heat -> Station
    return rows.sort((a, b) => {
        const hA = a.heat || 0
        const hB = b.heat || 0
        if (hA !== hB) return hA - hB
        return (a.station || 0) - (b.station || 0)
    })
})

const eventScheduleMap = computed(() => {
    const map = new Map<string, { startHeat: number, startTime: string }>()
    if (rundownRows.value.length === 0) return map

    // Iterate sorted rows to find the first occurrence (Start Heat) of each event
    for (const row of rundownRows.value) {
        if (!map.has(row.eventCode)) {
            // Use store's event start time (configured) or fallback to participant's schedule or default
            let time = store.getEventStartTime(row.eventCode)
            if (!time) time = row.scheduleTime || displayStartTime.value
            
            map.set(row.eventCode, { startHeat: row.heat || 1, startTime: time })
        }
    }
    return map
})

const screenEventGroups = computed(() => {
    const groups: { code: string, rows: typeof rundownRows.value }[] = []
    let currentGroup: { code: string, rows: typeof rundownRows.value } | null = null
    
    rundownRows.value.forEach(row => {
        if (!currentGroup || currentGroup.code !== row.eventCode) {
            currentGroup = { code: row.eventCode, rows: [] }
            groups.push(currentGroup)
        }
        currentGroup.rows.push(row)
    })
    return groups
})

const paginatedRundown = computed(() => {
    const pages = []
    const pageSize = rowsPerPage.value || 30
    const rows = rundownRows.value
    for (let i = 0; i < rows.length; i += pageSize) {
        pages.push(rows.slice(i, i + pageSize))
    }
    return pages
})

const generate = () => {
    store.generateRundown(selectedEventCode.value)
}

const clear = () => {
    if (confirm("Clear rundown?")) {
        store.clearRundown(selectedEventCode.value)
    }
}

const wipe = () => {
    if (confirm("Wipe ALL data? (Participants & Schedule)")) {
        store.wipeAllData()
    }
}

// Pre-calculate Heat Times to avoid O(N^2) in template
const heatTimeMap = computed(() => {
    const map = new Map<number, string>()
    if (rundownRows.value.length === 0) return map

    // 1. Build Heat -> Event Code Map
    const heatEventCode = new Map<number, string>()
    rundownRows.value.forEach(r => {
        if (r.heat !== undefined && !heatEventCode.has(r.heat)) heatEventCode.set(r.heat, r.eventCode)
    })

    // 2. Calculate times
    heatEventCode.forEach((code, heat) => {
        const sched = eventScheduleMap.value.get(code)
        if (sched) {
            const conf = store.getRundownConfig(code)
            const duration = conf.heatDuration ?? 2
            const heatDiff = heat - sched.startHeat
            const offset = heatDiff * duration
            map.set(heat, addMinutes(sched.startTime, offset))
        } else {
             map.set(heat, '-')
        }
    })
    return map
})

const calculateDisplayTime = (heat: number | undefined) => {
    if (heat === undefined) return '-'
    return heatTimeMap.value.get(heat) || '-'
}

const printRundown = () => {
    if (rundownRows.value.length === 0) {
        alert("Please Generate Rundown first.")
        return
    }

    const routeData = router.resolve({
        name: 'print-rundown',
        query: {
            event: selectedEventCode.value,
            rows: rowsPerPage.value,
            heatDuration: heatDuration.value,
            stationCount: stationCount.value,
            startTime: displayStartTime.value
        }
    })
    
    window.open(routeData.href, '_blank')
}

const exportCSV = () => {
    const scheduledParticipants = store.participants.filter((p: Participant) => p.heat !== undefined)
    if (scheduledParticipants.length === 0) {
        alert("No participants are scheduled yet. Please Generate Rundown first.")
        return
    }

    // 1. Group by Heat and Station (Teams/Pairs)
    const groupedMap = new Map<string, Participant[]>()
    scheduledParticipants.forEach((p: Participant) => {
        const key = `${p.heat}-${p.station}`
        if (!groupedMap.has(key)) groupedMap.set(key, [])
        groupedMap.get(key)!.push(p)
    })

    // 2. Convert to Row Objects
    const exportRowsData = Array.from(groupedMap.values()).map(pts => {
        const p0 = pts[0]
        if (!p0) return null 
        
        let timeStr = '-'
        if (p0.eventCode && p0.heat !== undefined) {
             const sched = eventScheduleMap.value.get(p0.eventCode)
             if (sched) {
                 // FIX: Use specific duration for export
                 const conf = store.getRundownConfig(p0.eventCode)
                 const duration = conf.heatDuration ?? 2

                 const heatDiff = p0.heat - sched.startHeat
                 const offset = heatDiff * duration
                 timeStr = addMinutes(sched.startTime, offset)
             }
        }

        return {
            entry_code: store.getParticipantEntryCode(p0),
            name: pts.map((p: Participant) => p.name).join('\n'),
            team: p0.team,
            division: p0.division,
            eventCode: p0.eventCode,
            heat: p0.heat,
            station: p0.station,
            time: timeStr,
            status: 'normal'
        }
    }).filter((r): r is NonNullable<typeof r> => r !== null)

    // 3. Sort by Event Order -> Entry Code
    const sorted = exportRowsData.sort((a, b) => {
        const norm = (s: string) => (s || '').trim()
        const codeA = norm(a.eventCode)
        const codeB = norm(b.eventCode)
        const evtIdxA = store.events.findIndex((e: any) => norm(e.code) === codeA)
        const evtIdxB = store.events.findIndex((e: any) => norm(e.code) === codeB)
        
        if (evtIdxA !== -1 && evtIdxB !== -1 && evtIdxA !== evtIdxB) return evtIdxA - evtIdxB
        if (a.entry_code !== b.entry_code) return a.entry_code.localeCompare(b.entry_code)
        return 0
    })

    const headers = ['entry_code', 'name', 'team', 'division', 'event', 'heat', 'time', 'station', 'status']
    const csvRows = sorted.map(r => {
        return [
            r.entry_code,
            r.name,
            r.team,
            r.division,
            r.eventCode,
            r.heat,
            r.time,
            r.station,
            r.status
        ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
    })

    const csvContent = [headers.join(','), ...csvRows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
    link.setAttribute('href', url)
    link.setAttribute('download', `Rundown_Export_${timestamp}.csv`)
    link.click()
}

// --- Pick & Swap Logic ---
const isSwapMode = ref(false)
const swapSourceId = ref<string | null>(null)

const toggleSwapMode = () => {
    isSwapMode.value = !isSwapMode.value
    swapSourceId.value = null
}

const handleRowClick = (p: typeof rundownRows.value[0]) => {
    if (!isSwapMode.value) return

    if (!swapSourceId.value) {
        if (p.isPlaceholder) return 
        swapSourceId.value = p.id
    } 
    else {
        if (swapSourceId.value === p.id) {
            swapSourceId.value = null
            return
        }

        if (p.isPlaceholder) {
            store.updateParticipant(swapSourceId.value, { 
                heat: p.heat,
                station: p.station,
                scheduleTime: p.scheduleTime
            })
        } else {
            store.swapParticipants(swapSourceId.value, p.id)
        }
        
        swapSourceId.value = null 
    }
}
</script>

<template>
  <div class="flex flex-col h-screen bg-gray-50 overflow-hidden print:block print:h-auto print:overflow-visible">
    <div class="flex-1 overflow-y-scroll p-6 print:overflow-visible print:h-auto print:p-0 print:block">
        <div class="w-full mx-auto print:max-w-none">
            <div class="flex items-center justify-between mb-6 print:hidden">
              <div class="flex items-center gap-4">
                  <router-link to="/dashboard" class="text-gray-500 hover:text-gray-700 font-medium text-sm">← Back to Dashboard</router-link>
                  <h1 class="text-2xl font-bold text-gray-800">Event Rundown</h1>
              </div>
              <div class="flex gap-2">
                 <button @click="exportCSV" class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 font-bold shadow-sm flex items-center gap-2" v-if="rundownRows.length > 0">
                    <span>📥 Export CSV</span>
                 </button>
                 <button @click="printRundown" class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 font-bold shadow-sm flex items-center gap-2" v-if="rundownRows.length > 0">
                    <span>Export to PDF / Print</span>
                 </button>
              </div>
            </div>

            <div class="bg-white p-4 rounded-lg shadow mb-6 border border-gray-200 print:hidden">
                <h2 class="text-lg font-semibold mb-4 text-gray-700">Configuration</h2>
                <div class="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                    <div class="min-w-0">
                        <label class="block text-sm font-medium text-gray-600 mb-1 whitespace-nowrap">Start Time</label>
                        <input v-model="displayStartTime" type="time" class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div class="min-w-0">
                        <label class="block text-sm font-medium text-gray-600 mb-1 whitespace-nowrap">Heat Duration (min)</label>
                        <input v-model="heatDuration" type="number" min="1" class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div class="min-w-0">
                        <label class="block text-sm font-medium text-gray-600 mb-1 whitespace-nowrap">Stations</label>
                        <input v-model="stationCount" type="number" min="1" class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div class="min-w-0">
                        <label class="block text-sm font-medium text-gray-600 mb-1 whitespace-nowrap">Layout</label>
                        <div class="w-full p-2 border rounded bg-gray-50 text-gray-500 text-sm flex items-center gap-1 h-[42px]">
                            <span>✨ Auto-Fit (40) - Bal</span>
                        </div>
                    </div>
                    <div class="min-w-0">
                        <label class="block text-sm font-medium text-gray-600 mb-1 whitespace-nowrap">Target Event</label>
                        <select v-model="selectedEventCode" class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none">
                            <option value="">-- All Events --</option>
                            <option v-for="evt in store.events" :key="evt.code" :value="evt.code">
                                {{ evt.code }} - {{ evt.name }}
                            </option>
                        </select>
                    </div>
                </div>
                


                <div class="mt-4 flex gap-3">
                    <button @click="generate" class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 font-medium shadow-sm transition-colors">
                        Generate Rundown
                    </button>
                    <button @click="clear" class="bg-gray-100 text-gray-700 px-6 py-2 rounded hover:bg-gray-200 font-medium transition-colors border">
                        Clear
                    </button>
                    <button @click="wipe" class="bg-red-100 text-red-700 px-6 py-2 rounded hover:bg-red-200 font-medium transition-colors border border-red-200">
                        Wipe
                    </button>
                    
                    <div class="border-l border-gray-300 mx-2"></div>

                    <button @click="toggleSwapMode" :class="isSwapMode ? 'bg-indigo-600 text-white shadow-inner' : 'bg-white text-gray-700 border-gray-300 border'" class="px-4 py-2 rounded font-medium transition-colors flex items-center gap-2 shadow-sm">
                        <span>{{ isSwapMode ? '⇄ Cancel Swap' : '⇄ Swap Mode' }}</span>
                    </button>

                    <button @click="store.undo()" :disabled="store.history.length === 0" class="flex items-center gap-2 px-4 py-2 rounded font-medium transition-colors border shadow-sm"
                        :class="store.history.length > 0 ? 'bg-white text-gray-700 hover:bg-gray-100 border-gray-300' : 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'">
                        <span>↶ Undo</span>
                    </button>
                </div>
            </div>

            <div v-if="rundownRows.length > 0">
                <div class="print:hidden">
                    <div v-for="group in screenEventGroups" :key="group.code" class="mb-8 last:mb-0">
                        <div class="mb-2 flex items-center gap-2">
                             <div class="bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded">{{ group.code }}</div>
                             <h3 class="text-lg font-bold text-gray-800">{{ store.events.find((e: any) => e.code === group.code)?.name || group.code }}</h3>
                        </div>

                        <div class="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                            <div class="overflow-x-auto">
                                <table class="min-w-full divide-y divide-gray-200 table-fixed">
                                    <thead class="bg-gray-50">
                                        <tr>
                                            <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b w-[5%]">Heat</th>
                                            <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b w-[8%]">Time</th>
                                            <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b w-[8%]">Station</th>
                                            <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b w-[10%]">Event</th>
                                            <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b w-[15%]">Division</th>
                                            <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b w-[34%]">Name</th>
                                            <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b w-[20%]">Team</th>
                                        </tr>
                                    </thead>
                                    <tbody class="bg-white divide-y divide-gray-200">
                                        <tr 
                                            v-for="p in group.rows" 
                                            :key="p.id" 
                                            @click="handleRowClick(p)"
                                            :class="[
                                                'transition-colors',
                                                p.isConflict ? 'bg-red-100 border-red-300 border-l-4' : '',
                                                isSwapMode ? 'cursor-pointer hover:bg-indigo-50' : 'hover:bg-blue-50',
                                                swapSourceId === p.id ? 'bg-indigo-100 ring-2 ring-indigo-500 ring-inset' : ''
                                            ]"
                                        >
                                            <td class="px-4 py-2 whitespace-nowrap text-sm font-bold text-gray-900 border-b align-top">{{ p.heat }}</td>
                                            <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-600 font-mono border-b align-top">
                                                {{ calculateDisplayTime(p.heat) }}
                                            </td>
                                            <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-600 font-medium border-b align-top">{{ p.station }}</td>
                                            <td class="px-4 py-2 whitespace-nowrap text-xs font-bold text-indigo-600 border-b align-top">{{ p.eventCode }}</td>
                                            <td class="px-4 py-2 whitespace-nowrap text-xs text-gray-500 border-b align-top">{{ p.division }}</td>
                                            <td class="px-4 py-2 text-sm font-medium text-gray-900 border-b whitespace-pre-line align-top">{{ p.name }}</td>
                                            <td class="px-4 py-2 whitespace-nowrap text-xs text-gray-500 border-b align-top">{{ p.team }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="hidden print:block">
                    <div v-for="(pageRows, pageIdx) in paginatedRundown" :key="pageIdx" class="print-page-break last:mb-0">
                        <div class="bg-white rounded-lg shadow-none border-none overflow-visible">
                            <div class="overflow-visible">
                                <table class="min-w-full divide-y divide-gray-200 table-fixed">
                                    <thead class="bg-white">
                                        <tr>
                                            <th class="px-4 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider border-b border-black w-[5%]">Heat</th>
                                            <th class="px-4 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider border-b border-black w-[8%]">Time</th>
                                            <th class="px-4 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider border-b border-black w-[8%]">Station</th>
                                            <th class="px-4 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider border-b border-black w-[10%]">Event</th>
                                            <th class="px-4 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider border-b border-black w-[15%]">Division</th>
                                            <th class="px-4 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider border-b border-black w-[34%]">Name</th>
                                            <th class="px-4 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider border-b border-black w-[20%]">Team</th>
                                        </tr>
                                    </thead>
                                    <tbody class="bg-white divide-y divide-gray-300">
                                        <tr 
                                            v-for="p in pageRows" 
                                            :key="p.id" 
                                            class="break-inside-avoid"
                                        >
                                            <td class="px-4 py-0.5 whitespace-nowrap text-[10px] font-bold text-gray-900 border-b border-gray-300 align-middle leading-tight">{{ p.heat }}</td>
                                            <td class="px-4 py-0.5 whitespace-nowrap text-[10px] text-gray-600 font-mono border-b border-gray-300 align-middle leading-tight">
                                                {{ calculateDisplayTime(p.heat) }}
                                            </td>
                                            <td class="px-4 py-0.5 whitespace-nowrap text-[10px] text-gray-600 font-medium border-b border-gray-300 align-middle leading-tight">{{ p.station }}</td>
                                            <td class="px-4 py-0.5 whitespace-nowrap text-[10px] font-bold text-black border-b border-gray-300 align-middle leading-tight">{{ p.eventCode }}</td>
                                            <td class="px-4 py-0.5 whitespace-nowrap text-[10px] text-black border-b border-gray-300 align-middle leading-tight">{{ p.division }}</td>
                                            <td class="px-4 py-0.5 text-[10px] font-medium text-gray-900 border-b border-gray-300 whitespace-pre-line align-top leading-tight">{{ p.name }}</td>
                                            <td class="px-4 py-0.5 whitespace-nowrap text-[10px] text-black border-b border-gray-300 align-middle leading-tight">{{ p.team }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
             </div>

            <div v-else class="bg-white rounded-lg shadow p-8 text-center text-gray-500 italic border border-gray-200">
                No rundown generated yet. Configure settings and click 'Generate Rundown'.
            </div>
        </div>
    </div>
  </div>
</template>

<style>
@media print {
  @page {
    size: landscape;
    margin: 5mm;
  }
  
  /* Ensure background colors are printed for readability */
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  
  .print-page-break {
    break-after: page;
    page-break-after: always;
  }
}
</style>