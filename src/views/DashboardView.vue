<template>
  <div class="flex flex-col h-screen bg-gray-50">
    
    <!-- Top Header -->
    <header class="bg-white border-b shadow-sm p-4 sticky top-0 z-20">
      <div class="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        
        <!-- Tab Toggle -->
        <div class="flex bg-gray-100 p-1 rounded-lg">
          <button 
            @click="activeTab = 'teams'; selectedEventCode = null; selectedTeamName = null"
            class="px-6 py-2 rounded-md text-sm font-bold transition-all"
            :class="activeTab === 'teams' ? 'bg-white text-blue-700 shadow' : 'text-gray-500 hover:text-gray-700'"
          >
            Teams
          </button>
          <button 
            @click="activeTab = 'events'; selectedEventCode = null; selectedTeamName = null"
            class="px-6 py-2 rounded-md text-sm font-bold transition-all"
            :class="activeTab === 'events' ? 'bg-white text-blue-700 shadow' : 'text-gray-500 hover:text-gray-700'"
          >
            Events
          </button>
          <button 
            @click="activeTab = 'summary'; selectedEventCode = null; selectedTeamName = null"
            class="px-6 py-2 rounded-md text-sm font-bold transition-all"
            :class="activeTab === 'summary' ? 'bg-white text-blue-700 shadow' : 'text-gray-500 hover:text-gray-700'"
          >
            Summary
          </button>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-3">
          <button 
            @click="wipeData" 
            class="px-4 py-2 bg-red-100 text-red-700 border border-red-200 rounded shadow-sm hover:bg-red-200 transition font-medium text-sm"
          >
            Wipe Data
          </button>
          <router-link to="/rundown" class="px-4 py-2 bg-indigo-600 text-white rounded shadow hover:bg-indigo-700 transition text-sm font-bold">
            Rundown
          </router-link>
          <router-link to="/import" class="px-4 py-2 bg-emerald-600 text-white rounded shadow hover:bg-emerald-700 transition text-sm font-bold">
            + Import Data
          </router-link>
          <router-link to="/settings" class="px-4 py-2 border bg-white rounded shadow-sm hover:bg-gray-50 text-gray-700 text-sm font-bold">
            Config
          </router-link>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <div class="flex-1 overflow-y-auto p-4 md:p-8">
      <div class="max-w-7xl mx-auto">

        <!-- ================= TEAMS TAB ================= -->
        <div v-if="activeTab === 'teams'">
          
          <!-- View A: Team List -->
          <div v-if="!selectedTeamName">
             <h2 class="text-2xl font-bold text-gray-800 mb-6">Participating Teams</h2>
             <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               <div 
                 v-for="team in store.teams" 
                 :key="team.name"
                 @click="selectedTeamName = team.name"
                 class="bg-white p-6 rounded-lg shadow border border-gray-100 cursor-pointer hover:shadow-md hover:border-blue-300 transition group"
               >
                 <h3 class="font-bold text-lg text-gray-800 group-hover:text-blue-600 mb-2 uppercase">{{ team.name }}</h3>
                 <span class="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded font-medium">
                   {{ team.count }} Participants
                 </span>
               </div>
             </div>
             <div v-if="store.teams.length === 0" class="text-center py-20 text-gray-400 italic">
               No teams found. Import some data to get started.
             </div>
          </div>

          <!-- View B: Team Detail -->
          <div v-else>
            <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
              <div>
                <button @click="selectedTeamName = null" class="mb-4 text-blue-600 hover:underline flex items-center gap-2 font-medium">
                  ← Back to All Teams
                </button>
                <h2 class="text-3xl font-bold text-gray-900 uppercase">{{ selectedTeamName }}</h2>
                <p class="text-gray-500">Team Roster & Event Entries</p>
              </div>
              <button 
                @click="confirmDeleteTeam"
                class="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded hover:bg-red-600 hover:text-white transition flex items-center gap-2 text-sm font-bold"
              >
                <span>🗑️</span> Delete This Team
              </button>
            </div>
            
            <div class="bg-white rounded-lg shadow overflow-hidden">
               <table class="w-full text-sm text-left">
                  <thead class="bg-gray-50 text-gray-500 border-b">
                    <tr>
                      <th class="px-6 py-3 font-medium">Code</th>
                      <th class="px-6 py-3 font-medium">Name</th>
                      <th class="px-6 py-3 font-medium">Event</th>
                      <th class="px-6 py-3 font-medium">Division</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                    <tr v-for="g in groupedTeamParticipants" :key="g.id" class="hover:bg-gray-50">
                      <td class="px-6 py-3 font-mono font-bold text-blue-600">{{ g.code }}</td>
                      <td class="px-6 py-3 font-bold text-gray-800 uppercase whitespace-pre-line">{{ g.name }}</td>
                      <td class="px-6 py-3 text-gray-600">
                        <span class="font-mono text-xs bg-gray-100 px-1 rounded mr-2">{{ g.eventCode }}</span>
                        {{ formatEventName(g.eventCode) }}
                      </td>
                      <td class="px-6 py-3 text-gray-600">{{ g.division }}</td>
                    </tr>
                  </tbody>
               </table>
            </div>
          </div>
        </div>

        <!-- ================= EVENTS TAB ================= -->
        <div v-else-if="activeTab === 'events'">
          
          <!-- View A: Event List -->
          <div v-if="!selectedEventCode">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">Events List</h2>
             <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div 
                 v-for="evt in store.events" 
                 :key="evt.code"
                 @click="selectedEventCode = evt.code"
                 class="bg-white p-6 rounded-lg shadow border border-gray-100 cursor-pointer hover:shadow-md hover:border-blue-300 transition flex justify-between items-center group"
               >
                 <div class="flex items-center justify-between flex-1">
                   <div>
                     <h3 class="font-bold text-lg text-gray-800 group-hover:text-blue-600">{{ evt.name }}</h3>
                     <div class="flex items-center gap-2">
                       <span class="font-mono text-xs text-gray-400">{{ evt.code }}</span>
                       <span class="inline-block bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                         {{ getParticipantCountForEvent(evt.code) }} Entries
                       </span>
                     </div>
                   </div>
                   <span class="text-gray-300 text-2xl group-hover:text-blue-400">→</span>
                 </div>
               </div>
             </div>
          </div>

          <!-- View B: Event Detail (Division List) -->
          <div v-else-if="!selectedDivision">
            <div class="flex items-center justify-between mb-8">
               <div>
                  <button @click="selectedEventCode = null" class="mb-2 text-blue-600 hover:underline flex items-center gap-2 font-medium">
                    ← Back to All Events
                  </button>
                  <h1 class="text-3xl font-bold text-gray-900">{{ formatEventName(selectedEventCode) }}</h1>
               </div>
               <span class="font-mono text-2xl text-gray-200 font-bold">{{ selectedEventCode }}</span>
            </div>

            <div v-if="currentEventData" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div 
                v-for="divGroup in currentEventData.divisions" 
                :key="divGroup.division"
                @click="selectedDivision = divGroup.division"
                class="bg-white p-6 rounded-lg shadow border border-gray-100 cursor-pointer hover:shadow-md hover:border-blue-300 transition group relative"
              >
                <div class="flex flex-col h-full">
                  <div class="flex justify-between items-start mb-4">
                    <h3 class="font-bold text-lg text-gray-800 group-hover:text-blue-600">{{ divGroup.division }}</h3>
                    <span class="text-xs font-bold px-2 py-1 rounded bg-blue-50 text-blue-700">
                      {{ divGroup.count }} Entries
                    </span>
                  </div>
                  
                  <div class="mt-auto">
                    <div v-if="divGroup.entryCode" class="flex items-center gap-2">
                       <span class="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Prefix</span>
                       <span 
                         class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-mono cursor-pointer hover:bg-blue-200"
                         @click.stop="promptEntryCode(divGroup.division)"
                       >
                         {{ divGroup.entryCode }}
                       </span>
                    </div>
                    <div v-else @click.stop="promptEntryCode(divGroup.division)" class="text-xs text-gray-400 italic hover:text-blue-500">
                      Set Entry Code
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- View C: Division Detail (Participants List) -->
          <div v-else>
            <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
               <div>
                  <button @click="selectedDivision = null" class="mb-2 text-blue-600 hover:underline flex items-center gap-2 font-medium">
                    ← Back to {{ formatEventName(selectedEventCode) }}
                  </button>
                  <div class="flex items-center gap-4">
                    <h1 class="text-3xl font-bold text-gray-900">{{ selectedDivision }}</h1>
                    <span 
                      v-if="selectedDivisionData?.entryCode"
                      class="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full font-mono cursor-pointer hover:bg-blue-200"
                      @click="promptEntryCode(selectedDivision)"
                    >
                      Entry Code: {{ selectedDivisionData.entryCode }}
                    </span>
                  </div>
               </div>
               <div class="text-right">
                  <div class="text-xs text-gray-400 uppercase font-bold tracking-widest mb-1">{{ selectedEventCode }}</div>
                  <div class="text-2xl font-bold text-gray-300">{{ formatEventName(selectedEventCode) }}</div>
               </div>
            </div>

            <div v-if="selectedDivisionData && selectedDivisionData.participants.length > 0" class="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
               <table class="w-full text-sm text-left">
                  <thead class="bg-gray-50 text-gray-500 border-b">
                    <tr>
                      <th class="px-6 py-4 font-bold uppercase tracking-wider w-40">Entry Code</th>
                      <th class="px-6 py-4 font-bold uppercase tracking-wider">Participant Name</th>
                      <th class="px-6 py-4 font-bold uppercase tracking-wider">Team</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                    <tr v-for="g in currentDivisionGrouped" :key="g.id" class="hover:bg-blue-50/50 transition-colors">
                      <td class="px-6 py-4 font-mono font-bold text-blue-600 bg-blue-50/30">
                        {{ g.code }}
                      </td>
                      <td class="px-6 py-4 text-gray-800 font-semibold uppercase whitespace-pre-line">{{ g.name }}</td>
                      <td class="px-6 py-4 text-gray-600 uppercase">{{ g.team }}</td>
                    </tr>
                  </tbody>
               </table>
            </div>
            <div v-else class="p-20 text-center bg-white rounded-lg border border-dashed border-gray-300">
               <div class="text-gray-400 italic text-lg">
                 No participants found for this division.
               </div>
            </div>
          </div>
        </div>

        <!-- ================= SUMMARY TAB ================= -->
        <div v-else-if="activeTab === 'summary'">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <h2 class="text-2xl font-bold text-gray-800">Participant Summary</h2>
            <div class="flex items-center gap-4">
              <div class="bg-blue-600 text-white px-6 py-3 rounded-xl shadow-lg flex flex-col items-center">
                <span class="text-xs uppercase font-bold tracking-widest opacity-80">Total Participants</span>
                <span class="text-3xl font-black mt-1">{{ totalUniqueParticipants }}</span>
              </div>
            </div>
          </div>

          <!-- Search Bar -->
          <div class="bg-white p-4 rounded-xl shadow-sm border mb-6 flex items-center gap-3">
             <span class="text-2xl">🔍</span>
             <input 
               v-model="searchQuery"
               placeholder="Search by Name, Team, or Event..."
               class="flex-1 bg-transparent border-none focus:ring-0 text-lg text-gray-700"
             />
             <button v-if="searchQuery" @click="searchQuery = ''" class="text-gray-400 hover:text-gray-600 px-2">✕ Clear</button>
          </div>

          <div class="bg-white rounded-xl shadow border overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-sm text-left">
                <thead class="bg-gray-50 text-gray-500 border-b">
                  <tr>
                    <th class="px-6 py-4 font-bold uppercase tracking-wider">Code</th>
                    <th class="px-6 py-4 font-bold uppercase tracking-wider">Participant Name</th>
                    <th class="px-6 py-4 font-bold uppercase tracking-wider">Team</th>
                    <th class="px-6 py-4 font-bold uppercase tracking-wider">Event / Division</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="p in filteredSummary" :key="p.id" class="hover:bg-blue-50/50 transition-colors">
                    <td class="px-6 py-4 font-mono font-bold text-blue-600">
                      {{ p.code }}
                    </td>
                    <td class="px-6 py-4 text-gray-900 font-semibold uppercase whitespace-pre-line">
                      {{ p.names }}
                    </td>
                    <td class="px-6 py-4 text-gray-600 uppercase font-medium">
                      {{ p.team }}
                    </td>
                    <td class="px-6 py-4">
                      <div class="flex flex-col">
                        <span class="text-gray-800 font-medium">{{ p.fullEventName }}</span>
                        <span class="text-xs text-blue-500 font-bold uppercase mt-1">{{ p.division }}</span>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="filteredSummary.length === 0">
                    <td colspan="4" class="px-6 py-20 text-center text-gray-400 italic">
                      No participants found matching your search.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useNamelistStore } from '@/stores/namelist'
