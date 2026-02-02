import type { Participant, EventConfig, DivisionConfig } from '@/config/defaults'

// Types needed for the service
export interface RundownConfig {
    startTime: string
    heatDuration: number // minutes
    stationCount: number
    rowsPerPage: number
}

export interface ScheduleOptions {
    targetEventCode?: string
    initialStartTime?: string // HH:MM
    startHeatNumber?: number
}

export interface ScheduleResult {
    participantId: string
    heat: number
    station: number
    scheduleTime: string
}

/**
 * Adds minutes to a HH:MM time string and returns a formatted new time.
 * Handles hour wrapping correctly.
 */
export function addMinutes(timeStr: string, minutes: number): string {
    const parts = timeStr.split(':')
    const h = Number(parts[0]) || 0
    const m = Number(parts[1]) || 0

    // Use Date object for robust calculation
    const date = new Date()
    date.setHours(h, m, 0, 0)
    date.setMinutes(date.getMinutes() + minutes)

    const newH = String(date.getHours()).padStart(2, '0')
    const newM = String(date.getMinutes()).padStart(2, '0')

    return `${newH}:${newM}`
}

/**
 * Helper to calculate the entry index (e.g., 1, 2, 3) for a participant within a list.
 * Respects group logic (same group = same index).
 */
function getEntryIndex(p: Participant, list: Participant[]): number {
    if (!p.groupId) {
        return list.indexOf(p) + 1
    }

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

/**
 * Helper to generate the full "A001" style entry code for sorting.
 */
function getSortableEntryCode(
    p: Participant,
    allParticipants: Participant[],
    entryCodePrefixes: Record<string, string> // Map of "EventCode|DivisionName" -> "Prefix"
): string {
    const key = `${p.eventCode}|${p.division}`
    const prefix = entryCodePrefixes[key]

    if (!prefix) return '-'

    // We need the list of participants in this specific Division/Event to find the index
    const divParts = allParticipants.filter(x => x.eventCode === p.eventCode && x.division === p.division)
    const index = getEntryIndex(p, divParts)

    return `${prefix}${String(index).padStart(3, '0')}`
}

/**
 * Core Scheduling Logic
 * Pure function: takes data, returns updates. Does not mutate inputs.
 */
export function scheduleParticipants(
    participants: Participant[],
    events: EventConfig[],
    entryCodePrefixes: Record<string, string>,
    getRundownConfig: (eventCode: string) => RundownConfig,
    options: ScheduleOptions = {}
): ScheduleResult[] {
    // 1. Filter Check
    let partsToSchedule: Participant[] = []
    if (options.targetEventCode) {
        partsToSchedule = participants.filter(p => p.eventCode === options.targetEventCode)
    } else {
        partsToSchedule = [...participants]
    }

    if (partsToSchedule.length === 0) return []

    // 2. Sort Logic
    const norm = (s: string) => (s || '').trim()

    // We sort a COPY to avoid mutating the input array order (if it matters, though usually we want to return sorted order?)
    // The requirement is to assign heats based on this sort. 
    // The store might re-order its own list based on this, or we just compute updates.
    // Let's assume we sort purely to determine the order of assignment.

    // Note: getSortableEntryCode is expensive if called repeatedly in sort. 
    // Optimization: Calculate sort keys once.
    const sortKeys = new Map<string, string>()
    partsToSchedule.forEach(p => {
        sortKeys.set(p.id, getSortableEntryCode(p, participants, entryCodePrefixes))
    })

    const sortedParts = [...partsToSchedule].sort((a, b) => {
        const codeA = norm(a.eventCode)
        const codeB = norm(b.eventCode)

        // Event Sort
        const evtIdxA = events.findIndex(e => norm(e.code) === codeA)
        const evtIdxB = events.findIndex(e => norm(e.code) === codeB)

        if (evtIdxA !== -1 && evtIdxB !== -1) {
            if (evtIdxA !== evtIdxB) return evtIdxA - evtIdxB
        } else if (evtIdxA !== -1) return -1
        else if (evtIdxB !== -1) return 1
        else if (codeA !== codeB) return codeA.localeCompare(codeB)

        // Entry Code Sort
        const entryA = sortKeys.get(a.id) || '-'
        const entryB = sortKeys.get(b.id) || '-'

        if (entryA !== entryB) {
            if (entryA !== '-' && entryB !== '-') return entryA.localeCompare(entryB)
            if (entryA === '-') return 1
            if (entryB === '-') return -1
        }

        return 0
    })

    // 3. Grouping for Station Assignment
    const entries: Array<{ id: string, type: 'group' | 'single', participants: Participant[] }> = []
    const processedGroups = new Set<string>()

    sortedParts.forEach(p => {
        if (p.groupId) {
            if (!processedGroups.has(p.groupId)) {
                processedGroups.add(p.groupId)
                const groupParts = sortedParts.filter(gp => gp.groupId === p.groupId)
                entries.push({ id: p.groupId, type: 'group', participants: groupParts })
            }
        } else {
            entries.push({ id: p.id, type: 'single', participants: [p] })
        }
    })

    // 4. Assign Heats and Stations
    const results: ScheduleResult[] = []

    let currentHeat = options.startHeatNumber || 1
    let currentStation = 1
    let lastEventCode = ''

    // Initial Time Setup
    const firstEventCode = entries[0]?.participants[0]?.eventCode
    const effectiveConfigEvent = options.targetEventCode || firstEventCode || 'GLOBAL'
    const initialConfig = getRundownConfig(effectiveConfigEvent)

    let currentHeatStartTime = options.initialStartTime || initialConfig.startTime || '09:00'

    entries.forEach(entry => {
        if (!entry.participants[0]) return
        const entryEvent = norm(entry.participants[0].eventCode)
        const entryConfig = getRundownConfig(entryEvent)

        const maxStations = entryConfig.stationCount ?? 12
        const heatDuration = entryConfig.heatDuration ?? 2

        // Event Switch Logic (Force new Heat)
        if (lastEventCode && entryEvent !== lastEventCode) {
            if (currentStation > 1) {
                currentHeat++
                currentStation = 1
                // Add duration of PREVIOUS heat's event
                const prevConfig = getRundownConfig(lastEventCode)
                currentHeatStartTime = addMinutes(currentHeatStartTime, prevConfig.heatDuration ?? 2)
            }
        }
        lastEventCode = entryEvent

        // Station Capacity Logic
        if (currentStation > maxStations) {
            currentHeat++
            currentStation = 1
            // Add duration of CURRENT heat's event (approximate ownership)
            currentHeatStartTime = addMinutes(currentHeatStartTime, heatDuration)
        }

        // Create Result Updates
        entry.participants.forEach(p => {
            results.push({
                participantId: p.id,
                heat: currentHeat,
                station: currentStation,
                scheduleTime: currentHeatStartTime
            })
        })

        currentStation++
    })

    return results
}
