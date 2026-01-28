import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { DEFAULT_DIVISIONS, DEFAULT_EVENTS } from '@/config/defaults'
import type { Participant, EventConfig, DivisionConfig } from '@/config/defaults'

export const useNamelistStore = defineStore('namelist', () => {
    // --- State ---
    const events = ref<EventConfig[]>([...DEFAULT_EVENTS])
    const divisions = ref<DivisionConfig[]>([...DEFAULT_DIVISIONS])
    const participants = ref<Participant[]>([])

    // Entry Codes mapping: `${eventCode}|${divisionName}` -> 'EntryCodeString'
    // Example: 'SRSS|7-11 Female' -> 'A01'
    const entryCodes = ref<Record<string, string>>({})

    // Event specific start times: 'EventCode' -> 'HH:MM'
    const eventStartTimes = ref<Record<string, string>>({})

    // Undo History
    const history = ref<Array<{ description: string, undo: () => void }>>([])

    function pushHistory(description: string, undoAction: () => void) {
        // Enforce Single-Step Undo (No Stacking) as per user request
        history.value = [{ description, undo: undoAction }]
    }

    function undo() {
        const action = history.value.pop()
        if (action) {
            action.undo()
        }
    }

    // --- Actions ---

    function addParticipant(p: Participant) {
        participants.value.push(p)
    }

    function clearParticipants() {
        participants.value = []
    }

    function wipeAllData() {
        participants.value = []
        // entryCodes.value = {} // Keep codes as per user request
    }

    function upsertParticipants(list: Participant[]) {
        // 1. Identify IDs being updated/inserted
        const incomingIds = new Set(list.map(p => p.id))

        // 2. Remove them from current list (to clear old positions)
        participants.value = participants.value.filter(p => !incomingIds.has(p.id))

        // 3. Append the new batch (preserving the batch order)
        participants.value.push(...list)
    }

    function setEntryCode(eventCode: string, divisionName: string, code: string) {
        const key = `${eventCode}|${divisionName}`
        entryCodes.value[key] = code
    }

    function getEntryCode(eventCode: string, divisionName: string) {
        return entryCodes.value[`${eventCode}|${divisionName}`] || ''
    }

    function setEventStartTime(eventCode: string, time: string) {
        eventStartTimes.value[eventCode] = time
    }

    function getEventStartTime(eventCode: string) {
        return eventStartTimes.value[eventCode]
    }

    // --- Getters ---

    const getParticipantsByEvent = computed(() => {
        return (eventCode: string, divisionName: string) => {
            return participants.value.filter(p => p.eventCode === eventCode && p.division === divisionName)
        }
    })

    // Grouped View: Event -> Division -> Participants
    const hierarchy = computed(() => {
        return events.value.map(evt => {
            const filteredDivs = divisions.value.filter(div => {
                if (!evt.allowedDivisions || evt.allowedDivisions.length === 0) return true
                return evt.allowedDivisions.includes(div.name)
            })

            const divs = filteredDivs.map(div => {
                const parts = participants.value.filter(p => p.eventCode === evt.code && p.division === div.name)
                // Use the per-event prefix (entryCode)
                const code = getEntryCode(evt.code, div.name)

                // Count unique entries: unique groups + individuals with no group
                const processedGroups = new Set<string>()
                let uniqueEntryCount = 0
                parts.forEach(p => {
                    if (p.groupId) {
                        if (!processedGroups.has(p.groupId)) {
                            processedGroups.add(p.groupId)
                            uniqueEntryCount++
                        }
                    } else {
                        uniqueEntryCount++
                    }
                })

                return {
                    division: div.name,
                    entryCode: code,
                    count: uniqueEntryCount,
                    participants: parts
                }
            })
            return {
                event: evt,
                divisions: divs
            }
        })
    })

    // Team View: Team Name -> Participants
    const teams = computed(() => {
        const teamNamesInOrder: string[] = []
        const groups: Record<string, Participant[]> = {}

        participants.value.forEach(p => {
            const t = p.team || 'INDEPENDENT'
            if (!groups[t]) {
                groups[t] = []
                teamNamesInOrder.push(t)
            }
            groups[t].push(p)
        })

        return teamNamesInOrder.map(teamName => {
            const parts = groups[teamName] || []
            // First Come First Served: Do not sort participants, keep original order

            // Count unique participants (by name)
            // Fix: Split by newlines to handle multi-name entries (e.g. Teams of 4)
            const uniqueNames = new Set<string>()
            parts.forEach(p => {
                // Split by newline or comma (just in case they used commas)
                // Also remove & or 'and' if necessary? Let's stick to standard delimiters.
                const names = p.name.split(/[\r\n,]+/)
                names.forEach(n => {
                    const cleanName = n.trim()
                    if (cleanName && cleanName.length > 1) { // Avoid counting tiny garbage
                        uniqueNames.add(cleanName)
                    }
                })
            })

            return {
                name: teamName,
                participants: parts,
                count: uniqueNames.size
            }
        })
    })

    function deleteTeam(teamName: string) {
        participants.value = participants.value.filter(p => (p.team || 'INDEPENDENT') !== teamName)
    }

    function sanitizeData() {
        const validDivisionNames = new Set(divisions.value.map(d => d.name))

        // 1. Clean up event.allowedDivisions
        events.value.forEach(evt => {
            if (evt.allowedDivisions && evt.allowedDivisions.length > 0) {
                evt.allowedDivisions = evt.allowedDivisions.filter(name => validDivisionNames.has(name))
            }
        })

        // 2. Clean up participants
        participants.value.forEach(p => {
            if (p.division && !validDivisionNames.has(p.division)) {
                p.division = '' // Clear if invalid
            }
        })

        // 3. Clean up entryCodes (optional but good for consistency)
        Object.keys(entryCodes.value).forEach(key => {
            const parts = key.split('|')
            const divPart = parts[1]
            if (parts.length === 2 && divPart && !validDivisionNames.has(divPart)) {
                delete entryCodes.value[key]
            }
        })
    }

    function deleteDivision(divisionName: string) {
        // 1. Remove from divisions list
        divisions.value = divisions.value.filter(d => d.name !== divisionName)

        sanitizeData()
    }

    function renameDivision(oldName: string, newName: string) {
        if (!newName || oldName === newName) return

        // 1. Update divisions list
        const div = divisions.value.find(d => d.name === oldName)
        if (div) div.name = newName

        // Update participants first so they remain valid during sanitization
        participants.value.forEach(p => {
            if (p.division === oldName) {
                p.division = newName
            }
        })

        // Update entryCodes
        Object.keys(entryCodes.value).forEach(key => {
            if (key.endsWith(`|${oldName}`)) {
                const parts = key.split('|')
                const eventPart = parts[0]
                const divPart = parts[1]
                if (parts.length === 2 && eventPart && divPart === oldName) {
                    const newKey = `${eventPart}|${newName}`
                    const val = entryCodes.value[key]
                    if (val !== undefined) {
                        entryCodes.value[newKey] = val
                        delete entryCodes.value[key]
                    }
                }
            }
        })

        sanitizeData()
    }

    // --- Rundown Logic ---
    // --- Rundown Logic ---
    const defaultRundownConfig = {
        startTime: '09:00',
        heatDuration: 2, // minutes
        stationCount: 12,
        rowsPerPage: 30
    }

    // Per-Event Config: 'EventCode' -> Config
    // If key is 'GLOBAL', it acts as the default fallback
    const eventRundownConfigs = ref<Record<string, typeof defaultRundownConfig>>({
        'GLOBAL': { ...defaultRundownConfig }
    })

    function getRundownConfig(eventCode?: string | null) {
        if (eventCode) {
            const key = eventCode.trim()
            if (eventRundownConfigs.value[key]) {
                return eventRundownConfigs.value[key]
            }
        }
        return eventRundownConfigs.value['GLOBAL'] || defaultRundownConfig
    }

    function updateRundownConfig(config: typeof defaultRundownConfig, eventCode?: string | null) {
        const key = eventCode ? eventCode.trim() : 'GLOBAL'
        eventRundownConfigs.value[key] = { ...config }
    }

    function clearRundown(eventCode?: string) {
        if (eventCode) {
            participants.value.forEach(p => {
                if (p.eventCode === eventCode) {
                    p.heat = undefined
                    p.station = undefined
                    p.scheduleTime = undefined
                }
            })
        } else {
            participants.value.forEach(p => {
                p.heat = undefined
                p.station = undefined
                p.scheduleTime = undefined
            })
        }
    }

    function generateRundown(targetEventCode?: string) {
        // 1. Identify which participants to schedule
        // If targetEventCode is set, only schedule for that Event.
        // Otherwise schedule for ALL (in order).
        // Note: For now, if we schedule for one event, we should probably find the "max heat" of previous events if we want continuous,
        // but the user requirement seems to imply filtering by event view. 
        // For simplicity and matching the "Event/Division" sorting rule, we will re-generate for the target scope.

        let partsToSchedule: Participant[] = []

        if (targetEventCode) {
            // Clear existing for this event
            clearRundown(targetEventCode)
            partsToSchedule = participants.value.filter(p => p.eventCode === targetEventCode)
        } else {
            clearRundown() // Clear all
            partsToSchedule = [...participants.value]
        }

        if (partsToSchedule.length === 0) return

        // 2. Sort Participants
        // Order: Event Index -> Division Index -> Team -> Name

        // Helper to normalize strings for comparison
        const norm = (s: string) => (s || '').trim()

        partsToSchedule.sort((a, b) => {
            const codeA = norm(a.eventCode)
            const codeB = norm(b.eventCode)

            // 1. Event Sort
            const evtIdxA = events.value.findIndex(e => norm(e.code) === codeA)
            const evtIdxB = events.value.findIndex(e => norm(e.code) === codeB)

            // If finding valid index, prioritized. 
            // If both configured: sort by index
            if (evtIdxA !== -1 && evtIdxB !== -1) {
                if (evtIdxA !== evtIdxB) return evtIdxA - evtIdxB
            }
            // If A configured and B not -> A first
            else if (evtIdxA !== -1 && evtIdxB === -1) {
                return -1
            }
            // If A not configured and B configured -> B first
            else if (evtIdxA === -1 && evtIdxB !== -1) {
                return 1
            }
            // If both not configured: Sort alphabetically by Code
            else if (evtIdxA === -1 && evtIdxB === -1) {
                if (codeA !== codeB) return codeA.localeCompare(codeB)
            }

            // 2. Entry Code Sort (A001, A002, B001...)
            // This handles Division order (by prefix) and Participant order (by index)
            const entryA = getParticipantEntryCode(a)
            const entryB = getParticipantEntryCode(b)

            if (entryA !== entryB) {
                if (entryA !== '-' && entryB !== '-') {
                    return entryA.localeCompare(entryB)
                }
                if (entryA === '-') return 1
                if (entryB === '-') return -1
            }

            // 3. Import Order Preservation (Fallback)
            // Array.sort is stable so returning 0 preserves the original store order
            return 0
        })

        // 3. Assign Heats and Stations
        // Group by groupId
        const entries: Array<{ id: string, type: 'group' | 'single', participants: Participant[] }> = []
        const processedGroups = new Set<string>()

        partsToSchedule.forEach(p => {
            if (p.groupId) {
                if (!processedGroups.has(p.groupId)) {
                    processedGroups.add(p.groupId)
                    const groupParts = partsToSchedule.filter(gp => gp.groupId === p.groupId)
                    entries.push({ id: p.groupId, type: 'group', participants: groupParts })
                }
            } else {
                entries.push({ id: p.id, type: 'single', participants: [p] })
            }
        })

        // Now schedule entries
        let currentHeat = 1

        // If generating for a specific event, try to continue from the last used heat of OTHER events
        if (targetEventCode) {
            const otherParts = participants.value.filter(p => p.eventCode !== targetEventCode && p.heat !== undefined)
            if (otherParts.length > 0) {
                const maxHeat = Math.max(...otherParts.map(p => p.heat || 0))
                currentHeat = maxHeat + 1
            }
        }

        // Initialize State for Cumulative Scheduling
        let currentStation = 1
        let lastEventCode = ''

        // Initial Config Resolution
        // If targetEventCode is set, use its config. 
        // If ALL, use the config of the FIRST event in the list (if exists), else Global.
        const firstEventCode = entries[0]?.participants[0]?.eventCode
        const initialConfig = getRundownConfig(targetEventCode || firstEventCode || 'GLOBAL')

        // Setup initial time
        // If continuing from previous rundown (targetEventCode set and other parts exist)
        // currentHeat is already advanced above. We need start time for THAT heat.
        // But getHeatTime was stateless before.
        // Simple strategy:
        // 1. If startHeat > 1, we need to know when the previous heat ended? 
        //    Or just assume we start at the 'Config Start Time' + offset?
        //    For "All Events" refresh, we start at Config Start Time.
        //    For "Target Event" append, we start after the last heat.

        let currentHeatStartTime = initialConfig.startTime || '09:00'

        // Helper to add minutes
        const addMinutes = (timeStr: string, minutes: number): string => {
            const parts = timeStr.split(':')
            const h = Number(parts[0]) || 0
            const m = Number(parts[1]) || 0
            const date = new Date()
            date.setHours(h, m, 0, 0)
            date.setMinutes(date.getMinutes() + minutes)
            const newH = String(date.getHours()).padStart(2, '0')
            const newM = String(date.getMinutes()).padStart(2, '0')
            return `${newH}:${newM}`
        }

        // Handle Append Mode (Target Event)
        if (targetEventCode && currentHeat > 1) {
            // We need to calculate where we are starting.
            // Best guess: Find the max time of existing participants?
            // Or just use the target event's start time if provided?
            // The old logic was: maxHeat + 1. 
            // We need a time for heat N.
            // Let's look for the module that calculated this before...
            // It used `getHeatTime(currentHeat)`.
            // We can stick to that IF we assume constant duration for previous events.
            // BUT if we want true dynamic duration, we'd have to replay everything.
            // COMPROMISE: If appending, just grab the latest time from the store or use current Config relative to Heat 1?
            // Let's use the startTime from the PREVIOUS heat if available.
            const allWithTime = participants.value.filter(p => p.scheduleTime).sort((a, b) => (a.heat || 0) - (b.heat || 0))
            if (allWithTime.length > 0) {
                const lastP = allWithTime[allWithTime.length - 1]
                if (lastP) {
                    // End of last heat = Start of Last Heat + Duration of Last Heat's Event
                    const lastEventConf = getRundownConfig(lastP.eventCode)
                    const lastDur = lastEventConf.heatDuration ?? 2
                    currentHeatStartTime = addMinutes(lastP.scheduleTime!, lastDur)
                }
            }
        }

        // ITERATION
        entries.forEach(entry => {
            if (!entry.participants[0]) return
            const entryEvent = norm(entry.participants[0].eventCode)

            // Dynamic Config for THIS entry
            const entryConfig = getRundownConfig(entryEvent)
            const maxStations = entryConfig.stationCount ?? 12
            const heatDuration = entryConfig.heatDuration ?? 2

            // Logic to force new heat if event changes
            if (lastEventCode && entryEvent !== lastEventCode) {
                if (currentStation > 1) {
                    // Advance Heat
                    currentHeat++
                    currentStation = 1
                    // Add duration of PREVIOUS heat to time
                    // Wait, we need to track duration of the heat that just finished.
                    // If we switch events, the previous heat used the PREVIOUS event's duration.
                    // We need to apply that duration NOW to update start time for the NEW heat.
                    const prevConfig = getRundownConfig(lastEventCode)
                    currentHeatStartTime = addMinutes(currentHeatStartTime, prevConfig.heatDuration ?? 2)
                }
            }
            lastEventCode = entryEvent

            // Check Station Capacity
            if (currentStation > maxStations) {
                currentHeat++
                currentStation = 1
                // Add duration of the heat that just filled up.
                // Since this heat belonged to 'entryEvent' (mostly), use its duration.
                currentHeatStartTime = addMinutes(currentHeatStartTime, heatDuration)
            }

            // Assign
            entry.participants.forEach(p => {
                p.heat = currentHeat
                p.station = currentStation
                p.scheduleTime = currentHeatStartTime
            })
            currentStation++
        })
    }

    function updateParticipant(id: string, updates: Partial<Participant>, recordHistory = true) {
        const p = participants.value.find(p => p.id === id)
        if (!p) return

        if (recordHistory) {
            // Capture previous state for undo
            const prevData: Partial<Participant> = {}
            for (const key of Object.keys(updates)) {
                const k = key as keyof Participant
                // @ts-ignore
                prevData[k] = p[k]
            }
            pushHistory(`Update ${p.name}`, () => updateParticipant(id, prevData, false))
        }

        Object.assign(p, updates)
    }

    function swapParticipants(id1: string, id2: string, recordHistory = true) {
        const p1 = participants.value.find(x => x.id === id1)
        const p2 = participants.value.find(x => x.id === id2)

        if (!p1 || !p2) return

        if (recordHistory) {
            pushHistory(`Swap ${p1.name} <-> ${p2.name}`, () => swapParticipants(id1, id2, false))
        }

        // Swap scheduling info
        const tempHeat = p1.heat
        const tempStation = p1.station
        const tempTime = p1.scheduleTime

        p1.heat = p2.heat
        p1.station = p2.station
        p1.scheduleTime = p2.scheduleTime

        p2.heat = tempHeat
        p2.station = tempStation
        p2.scheduleTime = tempTime
    }

    function getEntryIndex(p: Participant, list: Participant[]) {
        // If no groupId, it's a simple index
        if (!p.groupId) {
            return list.indexOf(p) + 1
        }

        // If there is a groupId, we need to find the unique order of groups
        let pGroupIndex = -1
        let entryCounter = 0
        const processedGroups = new Set<string>()

        for (const item of list) {
            if (item.groupId) {
                if (!processedGroups.has(item.groupId)) {
                    processedGroups.add(item.groupId)
                    entryCounter++
                }
                if (item.id === p.id) {
                    pGroupIndex = entryCounter
                    break
                }
            } else {
                entryCounter++
                if (item.id === p.id) {
                    pGroupIndex = entryCounter
                    break
                }
            }
        }
        return pGroupIndex
    }

    function getParticipantEntryCode(p: Participant) {
        const eventData = hierarchy.value.find(h => h.event.code === p.eventCode)
        if (!eventData) return '-'
        const divData = eventData.divisions.find(d => d.division === p.division)
        if (!divData) return '-'

        const index = getEntryIndex(p, divData.participants)
        return divData.entryCode ? `${divData.entryCode}${String(index).padStart(3, '0')}` : '-'
    }

    return {
        events,
        divisions,
        participants,
        entryCodes,
        // rundownConfig, // Removed global
        getRundownConfig, // Exported NEW
        updateRundownConfig, // Exported Updated
        addParticipant, // Singular
        upsertParticipants, // Batch
        clearParticipants,
        wipeAllData,
        setEntryCode,
        getEntryCode,
        getParticipantsByEvent,
        getParticipantEntryCode, // NEW
        hierarchy,
        teams,
        deleteTeam,
        deleteDivision,
        renameDivision,
        sanitizeData,
        generateRundown,
        clearRundown,
        updateParticipant,
        swapParticipants,
        eventStartTimes,
        setEventStartTime,
        getEventStartTime,
        history,
        undo
    }
})

