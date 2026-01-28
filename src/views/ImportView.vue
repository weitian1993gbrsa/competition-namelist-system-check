<template>
  <div class="p-6 max-w-4xl mx-auto">
    <h1 class="text-2xl font-bold mb-6 text-gray-800">Import Namelist</h1>

    <!-- Upload Section -->
    <div 
      class="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center hover:bg-gray-50 transition-colors cursor-pointer"
      @dragover.prevent
      @drop.prevent="handleDrop"
      @click="triggerFileInput"
    >
      <div v-if="selectedFiles.length === 0" class="text-gray-500">
        <p class="text-lg font-medium">Drag and drop Excel files here</p>
        <p class="text-sm mt-2">or click to browse (Select Multiple)</p>
      </div>
      <div v-else class="text-emerald-600 font-medium">
        <p>Selected {{ selectedFiles.length }} file(s):</p>
        <p class="text-xs text-gray-500 mt-1 max-w-md mx-auto truncate">
          {{ selectedFiles.map(f => f.name).join(', ') }}
        </p>
        <button @click.stop="resetFile" class="text-sm text-red-500 hover:underline mt-2">Clear Selection</button>
      </div>
      <input 
        type="file" 
        ref="fileInput" 
        class="hidden" 
        accept=".xlsx, .xls, .csv" 
        multiple
        @change="handleFileSelect" 
      />
    </div>

    <!-- Mapping Section -->
    <div v-if="jsonData.length > 0" class="mt-8">
      <h2 class="text-xl font-semibold mb-4 text-gray-700">Map Columns</h2>
      <p class="text-sm text-gray-500 mb-4">Please verify the columns match the required fields.</p>

      <div class="overflow-x-auto border rounded-lg shadow-sm">
        <table class="w-full text-sm text-left">
          <thead class="bg-gray-100 text-gray-700">
            <tr>
              <th v-for="(header, index) in headers" :key="index" class="p-2 border-b min-w-[150px]">
                <div class="mb-2 font-mono text-xs text-gray-500">{{ header }}</div>
                <select 
                  v-model="mappings[header]" 
                  class="w-full p-1 border rounded bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">(Ignore)</option>
                  <option value="name">Name / Participant</option>
                  <option value="team">Team / School</option>
                  <option value="eventCode">Event Code</option>
                  <option value="division">Division</option>
                </select>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rIndex) in previewData" :key="rIndex" class="border-b hover:bg-gray-50">
              <td v-for="(header, cIndex) in headers" :key="cIndex" class="p-2 truncate max-w-[150px]">
                {{ row[header] }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-6 flex justify-end gap-3">
        <button @click="resetFile" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
        <button 
          @click="processImport" 
          class="px-6 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50"
          :disabled="!isValidMapping"
        >
          Confirm Import
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import * as XLSX from 'xlsx'
import { useRouter } from 'vue-router'
import { useNamelistStore } from '@/stores/namelist'
import type { Participant } from '@/config/defaults'

const router = useRouter()
const store = useNamelistStore()
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFiles = ref<File[]>([])
const jsonData = ref<any[]>([])
const headers = ref<string[]>([])
const mappings = ref<Record<string, string>>({})
const fileMerges = ref<Record<string, XLSX.Range[]>>({}) // FileName -> Merges from first sheet

const previewData = computed(() => jsonData.value.slice(0, 5))

// Simple UUID generator since we didn't install uuid package
function generateId() {
  return Math.random().toString(36).substring(2, 15)
}

function triggerFileInput() {
  fileInput.value?.click()
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files) {
    readFiles(Array.from(target.files))
  }
}

function handleDrop(event: DragEvent) {
  if (event.dataTransfer?.files) {
    readFiles(Array.from(event.dataTransfer.files))
  }
}

async function readFiles(files: File[]) {
  selectedFiles.value = files
  const allRows: any[] = []
  let globalHeaders: string[] = []
  const mergesMap: Record<string, XLSX.Range[]> = {}

  for (const f of files) {
    const data = await f.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(data), { type: 'array' })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) continue

    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    
    mergesMap[f.name] = (ws['!merges'] || []) as XLSX.Range[]

    const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
    if (!rawData || rawData.length === 0) continue

    // Find header
    const headerIndex = rawData.findIndex(row => 
      row.some(cell => {
        const s = String(cell || '').toLowerCase()
        return s.includes('name') || s.includes('participant') || s.includes('division')
      })
    )

    const finalHeaderIndex = headerIndex !== -1 ? headerIndex : 0
    const currentHeaders = (rawData[finalHeaderIndex] || []).map(h => String(h || '').trim())
    
    if (globalHeaders.length === 0) globalHeaders = currentHeaders

    const rows = rawData.slice(finalHeaderIndex + 1).map((row, idx) => {
      const obj: any = { 
        __sheetRowIndex: finalHeaderIndex + 1 + idx,
        __fileName: f.name
      } 
      currentHeaders.forEach((h, i) => {
        if (h) obj[h] = row[i]
      })
      return obj
    })
    
    allRows.push(...rows)
  }

  headers.value = globalHeaders
  jsonData.value = allRows
  fileMerges.value = mergesMap
  autoMapColumns(globalHeaders)
}

function autoMapColumns(headers: string[]) {
  const map: Record<string, string> = {}
  headers.forEach(h => {
    const lower = h.toLowerCase()
    if (['name', 'participant', 'student', 'athlete'].some(k => lower.includes(k))) map[h] = 'name'
    else if (['team', 'school', 'club'].some(k => lower.includes(k))) map[h] = 'team'
    else if (['event', 'code', 'category'].some(k => lower.includes(k))) map[h] = 'eventCode'
    else if (['division', 'age', 'group'].some(k => lower.includes(k))) map[h] = 'division'
  })
  mappings.value = map
}

