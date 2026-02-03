<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNamelistStore } from '@/stores/namelist'

const router = useRouter()
const store = useNamelistStore()

// State
const showModal = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const formDate = ref(new Date().toISOString().split('T')[0])

const sortedCompetitions = computed(() => {
    return [...store.savedCompetitions].sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0
        const dateB = b.date ? new Date(b.date).getTime() : 0
        return dateB - dateA
    })
})

const handleEnter = (id: string) => {
    store.loadCompetition(id)
    router.push('/dashboard')
}

const openCreateModal = () => {
    isEditing.value = false
    editingId.value = null
    formName.value = ''
    formDate.value = new Date().toISOString().split('T')[0]
    showModal.value = true
}

const openEditModal = (comp: any) => {
    isEditing.value = true
    editingId.value = comp.id
    formName.value = comp.name
    formDate.value = comp.date || new Date().toISOString().split('T')[0]
    showModal.value = true
}

const closeModal = () => {
    showModal.value = false
}

const handleSave = () => {
    if (!formName.value.trim()) return

    if (isEditing.value && editingId.value) {
        // Update Existing
        store.updateCompetitionMetadata(editingId.value, {
            name: formName.value.trim(),
            date: formDate.value,
            lastModified: new Date().toISOString()
        })
    } else {
        // Create New
        const id = store.createCompetition(formName.value.trim(), formDate.value)
        if (!isEditing.value) {
             store.loadCompetition(id)
             router.push('/dashboard')
             return 
        }
    }
    closeModal()
}

const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?\nThis cannot be undone.`)) {
        store.deleteCompetition(id)
    }
}

// Format Date helper
const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    })
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col py-12 px-4 sm:px-6 lg:px-8">
      
    <div class="max-w-6xl mx-auto w-full z-10 relative">
        <div class="text-center mb-12">
            <h1 class="text-4xl font-black text-gray-900 mb-2 tracking-tight">Competition Manager</h1>
            <p class="text-lg text-gray-500">Select a workspace to begin.</p>
        </div>

        <!-- Toolbar -->
        <div class="flex justify-end items-center mb-6">
            <button @click="openCreateModal" class="px-5 py-2 bg-gray-900 text-white font-bold rounded-lg shadow hover:bg-black transition-all flex items-center gap-2 text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                New Competition
            </button>
        </div>

        <!-- Competition List (Table Style) -->
        <div class="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
            <div v-if="sortedCompetitions.length > 0">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-16">No.</th>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-1/2">Name</th>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Competition Date</th>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Last Modified</th>
                            <th scope="col" class="relative px-6 py-3">
                                <span class="sr-only">Actions</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        <tr v-for="(comp, index) in sortedCompetitions" :key="comp.id" class="hover:bg-gray-50 transition-colors group cursor-pointer" @click="handleEnter(comp.id)">
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-bold">
                                {{ index + 1 }}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <div class="text-base font-bold text-gray-900">{{ comp.name }}</div>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                    {{ comp.date || 'No Date' }}
                                </span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {{ formatDate(comp.lastModified) }}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button @click.stop="handleEnter(comp.id)" class="text-indigo-600 hover:text-indigo-900 font-bold mr-4">Open</button>
                                <button @click.stop="openEditModal(comp)" class="text-blue-600 hover:text-blue-900 font-bold mr-4">Edit</button>
                                <button @click.stop="handleDelete(comp.id, comp.name)" class="text-gray-400 hover:text-red-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div v-else class="text-center py-20">
                 <div class="text-5xl mb-4 grayscale opacity-20">📂</div>
                 <p class="text-gray-500 font-medium">No competitions found.</p>
            </div>
        </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
        <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md transform transition-all scale-100">
            <h2 class="text-xl font-bold text-gray-900 mb-6">{{ isEditing ? 'Edit Competition' : 'Create New Competition' }}</h2>
            
            <div class="space-y-4 mb-6">
                <div>
                    <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">Competition Name</label>
                    <input 
                        v-model="formName" 
                        class="w-full text-base p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" 
                        placeholder="e.g. National Championship 2026"
                        autofocus
                    />
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">Competition Date</label>
                    <input 
                        type="date"
                        v-model="formDate" 
                        @keyup.enter="handleSave"
                        class="w-full text-base p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" 
                    />
                </div>
            </div>

            <div class="flex justify-end gap-3">
                <button @click="closeModal" class="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded transition-colors text-sm">Cancel</button>
                <button @click="handleSave" class="px-4 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 shadow-md transition-all text-sm">
                    {{ isEditing ? 'Save Changes' : 'Create & Open' }}
                </button>
            </div>
        </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes blob {
  0% { transform: translate(0px, 0px) scale(1); }
  33% { transform: translate(30px, -50px) scale(1.1); }
  66% { transform: translate(-20px, 20px) scale(0.9); }
  100% { transform: translate(0px, 0px) scale(1); }
}
.animate-blob {
  animation: blob 7s infinite;
}
.animation-delay-2000 {
  animation-delay: 2s;
}
.animation-delay-4000 {
  animation-delay: 4s;
}
</style>
