<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useNamelistStore } from '@/stores/namelist'
import type { Participant } from '@/config/defaults'

const store = useNamelistStore()

const selectedEventCode = ref<string>('') 

// Local state for inputs (initialized with default or current event config)
const currentConfig = computed(() => store.getRundownConfig(selectedEventCode.value))

const startTime = ref(currentConfig.value.startTime)
const heatDuration = ref(currentConfig.value.heatDuration)
const stationCount = ref(currentConfig.value.stationCount)
const rowsPerPage = ref(currentConfig.value.rowsPerPage) // Default to 30

// Watch for Event Selection Change -> Reload Config
watch(selectedEventCode, () => {
    const newConfig = store.getRundownConfig(selectedEventCode.value)
    // We update values directly. 
    // Note: This will trigger the "Auto-Save" watcher below, which is redundant but harmless 
    // (it just saves what we just loaded back to the store).
    startTime.value = newConfig.startTime
    heatDuration.value = newConfig.heatDuration
    stationCount.value = newConfig.stationCount
    rowsPerPage.value = newConfig.rowsPerPage
})

// Custom Auto-Save for Configuration Inputs
// When user types in Heat Duration, Station Count, or Rows Per Page, save it immediately.
watch([heatDuration, stationCount, rowsPerPage], () => {
    store.updateRundownConfig({
        startTime: currentConfig.value.startTime, // Use current config's start time (managed by displayStartTime) or we could use startTime.value? 
        // Better to use currentConfig.startTime to avoid overwriting with stale local `startTime` ref if `displayStartTime` logic is complex.
        // Actually best to pass ALL current values.
        heatDuration: Number(heatDuration.value),
        stationCount: Number(stationCount.value),
        rowsPerPage: Number(rowsPerPage.value)
    }, selectedEventCode.value || 'GLOBAL')
})

