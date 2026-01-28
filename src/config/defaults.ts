export const DEFAULT_DIVISIONS: DivisionConfig[] = [
    { name: '7-11 FEMALE', prefix: 'A' },
    { name: '12-15 FEMALE', prefix: 'B' },
    { name: '16+ FEMALE', prefix: 'C' },
    { name: '7-11 MALE', prefix: 'D' },
    { name: '12-15 MALE', prefix: 'E' },
    { name: '16+ MALE', prefix: 'F' },
    { name: 'OPEN+ FEMALE', prefix: 'G' },
    { name: 'OPEN+ MALE', prefix: 'H' }
]

export const DEFAULT_EVENTS = [
    { code: 'SRSS', name: 'Single Rope Speed Sprint' },
    { code: 'SRSE', name: 'Single Rope Speed Endurance' },
    { code: 'SRSR', name: 'Single Rope Speed Relay' },
    { code: 'SRDR', name: 'Single Rope Double Unders Relay' },
    { code: 'SRJJ', name: 'Single Rope Jump Jump' },
    { code: 'SRJJR', name: 'Single Rope Jump Jump Relay' },
    { code: 'SRTU', name: 'Single Rope Triple Unders' },
    { code: 'DDSS', name: 'Double Dutch Speed Sprint' },
    { code: 'DDSR', name: 'Double Dutch Speed Relay' },
    { code: 'SRIF', name: 'Single Rope Individual Freestyle' },
    { code: 'SRIF_LEVEL 1', name: 'Single Rope Individual Freestyle Level 1' },
    { code: 'SRIF_LEVEL 2', name: 'Single Rope Individual Freestyle Level 2' },
    { code: 'SRPF', name: 'Single Rope Pair Freestyle' },
    { code: 'SRTF', name: 'Single Rope Team Freestyle' },
    { code: 'DDPF', name: 'Double Dutch Pair Freestyle' },
    { code: 'DDTF', name: 'Double Dutch Team Freestyle' }
]

export type Participant = {
    id: string
    name: string
    team: string
    eventCode: string
    division: string
    notes?: string
    customId?: string
    groupId?: string // Added to support merged team/pair entries
    // Scheduling Info
    heat?: number
    station?: number
    scheduleTime?: string
}

export type EventConfig = {
    code: string
    name: string
    allowedDivisions?: string[] // If empty/undefined, all divisions are allowed
}

export type DivisionConfig = {
    name: string
    prefix: string
}