import type { Participant } from '@/config/defaults'

const store = useNamelistStore()

// Navigation State
const activeTab = ref<'teams' | 'events' | 'summary'>('teams') // Default to Teams
const selectedEventCode = ref<string | null>(null)
const selectedTeamName = ref<string | null>(null)
const selectedDivision = ref<string | null>(null)
const expandedDivisions = ref<Record<string, boolean>>({})
const searchQuery = ref('')

// --- Watchers ---
// Reset expansion and division when switching events
watch(selectedEventCode, () => {
  expandedDivisions.value = {}
  selectedDivision.value = null
})

// --- Helpers ---

function formatEventName(code: string | null) {
  if (!code) return ''
  const evt = store.events.find(e => e.code === code)
  return evt ? evt.name : code
}

function getParticipantCountForEvent(eventCode: string) {
  return store.participants.filter(p => p.eventCode === eventCode).length
}

// getEntryIndex and getEntryCode moved to store for shared use

// --- Computed Data ---

const currentEventData = computed(() => {
  if (!selectedEventCode.value) return null
  return store.hierarchy.find(h => h.event.code === selectedEventCode.value)
})

const selectedDivisionData = computed(() => {
  if (!selectedEventCode.value || !selectedDivision.value || !currentEventData.value) return null
  return currentEventData.value.divisions.find(d => d.division === selectedDivision.value)
})

