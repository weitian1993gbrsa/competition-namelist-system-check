<template>
  <div class="p-8 max-w-4xl mx-auto">
    <div class="flex items-center gap-4 mb-8">
      <router-link to="/" class="text-blue-600 hover:underline">← Back to Dashboard</router-link>
      <h1 class="text-3xl font-bold text-gray-800">Settings</h1>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <!-- Events Manager -->
      <div class="bg-white p-6 rounded-lg shadow-sm border">
        <h2 class="text-xl font-bold mb-4 text-gray-800">Events Config</h2>
        <ul class="space-y-2 mb-4 max-h-[400px] overflow-y-auto">
          <li 
            v-for="(evt, idx) in store.events" 
            :key="evt.code" 
            class="flex justify-between items-center bg-gray-50 p-2 rounded cursor-pointer hover:bg-gray-100 transition-colors border-2 border-transparent"
            :class="{ 'border-blue-500 bg-blue-50': selectedEventCode === evt.code }"
            draggable="true"
            @dragstart="onDragStart(idx)"
            @dragover.prevent
            @drop="onDrop(idx)"
            @click="selectedEventCode = evt.code"
          >
            <div class="flex items-center overflow-hidden">
              <span class="text-gray-400 mr-2 cursor-move">⋮⋮</span>
              <div class="flex flex-col truncate">
                <div class="flex items-center">
                  <span class="font-mono font-bold text-sm mr-2">{{ evt.code }}</span>
                  <span 
                    class="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase"
                    :class="getValidDivCount(evt) > 0 ? 'bg-amber-100 text-amber-700 bubble' : 'bg-emerald-100 text-emerald-700'"
                  >
                    {{ getValidDivCount(evt) > 0 ? `${getValidDivCount(evt)} Divs` : 'All' }}
                  </span>
                </div>
                <span class="text-xs text-gray-500 truncate">{{ evt.name }}</span>
              </div>
            </div>
            <button @click.stop="removeEvent(idx)" class="text-red-400 hover:text-red-600 p-1">×</button>
          </li>
        </ul>
        <div class="flex gap-2">
          <input v-model="newEventCode" placeholder="Code (e.g. SRSS)" class="w-24 p-2 border rounded" />
          <input v-model="newEventName" placeholder="Event Name" class="flex-1 p-2 border rounded" />
          <button @click="addEvent" class="px-4 bg-blue-600 text-white rounded">+</button>
        </div>
      </div>

      <!-- Divisions Manager -->
      <div class="bg-white p-6 rounded-lg shadow-sm border">
        <h2 class="text-xl font-bold mb-4 text-gray-800">Divisions Config</h2>
        <ul class="space-y-2 mb-4 max-h-[400px] overflow-y-auto">
          <li 
            v-for="(div, idx) in store.divisions" 
            :key="div.name" 
            class="flex justify-between items-center bg-gray-50 p-2 rounded cursor-move hover:bg-gray-100 transition-colors"
            draggable="true"
            @dragstart="onDragStartDivision(idx)"
            @dragover.prevent
            @drop="onDropDivision(idx)"
          >
            <div class="flex items-center flex-1 min-w-0">
              <span class="text-gray-400 mr-2 flex-shrink-0">⋮⋮</span>
              <span class="text-sm font-medium truncate">{{ div.name }}</span>
            </div>
            <div class="flex items-center gap-1">
              <button @click="renameDivision(idx)" class="text-blue-400 hover:text-blue-600 p-1 text-xs" title="Rename Division">✎</button>
              <button @click="removeDivision(idx)" class="text-red-400 hover:text-red-600 p-1" title="Delete Division">×</button>
            </div>
          </li>
        </ul>
        <div class="flex gap-2">
          <input v-model="newDivisionName" placeholder="Division Name" class="flex-1 p-2 border rounded" />
          <button @click="addDivision" class="px-4 bg-blue-600 text-white rounded">+</button>
        </div>
      </div>
    </div>

    <!-- Division Restrictions -->
    <div v-if="selectedEventCode" class="mt-8 bg-blue-50 p-6 rounded-xl border border-blue-200 shadow-sm transition-all">
      <div class="flex justify-between items-start mb-6">
        <div>
          <h2 class="text-xl font-bold text-gray-800 flex items-center gap-2">
            Restriction Setup: 
            <span class="font-mono text-blue-600 px-2 py-1 bg-white rounded border text-lg">{{ selectedEventCode }}</span>
          </h2>
          <p class="text-sm text-gray-500 mt-1">Uncheck divisions to hide them for this specific event.</p>
        </div>
        <button 
          @click="selectedEventCode = ''" 
          class="bg-white px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 border shadow-sm transition-all"
        >
          Done
        </button>
      </div>
      
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        <label 
          v-for="(div, idx) in store.divisions" 
          :key="div.name" 
          class="group flex items-center justify-between p-3 bg-white rounded-lg border-2 cursor-pointer transition-all shadow-sm"
          :class="isDivisionAllowed(div.name) ? 'border-emerald-500 bg-emerald-50/30' : 'border-gray-200 opacity-60'"
        >
          <div class="flex items-center">
            <input 
              type="checkbox" 
              :checked="isDivisionAllowed(div.name)"
              @change="toggleDivision(div.name)"
              class="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 transition-all cursor-pointer"
            />
            <span class="ml-3 text-sm font-semibold text-gray-700 group-hover:text-blue-700 transition-colors">{{ div.name }}</span>
          </div>
          
          <div 
             @click.prevent.stop="editDivisionPrefix(idx)"
             class="bg-white border-2 border-blue-100 text-blue-800 text-xs px-3 py-1.5 rounded-lg font-mono font-bold hover:border-blue-400 hover:text-blue-600 transition-all shadow-sm min-w-[3rem] text-center"
             title="Edit Prefix"
          >
             {{ store.getEntryCode(selectedEventCode, div.name) || '...' }}
          </div>
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useNamelistStore } from '@/stores/namelist'