// Helper for time manipulation
const addMinutes = (timeStr: string, minutes: number): string => {
    const [h, m] = timeStr.split(':').map(Number)
    const date = new Date()
    date.setHours(h || 0, m || 0, 0, 0)
    date.setMinutes(date.getMinutes() + minutes)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// Event Schedule Map: Calculates the Start Time for EACH Event
// based on: 1. Custom Start Time (if set) OR 2. End Time of Previous Event
const eventScheduleMap = computed(() => {
    // 1. Get ALL scheduled participants (ignore filter)
    const allParts = store.participants.filter((p: any) => p.heat !== undefined)
    if (allParts.length === 0) return new Map<string, { startTime: string, startHeat: number }>()

    // 2. Identify Heats and Events
    // Map<Heat, EventCode>
    const heatEventMap = new Map<number, string>()
    allParts.forEach((p: any) => {
        // Assume all participants in a heat belong to same event (enforced by generator)
        // If conflict, take first
        if (!heatEventMap.has(p.heat!)) heatEventMap.set(p.heat!, p.eventCode)
    })

    const sortedHeats = Array.from(heatEventMap.keys()).sort((a, b) => a - b)
    
    // 3. Group Heats by Event Order
    // We need to know the "First Heat" for each Event appearing in the timeline
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

    // 4. Calculate Times Chain
    const schedule = new Map<string, { startTime: string, startHeat: number }>()
    let currentTime = store.getRundownConfig('GLOBAL').startTime // Global Start used for first event default

    const duration = Number(heatDuration.value) || 2

    eventOrder.forEach(code => {
        // Check for Custom Override
        const customStart = store.getEventStartTime(code)
        
        // Determine Start Time for this Event
        let thisStart = currentTime
        if (customStart) {
            thisStart = customStart
        }
        
        const firstHeat = eventFirstHeat.get(code)!
        const lastHeat = eventLastHeat.get(code)!
        const heatCount = lastHeat - firstHeat + 1

        schedule.set(code, { startTime: thisStart, startHeat: firstHeat })

        // Update currentTime for NEXT event = ThisStart + Duration
        // Duration = Heats * Mins
        const timeAdded = heatCount * duration
        currentTime = addMinutes(thisStart, timeAdded)
    })

    return schedule
})

const displayStartTime = computed({
    get: () => {
        // Case 1: Specific Event Selected
        if (selectedEventCode.value) {
           const sched = eventScheduleMap.value.get(selectedEventCode.value)
           // Case 1b: Event NOT scheduled yet.
           // Auto-set to the END of the current last scheduled event
           // Find the last event in the schedule map
           const schedules = Array.from(eventScheduleMap.value.values())
           if (schedules.length > 0) {
                // Find Max Heat and its Event Code globally (ignoring current filter)
                let maxHeat = 0
                let maxHeatEventCode = ''
                
                store.participants.forEach((p: any) => {
                    if (p.heat && p.heat > maxHeat) {
                        maxHeat = p.heat
                        maxHeatEventCode = p.eventCode
                    }
                })

                if (maxHeat > 0 && maxHeatEventCode) {
                     // Get schedule for that last event
                     const lastSched = eventScheduleMap.value.get(maxHeatEventCode)
                     if (lastSched) {
                         // Calculate time of Last Heat DIRECTLY (avoiding calculateDisplayTime which uses filtered view)
                         // Formula: EventStart + ((Heat - EventStartHeat) * Duration)
                         const heatDiff = maxHeat - lastSched.startHeat
                         const offset = heatDiff * Number(heatDuration.value)
                         const lastHeatTime = addMinutes(lastSched.startTime, offset)
                         
                         // Return Last Heat Time + Duration (Next available slot)
                         return addMinutes(lastHeatTime, Number(heatDuration.value))
                     }
                }
           }
        }

        // Case 2: No Filter, or No previous events -> Show Global Config (or Event Config start)
        return currentConfig.value.startTime
    },
    set: (val: string) => {
        if (selectedEventCode.value) {
            // Set Custom Start Time for THIS Event
            // This breaks the chain and anchors this event to 'val'
            store.setEventStartTime(selectedEventCode.value, val)
        } else {
            // Update Global Start
            store.updateRundownConfig({ 
                startTime: val, 
                heatDuration: Number(heatDuration.value),
                stationCount: Number(stationCount.value),
                rowsPerPage: Number(rowsPerPage.value)
            }, 'GLOBAL')
        }
    }
})

// Replace participantsWithSchedule with rundownRows logic
const rundownRows = computed(() => {
    // 1. Get scheduled participants
    let parts = store.participants.filter((p: any) => p.heat !== undefined)
    
    // Filter by selected event if set
    if (selectedEventCode.value) {
        parts = parts.filter((p: any) => p.eventCode === selectedEventCode.value)
    }

    if (parts.length === 0) return []

    // 2. Group by Heat
    const heatMap = new Map<number, typeof parts>()
    let maxHeat = 0
    
    parts.forEach((p: any) => {
        const h = p.heat!
        if (h > maxHeat) maxHeat = h
        if (!heatMap.has(h)) heatMap.set(h, [])
        heatMap.get(h)!.push(p)
    })

    // 3. Build Full Rows
    const rows: Array<{
        id: string
        heat: number
        scheduleTime: string
        station: number
        eventCode: string
        division: string
        name: string
        team: string
        isPlaceholder?: boolean
        isConflict?: boolean
    }> = []

    // Sort heats to ensure order
    const sortedHeats = Array.from(heatMap.keys()).sort((a, b) => a - b)

    sortedHeats.forEach(h => {
        const participantsInHeat = heatMap.get(h)!
        // Dynamic Station Count: Use the config of the event in this heat
        // (Assuming a heat only contains one event type, or we pick the first one's config)
        const heatEventCode = participantsInHeat[0]?.eventCode
        // If "All Events" mode or specific event, get config for THIS event
        // But if user is editing a Single Target Event, they expect the UI input to override?
        // Actually, logic is: UI Inputs -> Update Store -> Generate -> Display from Store data
        // So for "All Events" view, rely on Store Config.
        // For "Single Event" view, rely on Store Config (which matches UI if recent).
        let currentStCount = Number(stationCount.value) || 12
        
        if (!selectedEventCode.value && heatEventCode) {
             // In "All Events" mode, we MUST look up the config for the specific event
             const conf = store.getRundownConfig(heatEventCode)
             currentStCount = conf.stationCount ?? 12
        } else {
             // In Single Event mode, use the reactive input (or the store config for that event)
             // Using reactive input `stationCount` is safer for "live preview" before generation?
             // But user complained about "All Events" view.
             // Let's stick to: If All Events, use dynamic. If Single, use input (which is synced).
        }

        for (let s = 1; s <= currentStCount; s++) {
            // Find ALL participants at this station (handling conflict)
            const pts = participantsInHeat.filter((x: any) => x.station === s)
            
            if (pts.length > 0) {
                // Aggregate Multiple Participants (Team Group) into ONE Row
                const p0 = pts[0]
                if (p0) {
                    const combinedNames = pts.map((p: any) => p.name).join('\n')
                    
                    rows.push({
                        id: p0.id, // Use ID of first person as row Key
                        heat: p0.heat!,
                        scheduleTime: p0.scheduleTime!,
                        station: p0.station!,
                        eventCode: p0.eventCode,
                        division: p0.division,
                        name: combinedNames, // Multi-line name
                        team: p0.team || '',
                        isPlaceholder: false,
                        isConflict: pts.length > 1 && new Set(pts.map(p => p.team)).size > 1, // Only mark conflict if teams differ? Or just keep it false if it's a valid group?
                        // Let's assume if they are scheduled together, it's valid, unless teams differ significantly.
                    })
                }
            } else {
                // Placeholder
                rows.push({
                    id: `placeholder-${h}-${s}`,
                    heat: h,
                    scheduleTime: '', // Calculated dynamically
                    station: s,
                    eventCode: heatEventCode || '-',
                    division: '-',
                    name: '-',
                    team: '-',
                    isPlaceholder: true,
                    isConflict: false
                })
            }
        }
    })

    return rows
})

// Group by Event for Screen View
const screenEventGroups = computed(() => {
    const groups: { code: string, rows: typeof rundownRows.value }[] = []
    
    if (rundownRows.value.length === 0) return []

    let currentGroup: { code: string, rows: typeof rundownRows.value } | null = null

    rundownRows.value.forEach(row => {
        const rowCode = row.eventCode.trim()
        // If placeholder, treat as part of current group (or 'Unassigned' if first)
        const isPlaceholder = row.isPlaceholder || rowCode === '-'

        if (!currentGroup) {
            // First item starts the first group
            currentGroup = {
                code: isPlaceholder ? 'Unassigned' : rowCode,
                rows: [row]
            }
            groups.push(currentGroup)
        } else {
            // Logic: 
            // 1. If it's a placeholder, ALWAYS append to current group (don't break formatting)
            // 2. If it's the SAME code, append
            // 3. If it's a NEW code (and not placeholder), start new group
            // [Updated to ensure placeholders stick to previous event]
            
            if (isPlaceholder) {
                currentGroup.rows.push(row)
            } else if (rowCode === currentGroup.code) {
                currentGroup.rows.push(row)
            } else {
                // New Event Group
                currentGroup = {
                    code: rowCode,
                    rows: [row]
                }
                groups.push(currentGroup)
            }
        }
    })
    
    return groups
})

// Pagination Logic
// const rowsPerPage = ref(30) // Default to 30 (User Request)
const preventHeatSplit = ref(false) // Toggle: If true, keeps heats together (old behavior)

const paginatedRundown = computed(() => {
    if (rundownRows.value.length === 0) return []

    const pages: typeof rundownRows.value[] = []
    let currentPage: typeof rundownRows.value = []
    
    // We iterate strictly by rows or by heats depending on preference
    // If we want "Strict Rows" (User Request), we iterate rows
    // But we MUST respect Event Changes (force break)

    // Filter out placeholders for PRINT view to save space
    // [Previously filtered out, now User wants it to match Screen View]
    const activeRows = rundownRows.value.filter(r => !r.isPlaceholder)
    
    // LINEAR PAGINATION (Chronological)
    // We iterate activeRows directly, which are already sorted by Schedule (Heat order)
    // We fill pages until rowsPerPage is reached.
    
    // Helper to normalize event codes for grouping (removes spaces, generic chars)
    const normalize = (code: string | undefined) => (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

    let rowIdx = 0
    while (rowIdx < activeRows.length) {
        if (currentPage.length === 0) {
            // Start new page
        }

        // SMART PAGINATION CONSTANT
        // Max density 40 lines (Comfortable Readability).
        const SAFE_LINES_PER_PAGE = 40 

        const remainingSpace = SAFE_LINES_PER_PAGE - currentPage.reduce((sum, r) => sum + Math.max(1, (r.name || '').split('\n').length), 0)
        
        // Safety check (fallback)
        if (remainingSpace <= 0) {
             // Let it flow, cost check handles it
        }

        // Check for Event Change
        const currentRow = activeRows[rowIdx]
        if (!currentRow) break

        const currentEvent = normalize(currentRow.eventCode)
        
        // If we have content on the page, and the event changes, force a page break
        if (currentPage.length > 0) {
             const prevRow = currentPage[currentPage.length - 1]
             const prevEvent = normalize(prevRow?.eventCode)
             
             if (prevRow && prevEvent !== currentEvent) {
                  pages.push(currentPage)
                  currentPage = []
                  // Loop continues with empty page to start new event
                  continue 
             }
        }

        if (!preventHeatSplit.value) {
            // Find how many rows we can take for THIS event
            let eventEndIdx = rowIdx
            while(eventEndIdx < activeRows.length) {
                const nextEvent = normalize(activeRows[eventEndIdx]?.eventCode)
                if (nextEvent !== currentEvent) break
                eventEndIdx++
            }
            
            // The chunk of rows for this event
            const eventRows = activeRows.slice(rowIdx, eventEndIdx)
            
            // Calculate how many rows fit based on HEIGHT COST
            // rowsPerPage is treated as "Lines Per Page" (approx 30 lines)
            // Each row cost = max(1, name.split('\n').length)
            
            let accumulatedCost = 0
            let rowsToTake = 0
            
            // Calculate current usage of the page
            const currentPageCost = currentPage.reduce((sum, r) => sum + Math.max(1, (r.name || '').split('\n').length), 0)
            const remainingLines = SAFE_LINES_PER_PAGE - currentPageCost
            
            if (remainingLines <= 0) {
                 // Page is full by height
                pages.push(currentPage)
                currentPage = []
                continue
            }

            for (const row of eventRows) {
                 const cost = Math.max(1, (row.name || '').split('\n').length)
                 if (accumulatedCost + cost <= remainingLines) {
                      accumulatedCost += cost
                      rowsToTake++
                 } else {
                      break // Cannot fit more
                 }
            }

            // If we can't fit even one row (and page is empty), force it (to avoid infinite loop)
            // But if page has content, we just break (next loop pushes page)
            if (rowsToTake === 0 && currentPage.length > 0) {
                 pages.push(currentPage)
                 currentPage = []
                 continue
            } else if (rowsToTake === 0 && currentPage.length === 0) {
                 // Single row is huge -> bigger than page limit? Must take it anyway.
                 rowsToTake = 1
            }
            
            const chunk = activeRows.slice(rowIdx, rowIdx + rowsToTake)
            currentPage.push(...chunk)
            rowIdx += chunk.length
            
            // Check if page needs to be pushed (based on cost)
            const newTotalCost = currentPage.reduce((sum, r) => sum + Math.max(1, (r.name || '').split('\n').length), 0)

            if (newTotalCost >= SAFE_LINES_PER_PAGE) {
                pages.push(currentPage)
                currentPage = []
            }
        } else {
            // Keep Heats Together Logic
            const currentRow = activeRows[rowIdx]
            if (!currentRow) break

            const currentHeat = currentRow.heat
            
            // Find all remaining rows for this heat
            let heatEndIdx = rowIdx
            // Use optional chaining for safer access
            while(heatEndIdx < activeRows.length && activeRows[heatEndIdx]?.heat === currentHeat) {
                heatEndIdx++
            }
            const heatRows = activeRows.slice(rowIdx, heatEndIdx)
            
            if (heatRows.length <= remainingSpace) {
                // Fits! Add all
                currentPage.push(...heatRows)
                rowIdx += heatRows.length
            } else {
                // Doesn't fit. 
                if (currentPage.length > 0) {
                     // Page has content, so FLUSH page to start fresh
                    pages.push(currentPage)
                    currentPage = []
                    // Continue loop to retry on fresh page
                } else {
                    // Page is empty but Heat is HUGE. Must split.
                    const chunk = heatRows.slice(0, rowsPerPage.value)
                    currentPage.push(...chunk)
                    rowIdx += chunk.length
                    
                    // Push page
                    pages.push(currentPage)
                    currentPage = []
                }
            }
        }
    }

    // Push final
    if (currentPage.length > 0) {
        pages.push(currentPage)
    }

    return pages
})

const generate = () => {
    // If Specific Event Selected: Update its config from inputs first
    if (selectedEventCode.value) {
        store.updateRundownConfig({
            startTime: startTime.value, 
            heatDuration: Number(heatDuration.value),
            stationCount: Number(stationCount.value),
            rowsPerPage: Number(rowsPerPage.value)
        }, selectedEventCode.value)
    } else {
        // "ALL EVENTS" MODE:
        // Do NOT update config. Rely on per-event saved settings.
        // User requested: "ignore, cos the user has oredi setup the setting for each target event."
    }
    
    // Generate (pass empty string for All Events)
    store.generateRundown(selectedEventCode.value)
}

const clear = () => {
    if (confirm("Clear Rundown for " + (selectedEventCode.value || "All Events") + "?")) {
        store.clearRundown(selectedEventCode.value || undefined)
    }
}

const wipe = () => {
    // "Delete all event entry reset" -> Force Clear ALL
    if (confirm("⚠️ WIPE ALL? This will delete the entire rundown schedule for ALL events.")) {
        store.clearRundown() // No args = Global Clear
    }
}

const calculateDisplayTime = (heat: number) => {
    if (!heatDuration.value) return '-'
    
    // Find which event this heat belongs to
    // We can find any participant in this heat to get the event code
    // Since rundownRows only contains visible rows, we might miss it if we used that.
    // Better to use the Map logic or a helper.
    // But efficiently: We are likely rendering rows, so we have 'p.eventCode' available in the template!
    // -> Optimization: Pass eventCode to this function? 
    // -> Current signature is (heat: number). 
    // -> Let's look up event code from rundownRows (since we only display visible ones)
    
    const row = rundownRows.value.find(r => r.heat === heat)
    if (!row) return '-'
    const code = row.eventCode

    const sched = eventScheduleMap.value.get(code)
    if (!sched) return '-'

    // Calculate offset from Event Start
    const heatDiff = heat - sched.startHeat
    const offset = heatDiff * Number(heatDuration.value)
    
    return addMinutes(sched.startTime, offset)
}

const printRundown = () => {
    if (rundownRows.value.length === 0) {
        alert("Please Generate Rundown first.")
        return
    }
    window.print()
}

const exportCSV = () => {
    const scheduledParticipants = store.participants.filter((p: any) => p.heat !== undefined)
    if (scheduledParticipants.length === 0) {
        alert("No participants are scheduled yet. Please Generate Rundown first.")
        return
    }

    // 1. Group by Heat and Station (Teams/Pairs)
    const groupedMap = new Map<string, Participant[]>()
    scheduledParticipants.forEach(p => {
        const key = `${p.heat}-${p.station}`
        if (!groupedMap.has(key)) groupedMap.set(key, [])
        groupedMap.get(key)!.push(p)
    })

    // 2. Convert to Row Objects
    const exportRowsData = Array.from(groupedMap.values()).map(pts => {
        const p0 = pts[0]
        if (!p0) return null // Safety check
        
        return {
            entry_code: store.getParticipantEntryCode(p0),
            name: pts.map(p => p.name).join('\n'),
            team: p0.team,
            division: p0.division,
            eventCode: p0.eventCode,
            heat: p0.heat,
            station: p0.station,
            status: 'normal'
        }
    }).filter((r): r is NonNullable<typeof r> => r !== null)

    // 3. Sort by Event Order -> Entry Code
    const sorted = exportRowsData.sort((a, b) => {
        const norm = (s: string) => (s || '').trim()
        const codeA = norm(a.eventCode)
        const codeB = norm(b.eventCode)
        const evtIdxA = store.events.findIndex(e => norm(e.code) === codeA)
        const evtIdxB = store.events.findIndex(e => norm(e.code) === codeB)
        
        if (evtIdxA !== -1 && evtIdxB !== -1 && evtIdxA !== evtIdxB) return evtIdxA - evtIdxB
        if (a.entry_code !== b.entry_code) return a.entry_code.localeCompare(b.entry_code)
        return 0
    })

    const headers = ['entry_code', 'name', 'team', 'division', 'event', 'heat', 'station', 'status']
    const csvRows = sorted.map(r => {
        return [
            r.entry_code,
            r.name,
            r.team,
            r.division,
            r.eventCode,
            r.heat,
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
    // 1. If not in swap mode, do nothing
    if (!isSwapMode.value) return

    // 2. If Selecting Source:
    if (!swapSourceId.value) {
        // Cannot select a placeholder as source (nobody there to move)
        if (p.isPlaceholder) return 
        swapSourceId.value = p.id
    } 
    // 3. If Selecting Target:
    else {
        // If clicking same person, cancel/reset?
        if (swapSourceId.value === p.id) {
            swapSourceId.value = null
            return
        }

        if (p.isPlaceholder) {
            // MOVEMENT: Move Source to Empty Slot
            // Update Source's Heat, Station, Time to match the Placeholder
            store.updateParticipant(swapSourceId.value, { 
                heat: p.heat,
                station: p.station,
                scheduleTime: p.scheduleTime
            })
        } else {
            // SWAP: Trade places with another participant
            store.swapParticipants(swapSourceId.value, p.id)
        }
        
        // Reset selection
        swapSourceId.value = null 
    }
}
</script>

<template>
  <div class="flex flex-col h-screen bg-gray-50 overflow-hidden print:block print:h-auto print:overflow-visible">
    <!-- Main Content Area -->
    <div class="flex-1 overflow-y-scroll p-6 print:overflow-visible print:h-auto print:p-0 print:block">
        <div class="w-full mx-auto print:max-w-none">
            <div class="flex items-center justify-between mb-6 print:hidden">
              <div class="flex items-center gap-4">
                  <router-link to="/" class="text-gray-500 hover:text-gray-700 font-medium text-sm">← Back to Dashboard</router-link>
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

            <!-- Configuration Panel (Hidden in Print) -->
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

            <!-- Rundown Table(s) -->
            <!-- Render a separarate table for each page to force breaks -->
             <div v-if="rundownRows.length > 0">
                <!-- SCREEN VIEW: Grouped by Event (Separate Containers) -->
                 <div class="print:hidden">
                    <div v-for="group in screenEventGroups" :key="group.code" class="mb-8 last:mb-0">
                        <!-- Event Header -->
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

                <!-- PRINT VIEW: Paginated (Hidden on Screen) -->
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
