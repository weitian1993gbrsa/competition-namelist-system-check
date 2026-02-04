import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { DEFAULT_DIVISIONS, DEFAULT_EVENTS } from '@/config/defaults'
import type { Participant, EventConfig, DivisionConfig } from '@/config/defaults'
import { scheduleParticipants, addMinutes } from '@/services/rundownService'
import type { RundownConfig } from '@/services/rundownService'

let isAutoSaving = false

export const useNamelistStore = defineStore('namelist', () => {
    const events = ref<EventConfig[]>([...DEFAULT_EVENTS])
    const divisions = ref<DivisionConfig[]>([...DEFAULT_DIVISIONS])
    const participants = ref<Participant[]>([])
    const entryCodes = ref<Record<string, string>>({})
    const eventStartTimes = ref<Record<string, string>>({})
    const competitionTitle = ref<string>('COMPETITION CHAMPIONSHIPS')
    const competitionDate = ref<string>(new Date().toISOString().split('T')[0] || '')
    const history = ref<Array<{ description: string, undo: () => void }>>([])

    function pushHistory(description: string, undoAction: () => void) {
        history.value = [{ description, undo: undoAction }]
    }

    function undo() {
        const action = history.value.pop()
        if (action) action.undo()
    }

    function addParticipant(p: Participant) {
        participants.value.push(p)
        saveCurrentCompetition()
    }

    function clearParticipants() {
        participants.value = []
        saveCurrentCompetition()
    }


    function wipeAllData() {
        participants.value = []
        saveCurrentCompetition()
    }

    function deleteDivision(divisionName: string) {
        const idx = divisions.value.findIndex(d => d.name === divisionName)
        if (idx !== -1) divisions.value.splice(idx, 1)

        participants.value = participants.value.filter(p => p.division !== divisionName)

        events.value.forEach(evt => {
            if (evt.allowedDivisions) {
                evt.allowedDivisions = evt.allowedDivisions.filter(d => d !== divisionName)
            }
        })
        saveCurrentCompetition()
    }

    function renameDivision(oldName: string, newName: string) {
        const div = divisions.value.find(d => d.name === oldName)
        if (div) div.name = newName

        participants.value.forEach(p => {
            if (p.division === oldName) p.division = newName
        })

        events.value.forEach(evt => {
            if (evt.allowedDivisions) {
                const idx = evt.allowedDivisions.indexOf(oldName)
                if (idx !== -1) evt.allowedDivisions[idx] = newName
            }
        })

        Object.keys(entryCodes.value).forEach(key => {
            const [evt, d] = key.split('|')
            if (d === oldName) {
                entryCodes.value[`${evt}|${newName}`] = entryCodes.value[key]!
                delete entryCodes.value[key]
            }
        })
        saveCurrentCompetition()
    }

    function deleteTeam(teamName: string) {
        participants.value = participants.value.filter(p => p.team !== teamName)
        saveCurrentCompetition()
    }

    function upsertParticipants(list: Participant[]) {
        const incomingIds = new Set(list.map(p => p.id))
        participants.value = participants.value.filter(p => !incomingIds.has(p.id))
        participants.value.push(...list)
        saveCurrentCompetition()
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

    const hierarchy = computed(() => {
        return events.value.map(evt => {
            const filteredDivs = divisions.value.filter(div => {
                if (!evt.allowedDivisions || evt.allowedDivisions.length === 0) return true
                return evt.allowedDivisions.includes(div.name)
            })

            return {
                event: evt,
                divisions: filteredDivs.map(div => {
                    const parts = participants.value.filter(p => p.eventCode === evt.code && p.division === div.name)
                    const code = getEntryCode(evt.code, div.name)
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
                    return { division: div.name, entryCode: code, count: uniqueEntryCount, participants: parts }
                })
            }
        })
    })

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
            const uniqueNames = new Set<string>()
            parts.forEach(p => {
                p.name.split(/[\r\n,]+/).forEach(n => {
                    const cleanName = n.trim()
                    if (cleanName.length > 1) uniqueNames.add(cleanName)
                })
            })
            return { name: teamName, participants: parts, count: uniqueNames.size }
        })
    })

    const defaultRundownConfig = { startTime: '09:00', heatDuration: 2, stationCount: 12, rowsPerPage: 30 }
    const eventRundownConfigs = ref<Record<string, typeof defaultRundownConfig>>({ 'GLOBAL': { ...defaultRundownConfig } })

    function getRundownConfig(eventCode?: string | null) {
        const key = eventCode?.trim() || 'GLOBAL'
        return eventRundownConfigs.value[key] || eventRundownConfigs.value['GLOBAL'] || defaultRundownConfig
    }

    function updateRundownConfig(config: typeof defaultRundownConfig, eventCode?: string | null) {
        const key = eventCode ? eventCode.trim() : 'GLOBAL'
        eventRundownConfigs.value[key] = { ...config }
        saveCurrentCompetition()
    }

    function clearRundown(eventCode?: string) {
        participants.value.forEach(p => {
            if (!eventCode || p.eventCode === eventCode) {
                p.heat = undefined
                p.station = undefined
                p.scheduleTime = undefined
            }
        })
        participants.value = [...participants.value] // Trigger reactivity
        saveCurrentCompetition()
    }

    function generateRundown(targetEventCode?: string) {
        let startHeat = 1
        let startTime: string | undefined = undefined

        if (targetEventCode) {
            const otherParts = participants.value.filter(p => p.eventCode !== targetEventCode && p.heat !== undefined)
            if (otherParts.length > 0) {
                const maxHeat = Math.max(...otherParts.map(p => p.heat || 0))
                startHeat = maxHeat + 1
                const sortedByHeat = [...otherParts].sort((a, b) => (a.heat || 0) - (b.heat || 0))
                const lastP = sortedByHeat[sortedByHeat.length - 1]
                if (lastP?.scheduleTime) {
                    const lastConf = getRundownConfig(lastP.eventCode)
                    startTime = addMinutes(lastP.scheduleTime, lastConf.heatDuration ?? 2)
                }
            }
        }

        const updates = scheduleParticipants(participants.value, events.value, entryCodes.value, getRundownConfig, {
            targetEventCode,
            startHeatNumber: startHeat,
            initialStartTime: startTime
        })

        clearRundown(targetEventCode)

        updates.forEach(u => {
            const p = participants.value.find(p => p.id === u.participantId)
            if (p) {
                p.heat = u.heat
                p.station = u.station
                p.scheduleTime = u.scheduleTime
            }
        })

        participants.value = [...participants.value] // Trigger reactivity
        saveCurrentCompetition()
    }

    function swapParticipants(id1: string, id2: string, recordHistory = true) {
        const p1 = participants.value.find(x => x.id === id1)
        const p2 = participants.value.find(x => x.id === id2)
        if (!p1 || !p2) return

        if (recordHistory) pushHistory(`Swap ${p1.name} <-> ${p2.name}`, () => swapParticipants(id1, id2, false))

        const tempHeat = p1.heat
        const tempStation = p1.station
        const tempTime = p1.scheduleTime

        p1.heat = p2.heat; p1.station = p2.station; p1.scheduleTime = p2.scheduleTime
        p2.heat = tempHeat; p2.station = tempStation; p2.scheduleTime = tempTime

        p2.heat = tempHeat; p2.station = tempStation; p2.scheduleTime = tempTime

        participants.value = [...participants.value] // Trigger reactivity
        saveCurrentCompetition()
    }

    function updateParticipant(id: string, updates: Partial<Participant>, recordHistory = true) {
        const p = participants.value.find(p => p.id === id)
        if (!p) return
        if (recordHistory) {
            const prevData: Partial<Participant> = {}
            Object.keys(updates).forEach(key => { prevData[key as keyof Participant] = p[key as keyof Participant] as any })
            pushHistory(`Update ${p.name}`, () => updateParticipant(id, prevData, false))
        }
        Object.assign(p, updates)
        participants.value = [...participants.value]
        saveCurrentCompetition()
    }

    function getParticipantEntryCode(p: Participant) {
        const eventData = hierarchy.value.find(h => h.event.code === p.eventCode)
        const divData = eventData?.divisions.find(d => d.division === p.division)
        if (!divData) return '-'
        const list = divData.participants
        let index = p.groupId ? -1 : list.indexOf(p) + 1
        if (p.groupId) {
            let counter = 0
            const processed = new Set<string>()
            for (const item of list) {
                if (item.groupId && !processed.has(item.groupId)) { processed.add(item.groupId); counter++ }
                else if (!item.groupId) counter++
                if (item.id === p.id) { index = counter; break }
            }
        }
        return divData.entryCode ? `${divData.entryCode}${String(index).padStart(3, '0')}` : '-'
    }

    // Competition management functions...
    const activeCompetitionId = ref<string | null>(localStorage.getItem('active_competition_id'))
    const savedCompetitions = ref<Array<{ id: string, name: string, date: string, lastModified: string }>>([])
    try {
        const rawIndex = localStorage.getItem('saved_competitions_index')
        if (rawIndex) savedCompetitions.value = JSON.parse(rawIndex)
    } catch (e) { }

    // Auto-hydrate if active ID exists
    if (activeCompetitionId.value) {
        // We call the logic directly or reuse loadCompetition but we must ensure we don't double set
        // Calling loadCompetition is safe
        // We need to define loadCompetition before calling it? 
        // No, function hoisting works for declarations, but this is inside setup().
        // Functions defined as `function foo() {}` are hoisted within the scope usually, 
        // but here they are siblings.
        // Wait, standard function declarations are hoisted to top of scope.
        // But `loadCompetition` is defined BELOW. 
        // In Vue setup() / JS modules, function declarations *are* hoisted.
        // However, better safely place this check at the END of the store definition (before return).
    }


    function saveCurrentCompetition() {
        if (!activeCompetitionId.value) return
        isAutoSaving = true
        const data = { events: events.value, divisions: divisions.value, participants: participants.value, entryCodes: entryCodes.value, eventStartTimes: eventStartTimes.value, competitionTitle: competitionTitle.value, competitionDate: competitionDate.value }
        try {
            localStorage.setItem(`comp_data_${activeCompetitionId.value}`, JSON.stringify(data))
            const comp = savedCompetitions.value.find(c => c.id === activeCompetitionId.value)
            if (comp) { comp.lastModified = new Date().toISOString(); comp.name = competitionTitle.value; comp.date = competitionDate.value }
            localStorage.setItem('saved_competitions_index', JSON.stringify(savedCompetitions.value))
        } catch (e) { alert("Storage Full!") }
    }

    function createCompetition(name: string, date: string) {
        const id = crypto.randomUUID()
        const newComp = { id, name, date, lastModified: new Date().toISOString() }
        savedCompetitions.value.push(newComp)
        localStorage.setItem('saved_competitions_index', JSON.stringify(savedCompetitions.value))

        activeCompetitionId.value = id
        localStorage.setItem('active_competition_id', id)
        competitionTitle.value = name
        competitionDate.value = date

        events.value = [...DEFAULT_EVENTS]
        divisions.value = [...DEFAULT_DIVISIONS]
        participants.value = []
        entryCodes.value = {}
        eventStartTimes.value = {}

        saveCurrentCompetition()
        return id
    }

    function loadCompetition(id: string) {
        const comp = savedCompetitions.value.find(c => c.id === id)
        if (!comp) return

        activeCompetitionId.value = id
        localStorage.setItem('active_competition_id', id)
        competitionTitle.value = comp.name
        competitionDate.value = comp.date

        const dataStr = localStorage.getItem(`comp_data_${id}`)
        if (dataStr) {
            try {
                const data = JSON.parse(dataStr)
                events.value = data.events || [...DEFAULT_EVENTS]
                divisions.value = data.divisions || [...DEFAULT_DIVISIONS]
                participants.value = data.participants || []
                entryCodes.value = data.entryCodes || {}
                eventStartTimes.value = data.eventStartTimes || {}
            } catch (e) {
                console.error("Failed to load data", e)
            }
        }
    }

    function deleteCompetition(id: string) {
        const idx = savedCompetitions.value.findIndex(c => c.id === id)
        if (idx !== -1) savedCompetitions.value.splice(idx, 1)
        localStorage.setItem('saved_competitions_index', JSON.stringify(savedCompetitions.value))
        localStorage.removeItem(`comp_data_${id}`)

        if (activeCompetitionId.value === id) {
            activeCompetitionId.value = null
            localStorage.removeItem('active_competition_id')
            wipeAllData()
        }
    }

    function updateCompetitionMetadata(id: string, updates: Partial<typeof savedCompetitions.value[0]>) {
        const comp = savedCompetitions.value.find(c => c.id === id)
        if (comp) {
            Object.assign(comp, updates)
            localStorage.setItem('saved_competitions_index', JSON.stringify(savedCompetitions.value))
            if (activeCompetitionId.value === id) {
                if (updates.name) competitionTitle.value = updates.name
                if (updates.date) competitionDate.value = updates.date
            }
        }
    }
    // Auto-hydrate
    if (activeCompetitionId.value) {
        loadCompetition(activeCompetitionId.value)
    }

    return {
        events, divisions, participants, entryCodes, getRundownConfig, updateRundownConfig,
        addParticipant, upsertParticipants, clearParticipants, wipeAllData, setEntryCode,
        getEntryCode, getParticipantEntryCode, hierarchy, teams, generateRundown,
        clearRundown, updateParticipant, swapParticipants, eventStartTimes,
        setEventStartTime, getEventStartTime, competitionTitle, competitionDate,
        history, undo, activeCompetitionId, savedCompetitions, saveCurrentCompetition,
        deleteDivision, renameDivision, deleteTeam,
        createCompetition, loadCompetition, deleteCompetition, updateCompetitionMetadata
    }
})