const selectedTeamParticipants = computed(() => {
  if (!selectedTeamName.value) return []
  const team = store.teams.find(t => t.name === selectedTeamName.value)
  return team ? team.participants : []
})

const groupedTeamParticipants = computed(() => {
  const parts = selectedTeamParticipants.value
  const groups: Record<string, { code: string, participants: Participant[], id: string }> = {}

  parts.forEach(p => {
    // USE groupId if it exists (for teams), otherwise use unique participant id (for individuals)
    const groupKey = p.groupId || p.id
    const code = store.getParticipantEntryCode(p)
    
    if (!groups[groupKey]) {
      groups[groupKey] = { code, participants: [], id: p.id }
    }
    groups[groupKey].participants.push(p)
  })

  return Object.values(groups).map(g => ({
    code: g.code,
    name: g.participants.map(p => p.name).join('\n'),
    eventCode: g.participants[0]?.eventCode || '',
    division: g.participants[0]?.division || '',
    id: g.id
  }))
})

const currentDivisionGrouped = computed(() => {
  if (!selectedDivisionData.value) return []
  const parts = selectedDivisionData.value.participants
  const groups: Record<string, { code: string, participants: Participant[], id: string }> = {}

  parts.forEach(p => {
    const groupKey = p.groupId || p.id
    const code = store.getParticipantEntryCode(p)
    if (!groups[groupKey]) {
      groups[groupKey] = { code, participants: [], id: p.id }
    }
    groups[groupKey].participants.push(p)
  })

  return Object.values(groups).map(g => ({
    code: g.code,
    name: g.participants.map(p => p.name).join('\n'),
    team: g.participants[0]?.team || '',
    id: g.id
  }))
})