const isValidMapping = computed(() => {
  const values = Object.values(mappings.value)
  return values.includes('name') && values.includes('eventCode') && values.includes('division')
})

function resetFile() {
  selectedFiles.value = []
  jsonData.value = []
  headers.value = []
  mappings.value = {}
  fileMerges.value = {}
  if (fileInput.value) fileInput.value.value = ''
}

function processImport() {
  // Clear existing or append? Let's append by default but maybe we should ask.
  // We use upsert to allow re-ordering of updated items.
  
  const processedBatch: Participant[] = []
  const processedIds = new Set<string>() // To avoid duplicates within the single import batch
  let addedCount = 0
  let updatedCount = 0

  // State for merged cell logic
  let lastValues = {
    eventCode: '',
    division: '',
    team: '',
    groupId: ''
  }

  const unknownDivisions = new Set<string>()

  // Find column indices in the sheet (merges are by coordinate)
  const headerKeys = headers.value
  const divHeader = Object.keys(mappings.value).find(k => mappings.value[k] === 'division') || ''
  const divColIdx = headerKeys.indexOf(divHeader)
  
  jsonData.value.forEach((row: any) => {
    // sheetRowIndex is 0-indexed absolute sheet row
    const sheetRowIndex = row.__sheetRowIndex
    
    // 1. Extract raw values
    let currentEvent = ''
    let currentDivision = ''
    let currentTeam = ''
    let currentName = ''

    for (const [header, field] of Object.entries(mappings.value)) {
      const val = row[header] ? String(row[header]).trim() : ''
      if (field === 'eventCode') currentEvent = val
      if (field === 'division') currentDivision = val
      if (field === 'team') currentTeam = val
      if (field === 'name') currentName = val
    }

    if (!currentName) return // Skip rows with no name

    // 2. Precision Merged Cell Logic
    // Check if the Division cell in this row is part of an EXPLICIT Excel merge in ITS sheet
    const currentFileMerges = fileMerges.value[row.__fileName] || []
    const activeMerge = currentFileMerges.find((m: XLSX.Range) => 
      sheetRowIndex >= m.s.r && sheetRowIndex <= m.e.r && 
      divColIdx >= m.s.c && divColIdx <= m.e.c
    )

    let finalGroupId = ''
    
    if (activeMerge) {
      // It is part of a merge.
      if (currentDivision) {
        // This is the row that has the text for the merge
        lastValues.division = currentDivision
        lastValues.eventCode = currentEvent || lastValues.eventCode
        lastValues.team = currentTeam || lastValues.team
        // Create a unique groupId based on file name and top-left coordinate
        lastValues.groupId = `GRP_${row.__fileName}_${activeMerge.s.r}_${activeMerge.s.c}`
      }
      
      // Use the "sticky" values for the entire merge range
      currentDivision = currentDivision || lastValues.division
      currentEvent = currentEvent || lastValues.eventCode
      currentTeam = currentTeam || lastValues.team
      finalGroupId = lastValues.groupId
    } else {
      // NOT a merged cell. This is an individual entry.
      // We do NOT use any sticky groupId. We keep it empty.
      finalGroupId = '' 
      // Reset sticky values so they don't leak into unrelated individual rows
      lastValues.division = currentDivision
      lastValues.eventCode = currentEvent
      lastValues.team = currentTeam
    }

    const finalEvent = (currentEvent || lastValues.eventCode).toUpperCase()
    const finalDivision = currentDivision || lastValues.division
    const finalTeam = (currentTeam || lastValues.team || 'INDEPENDENT').toUpperCase()

    // Check if division exists in config
    const matchedDiv = store.divisions.find(d => d.name.toUpperCase() === finalDivision.toUpperCase())
    if (!matchedDiv && finalDivision) {
        unknownDivisions.add(finalDivision)
    }

    if (currentName && finalEvent && finalDivision) {
       // Create temp object to check against store
       const temp: Participant = { 
         id: generateId(), 
         name: currentName.toUpperCase(),
         eventCode: finalEvent,
         division: finalDivision,
         team: finalTeam,
         groupId: finalGroupId,
         notes: '' 
       }
       
       if (matchedDiv) temp.division = matchedDiv.name

       const existing = store.participants.find(existing => 
         existing.name.toLowerCase() === temp.name.toLowerCase() &&
         existing.eventCode === temp.eventCode &&
         existing.division === temp.division
       )

       if (existing) {
         // Update existing
         existing.team = temp.team
         existing.groupId = temp.groupId
         
         if (!processedIds.has(existing.id)) {
            processedBatch.push(existing)
            processedIds.add(existing.id)
            updatedCount++
         }
       } else {
         // Add new
         // Ensure we don't duplicate newly created items if file has dupes (though logical dupes are kept distinct here as they have diff IDs)
         // But logic dictates standard new addition.
         processedBatch.push(temp)
         processedIds.add(temp.id)
         addedCount++
       }
    }
  })

  // Final confirmation if there are unknown divisions
  if (unknownDivisions.size > 0) {
      const list = Array.from(unknownDivisions).join(', ')
      if (!confirm(`⚠️ WARNING: The following divisions in your file are NOT in your configuration:\n\n${list}\n\nThey will be imported as-is but might not show up correctly in filtered views. Proceed anyway?`)) {
          return
      }
  }

  // Batch Upsert
  // This will remove the processed items from their old spots and append them to the end, effectively reordering them.
  if (processedBatch.length > 0) {
      store.upsertParticipants(processedBatch)
  }
  
  let msg = `Import Processed.`
  if (addedCount > 0) msg += `\n- Added: ${addedCount}`
  if (updatedCount > 0) msg += `\n- Updated/Moved: ${updatedCount}`
  
  alert(msg)
  router.push('/')
}
</script>
