import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { DEFAULT_DIVISIONS, DEFAULT_EVENTS } from '@/config/defaults'
import type { Participant, EventConfig, DivisionConfig } from '@/config/defaults'
import { scheduleParticipants, addMinutes } from '@/services/rundownService'
import type { RundownConfig } from '@/services/rundownService'

// Module-level flag to break recursion between auto-save and metadata updates
let isAutoSaving = false

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

    // Competition Main Title
    const competitionTitle = ref<string>('COMPETITION CHAMPIONSHIPS')
    const competitionDate = ref<string>(new Date().toISOString().split('T')[0] || '')

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

    function setCompetitionTitle(title: string) {
        competitionTitle.value = title
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

    function performSanitization(
        evts: EventConfig[],
        divs: DivisionConfig[],
        parts: Participant[],
        codes: Record<string, string>
    ) {
        const validDivisionNames = new Set(divs.map(d => d.name))

        // 1. Clean up event.allowedDivisions
        evts.forEach(evt => {
            if (evt.allowedDivisions && evt.allowedDivisions.length > 0) {
                evt.allowedDivisions = evt.allowedDivisions.filter(name => validDivisionNames.has(name))
            }
        })

        // 2. Clean up participants
        parts.forEach(p => {
            if (p.division && !validDivisionNames.has(p.division)) {
                p.division = '' // Clear if invalid
            }
        })

        // 3. Clean up entryCodes
        Object.keys(codes).forEach(key => {
            const partsConf = key.split('|')
            const divPart = partsConf[1]
            if (partsConf.length === 2 && divPart && !validDivisionNames.has(divPart)) {
                delete codes[key]
            }
        })
    }

    function sanitizeData() {
        performSanitization(events.value, divisions.value, participants.value, entryCodes.value)
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
        // FIX: Force Reactivity Update so View updates immediately
        participants.value = [...participants.value]
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
        // Note: clearRundown already forces update, but we do it again after applying new schedule below

        // Apply new values
        updates.forEach(u => {
            const p = participants.value.find(p => p.id === u.participantId)
            if (p) {
                p.heat = u.heat
                p.station = u.station
                p.scheduleTime = u.scheduleTime
            }
        })

        // FIX: Force Reactivity Update AGAIN after applying schedules
        participants.value = [...participants.value]
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

        // Ensure Swap updates UI immediately too
        participants.value = [...participants.value]
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

    // --- Multi-Competition Persistence ---
    const activeCompetitionId = ref<string | null>(null)
    const savedCompetitions = ref<Array<{ id: string, name: string, date: string, lastModified: string }>>([])

    function loadCompetition(id: string) {
        // 1. Load data from local storage
        const key = `comp_data_${id}`
        const saved = localStorage.getItem(key)

        if (saved) {
            try {
                const data = JSON.parse(saved)

                // Prepare RAW data
                const rawEvents = data.events || [...DEFAULT_EVENTS]
                let rawDivisions: DivisionConfig[] = []

                // Divisions Migration Logic
                if (data.divisions) {
                    if (Array.isArray(data.divisions) && typeof data.divisions[0] === 'string') {
                        rawDivisions = (data.divisions as string[]).map((name: string) => {
                            const def = DEFAULT_DIVISIONS.find(d => d.name === name)
                            return def ? { ...def } : { name, prefix: '' }
                        })
                    } else {
                        rawDivisions = data.divisions
                    }
                } else {
                    rawDivisions = [...DEFAULT_DIVISIONS]
                }

                const rawParticipants = data.participants || []
                const rawEntryCodes = data.entryCodes || {}

                // Optimize: Sanitize RAW data before reactivity
                performSanitization(rawEvents, rawDivisions, rawParticipants, rawEntryCodes)

                // Restore State (Batch assignment triggers reactivity once)
                events.value = rawEvents
                divisions.value = rawDivisions
                participants.value = rawParticipants
                entryCodes.value = rawEntryCodes

                eventStartTimes.value = data.eventStartTimes || {}
                competitionTitle.value = data.competitionTitle || 'COMPETITION CHAMPIONSHIPS'
                competitionDate.value = data.competitionDate || new Date().toISOString().split('T')[0] || '' // Load Date

                // Set Active
                activeCompetitionId.value = id

                // Update Last Modified
                updateCompetitionMetadata(id, { lastModified: new Date().toISOString() })

            } catch (e) {
                console.error("Failed to load competition", e)
                alert("Error loading competition data.")
            }
        } else {
            // New / Empty
            resetToDefault()
            activeCompetitionId.value = id
        }
    }

    function resetToDefault() {
        events.value = [...DEFAULT_EVENTS]
        divisions.value = [...DEFAULT_DIVISIONS]
        participants.value = []
        entryCodes.value = {}
        eventStartTimes.value = {}
        competitionTitle.value = 'COMPETITION CHAMPIONSHIPS'
        competitionDate.value = new Date().toISOString().split('T')[0] || ''
        history.value = []
    }

    function createCompetition(name: string, date: string) {
        const id = 'comp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
        const newComp = {
            id,
            name,
            date: date || new Date().toISOString().split('T')[0] || '',
            lastModified: new Date().toISOString()
        }
        savedCompetitions.value.push(newComp)
        saveCompetitionsIndex()

        // Reset state for new competition
        resetToDefault()
        competitionTitle.value = name // Set title to name initially
        competitionDate.value = newComp.date
        activeCompetitionId.value = id

        // Trigger initial save
        saveCurrentCompetition()

        return id
    }

    function deleteCompetition(id: string) {
        // Remove from index
        savedCompetitions.value = savedCompetitions.value.filter(c => c.id !== id)
        saveCompetitionsIndex()

        // Remove data
        localStorage.removeItem(`comp_data_${id}`)

        if (activeCompetitionId.value === id) {
            activeCompetitionId.value = null
            resetToDefault()
        }
    }

    function updateCompetitionMetadata(id: string, updates: Partial<{ name: string, date: string, lastModified: string }>) {
        const comp = savedCompetitions.value.find(c => c.id === id)
        if (comp) {
            Object.assign(comp, updates)
            saveCompetitionsIndex()

            // Also update the actual data file to prevent sync issues
            const key = `comp_data_${id}`
            const stored = localStorage.getItem(key)
            if (stored) {
                try {
                    const data = JSON.parse(stored)
                    let modified = false

                    if (updates.name !== undefined) {
                        data.competitionTitle = updates.name
                        modified = true
                    }
                    if (updates.date !== undefined) {
                        data.competitionDate = updates.date
                        modified = true
                    }

                    if (modified) {
                        localStorage.setItem(key, JSON.stringify(data))
                    }
                } catch (e) {
                    console.error("Failed to patch competition data during metadata update", e)
                }
            }
        }
    }

    function saveCompetitionsIndex() {
        localStorage.setItem('saved_competitions_index', JSON.stringify(savedCompetitions.value))
    }

    function saveCurrentCompetition() {
        if (!activeCompetitionId.value) return

        // Prevent recursive trigger
        isAutoSaving = true

        const data = {
            events: events.value,
            divisions: divisions.value,
            participants: participants.value,
            entryCodes: entryCodes.value,
            eventStartTimes: eventStartTimes.value,
            competitionTitle: competitionTitle.value,
            competitionDate: competitionDate.value // Save Date
        }

        // FIX: Wrap save in try/catch to handle Storage Full quota errors
        try {
            localStorage.setItem(`comp_data_${activeCompetitionId.value}`, JSON.stringify(data))

            // Update metadata timestamp
            updateCompetitionMetadata(activeCompetitionId.value, {
                lastModified: new Date().toISOString(),
                name: competitionTitle.value,
                date: competitionDate.value
            })
        } catch (e) {
            console.error("Storage Save Failed", e)
            alert("⚠️ Critical Warning: Storage Full! Your changes are NOT being saved.\n\nPlease Export CSV immediately and clear old competitions.")
        } finally {
            // Reset flag
            isAutoSaving = false
        }
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
        competitionTitle, // NEW
        setCompetitionTitle, // NEW
        competitionDate, // NEW
        history,
        undo,
        // Multi-Comp
        activeCompetitionId,
        savedCompetitions,
        loadCompetition,
        createCompetition,
        deleteCompetition,
        saveCurrentCompetition,
        updateCompetitionMetadata
    }
})