// --- Persistence Helper ---
export function initPersistence() {
    const store = useNamelistStore()

    // Load from storage
    const saved = localStorage.getItem('namelist_data')
    if (saved) {
        try {
            const data = JSON.parse(saved)
            if (data.events) store.events = data.events
            if (data.divisions) {
                // MIGRATION: If divisions are stored as strings, convert to objects
                if (Array.isArray(data.divisions) && typeof data.divisions[0] === 'string') {
                    store.divisions = (data.divisions as string[]).map(name => {
                        const def = DEFAULT_DIVISIONS.find(d => d.name === name)
                        return def ? { ...def } : { name, prefix: '' }
                    })
                } else {
                    store.divisions = data.divisions
                }
            }
            if (data.participants) store.participants = data.participants
            if (data.entryCodes) store.entryCodes = data.entryCodes
            if (data.eventStartTimes) store.eventStartTimes = data.eventStartTimes

            // Run sanitization after load to fix any existing "ghost" data
            store.sanitizeData()
        } catch (e) {
            console.error('Failed to load saved data', e)
        }
    }

    // Save on change
    store.$subscribe((mutation, state) => {
        localStorage.setItem('namelist_data', JSON.stringify({
            events: state.events,
            divisions: state.divisions,
            participants: state.participants,
            entryCodes: state.entryCodes,
            eventStartTimes: state.eventStartTimes,
            // rundownConfig: state.rundownConfig // Save rundown config (Global Deprecated)
        }))
    })
}