// Global Summary Data
const filteredSummary = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  
  // Group them first to handle pairs/teams
  const groups: Record<string, { code: string, participants: Participant[], id: string }> = {}
  store.participants.forEach(p => {
    const key = p.groupId || p.id
    if (!groups[key]) {
      groups[key] = {
        code: store.getParticipantEntryCode(p),
        participants: [],
        id: p.id
      }
    }
    groups[key].participants.push(p)
  })

  const allEntries = Object.values(groups).map(g => {
    const p0 = g.participants[0]
    return {
      id: g.id,
      code: g.code,
      names: g.participants.map(p => p.name).join('\n'),
      team: p0?.team || 'INDEPENDENT',
      eventCode: p0?.eventCode || '',
      division: p0?.division || '',
      fullEventName: formatEventName(p0?.eventCode || null)
    }
  })

  // SORT: By Event Order then Division Order (from Config)
  allEntries.sort((a, b) => {
    const eventIndexA = store.events.findIndex(e => e.code === a.eventCode)
    const eventIndexB = store.events.findIndex(e => e.code === b.eventCode)
    if (eventIndexA !== eventIndexB) return eventIndexA - eventIndexB

    const divIndexA = store.divisions.findIndex(d => d.name === a.division)
    const divIndexB = store.divisions.findIndex(d => d.name === b.division)
    return divIndexA - divIndexB
  })

  if (!query) return allEntries

  return allEntries.filter(e => 
    e.names.toLowerCase().includes(query) ||
    e.team.toLowerCase().includes(query) ||
    e.eventCode.toLowerCase().includes(query) ||
    e.fullEventName.toLowerCase().includes(query)
  )
})

const totalUniqueParticipants = computed(() => {
    // Count unique names regardless of event entries
    const uniqueNames = new Set<string>()
    store.participants.forEach(p => {
        // Split by newline or comma
        const names = p.name.split(/[\r\n,]+/)
        names.forEach(n => {
            const clean = n.trim()
            if (clean && clean.length > 1) {
                uniqueNames.add(clean)
            }
        })
    })
    return uniqueNames.size
})

// --- Actions ---

function toggleDivision(division: string) {
  expandedDivisions.value[division] = !expandedDivisions.value[division]
}

function promptEntryCode(division: string) {
  const code = prompt(`Enter Prefix for ${division} (Event: ${selectedEventCode.value}):`)
  if (code !== null) {
    store.setEntryCode(selectedEventCode.value!, division, code.toUpperCase())
  }
}

function wipeData() {
  if (confirm('ARE YOU SURE?\n\nThis will DELETE ALL imported participants.\n(Codes and Settings will be kept).')) {
    store.wipeAllData()
  }
}

function confirmDeleteTeam() {
  if (!selectedTeamName.value) return
  if (confirm(`ARE YOU SURE?\n\nThis will delete all participants belonging to "${selectedTeamName.value}".`)) {
    store.deleteTeam(selectedTeamName.value)
    selectedTeamName.value = null // Go back to list
  }
}
</script>
