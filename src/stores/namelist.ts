import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { DEFAULT_DIVISIONS, DEFAULT_EVENTS } from '@/config/defaults'
import type { Participant, EventConfig, DivisionConfig } from '@/config/defaults'
import { scheduleParticipants, addMinutes } from '@/services/rundownService'
import type { RundownConfig } from '@/services/rundownService'

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
        // Prepare context for service
        // We need an array of participants to schedule (all or filtered)
        // But the service does filtering too if we pass targetEventCode.
        // Let's pass ALL participants and let the service filter/sort, 
        // OR pass just what we want.
        // The service needs ALL participants anyway if we want `getSortableEntryCode` to work correctly 
        // (it calculates index based on full division list).

        // Calculate start parameters
        let startHeat = 1
        let startTime: string | undefined = undefined

        if (targetEventCode) {
            // "Append" mode logic
            const otherParts = participants.value.filter(p => p.eventCode !== targetEventCode && p.heat !== undefined)
            if (otherParts.length > 0) {
                const maxHeat = Math.max(...otherParts.map(p => p.heat || 0))
                startHeat = maxHeat + 1

                // Find start time for this new heat
                // We find the last scheduled participant to get the "end time" of previous heats
                const sortedByHeat = [...otherParts].sort((a, b) => (a.heat || 0) - (b.heat || 0))
                const lastP = sortedByHeat[sortedByHeat.length - 1]
                if (lastP && lastP.scheduleTime) {
                    const lastConf = getRundownConfig(lastP.eventCode)
                    startTime = addMinutes(lastP.scheduleTime, lastConf.heatDuration ?? 2)
                }
            }
        }

        // Execute Pure Scheduling
        const updates = scheduleParticipants(
            participants.value,
            events.value,
            entryCodes.value, // Pass the prefix map
            getRundownConfig, // Pass the config getter
            {
                targetEventCode,
                startHeatNumber: startHeat,
                initialStartTime: startTime
            }
        )

        // Apply Updates
        // First, clear existing info for the target scope
        clearRundown(targetEventCode)

        // Apply new values
        updates.forEach(u => {
            const p = participants.value.find(p => p.id === u.participantId)
            if (p) {
                p.heat = u.heat
                p.station = u.station
                p.scheduleTime = u.scheduleTime
            }
        })
    }

    function updateParticipant(id: string, updates: Partial<Participant>, recordHistory = true) {
        const p = participants.value.find(p => p.id === id)
        if (!p) return

        if (recordHistory) {
            // Capture previous state for undo
            const prevData: Partial<Participant> = {}
            const keys = Object.keys(updates) as Array<keyof Participant>
            keys.forEach(key => {
                prevData[key] = p[key] as any
            })
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