// --- Persistence Helper ---
export function initPersistence() {
    const store = useNamelistStore()

    // 1. Load Index
    const savedIndex = localStorage.getItem('saved_competitions_index')
    if (savedIndex) {
        try {
            store.savedCompetitions = JSON.parse(savedIndex)
        } catch (e) {
            console.error("Failed to load competition index", e)
            store.savedCompetitions = []
        }
    }

    // 2. Migration Check: Do we have legacy 'namelist_data' but no competitions?
    const legacyData = localStorage.getItem('namelist_data')
    if (legacyData && store.savedCompetitions.length === 0) {
        console.log("Migrating legacy data...")
        const id = 'default_legacy'
        const name = 'My First Competition'

        // Create Entry
        store.savedCompetitions.push({
            id,
            name,
            date: new Date().toISOString().split('T')[0] || '',
            lastModified: new Date().toISOString()
        })
        localStorage.setItem('saved_competitions_index', JSON.stringify(store.savedCompetitions))

        // Move Data
        localStorage.setItem(`comp_data_${id}`, legacyData)
        localStorage.removeItem('namelist_data') // Cleanup (optional, maybe keep as backup?)

        // Don't remove legacy data just in case, but system now uses new key.
    }

    // 3. Subscribe for Auto-Save
    store.$subscribe((mutation, state) => {
        if (isAutoSaving) return // Break recursion

        if (store.activeCompetitionId) {
            // Persist Active ID
            localStorage.setItem('active_competition_id', store.activeCompetitionId)
            // Save Content
            store.saveCurrentCompetition()
        } else {
            localStorage.removeItem('active_competition_id')
        }
    })

    // 4. Restore Active Session
    const lastActiveId = localStorage.getItem('active_competition_id')
    if (lastActiveId) {
        // defined but might not be valid? loadCompetition handles validity check
        store.loadCompetition(lastActiveId)
    }
}