const store = useNamelistStore()
const selectedEventCode = ref('')
const newEventCode = ref('')
const newEventName = ref('')
const newDivisionName = ref('')

function isDivisionAllowed(divName: string) {
  const evt = store.events.find(e => e.code === selectedEventCode.value)
  if (!evt) return true
  // If undefined or empty, it means "All Allowed"
  if (!evt.allowedDivisions || evt.allowedDivisions.length === 0) return true
  return evt.allowedDivisions.includes(divName)
}

function getValidDivCount(evt: any) {
  if (!evt.allowedDivisions || evt.allowedDivisions.length === 0) return 0
  const validNames = new Set(store.divisions.map(d => d.name))
  return evt.allowedDivisions.filter((name: string) => validNames.has(name)).length
}

function toggleDivision(divName: string) {
  const evt = store.events.find(e => e.code === selectedEventCode.value)
  if (!evt) return
  
  // If it's the first time toggling, initialize with all divisions
  if (!evt.allowedDivisions) {
    evt.allowedDivisions = store.divisions.map(d => d.name)
  }
  
  const index = evt.allowedDivisions.indexOf(divName)
  if (index === -1) {
    evt.allowedDivisions.push(divName)
  } else {
    // Cannot uncheck if it's the last one? 
    // Actually, letting them uncheck all is fine, it just means no divisions for that event.
    evt.allowedDivisions.splice(index, 1)
  }
}

function addEvent() {
  if (newEventCode.value && newEventName.value) {
    store.events.push({ code: newEventCode.value, name: newEventName.value })
    newEventCode.value = ''
    newEventName.value = ''
  }
}

function removeEvent(index: number) {
  const evt = store.events[index]
  if (evt && evt.code === selectedEventCode.value) selectedEventCode.value = ''
  store.events.splice(index, 1)
}

function addDivision() {
  if (newDivisionName.value) {
    const exists = store.divisions.some(d => d.name.toLowerCase() === newDivisionName.value.trim().toLowerCase())
    if (exists) {
        alert("A division with this name already exists.")
        return
    }

    store.divisions.push({ 
      name: newDivisionName.value.trim(), 
      prefix: '' // Default to empty prefix
    })
    newDivisionName.value = ''
  }
}

function removeDivision(index: number) {
  const div = store.divisions[index]
  if (div && confirm(`Are you sure you want to delete "${div.name}"?\n\nThis will remove it from all event settings and unassign any participants currently in this division.`)) {
    store.deleteDivision(div.name)
  }
}

function renameDivision(index: number) {
  const div = store.divisions[index]
  if (!div) return

  const newName = prompt(`Rename division "${div.name}" to:`, div.name)
  if (newName && newName.trim() && newName.trim() !== div.name) {
    const exists = store.divisions.some(d => d.name.toLowerCase() === newName.trim().toLowerCase())
    if (exists) {
        alert("A division with this name already exists.")
        return
    }
    store.renameDivision(div.name, newName.trim())
  }
}

function editDivisionPrefix(index: number) {
  const div = store.divisions[index]
  if (!div || !selectedEventCode.value) return 

  const currentPrefix = store.getEntryCode(selectedEventCode.value, div.name)
  const newPrefix = prompt(`Enter new Prefix for ${div.name} (Event: ${selectedEventCode.value}):`, currentPrefix)
  
  if (newPrefix !== null) {
    store.setEntryCode(selectedEventCode.value, div.name, newPrefix.toUpperCase())
  }
}

// Drag and Drop Logic for Events
const draggedEventIndex = ref<number | null>(null)

function onDragStart(index: number) {
  draggedEventIndex.value = index
}

function onDrop(index: number) {
  if (draggedEventIndex.value !== null && draggedEventIndex.value !== index) {
    const item = store.events.splice(draggedEventIndex.value, 1)[0]
    if (item) store.events.splice(index, 0, item)
  }
  draggedEventIndex.value = null
}

// Drag and Drop Logic for Divisions
const draggedDivisionIndex = ref<number | null>(null)

function onDragStartDivision(index: number) {
  draggedDivisionIndex.value = index
}

function onDropDivision(index: number) {
  if (draggedDivisionIndex.value !== null && draggedDivisionIndex.value !== index) {
    const item = store.divisions.splice(draggedDivisionIndex.value, 1)[0]
    if (item) store.divisions.splice(index, 0, item)
  }
  draggedDivisionIndex.value = null
}
</script>
