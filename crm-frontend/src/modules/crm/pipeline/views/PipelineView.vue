<template>
  <div class="page pipeline-page">
    <div class="pipeline-shell">
      <div class="pipeline-toolbar">
        <div class="pipeline-title-block">
          <p class="eyebrow">Logistica</p>
          <div class="title-row">
            <h1>Negociacoes</h1>
            <span class="badge subtle">Fluxo geral</span>
          </div>
          <p class="muted">Organize pedidos, acompanhe valores e mova cards entre etapas.</p>
        </div>
        <div class="pipeline-actions">
          <div class="search-input">
            <input class="input dark" type="text" placeholder="Buscar pedido, cliente ou etapa" />
          </div>
          <div class="action-buttons">
            <button class="icon-pill" type="button" title="Filtrar">&#9776;</button>
            <button class="btn primary" type="button" @click="addColumn">Nova coluna</button>
          </div>
        </div>
      </div>

      <div v-if="loading" class="empty-state board-empty">
        <strong>Carregando pipeline...</strong>
        <p class="muted">Buscando etapas e cards.</p>
      </div>
      <div v-else-if="error" class="empty-state board-empty">
        <strong>Falha ao carregar</strong>
        <p class="muted">{{ error }}</p>
      </div>
      <div v-else class="pipeline-grid">
        <section
          v-for="stage in stages"
          :key="stage.key"
          class="pipeline-col"
          @dragover.prevent
          @drop.prevent="dropOn(stage.key)"
        >
          <div class="col-head">
            <div>
              <div class="col-title">
                <template v-if="stage.editing">
                  <input
                    class="inline-input"
                    :value="stage.label"
                    @click.stop
                    @keyup.enter="renameStage(stage.key, ($event.target as HTMLInputElement).value)"
                    @blur="renameStage(stage.key, ($event.target as HTMLInputElement).value)"
                    autofocus
                  />
                </template>
                <template v-else>
                  <span class="col-label" @click.stop="startEdit(stage.key)">{{ stage.label }}</span>
                </template>
                <span class="pill count">{{ stage.count }}</span>
              </div>
              <div class="col-meta">R$ {{ formatCurrency(stage.total) }}</div>
            </div>
            <div class="more-menu" @keydown.escape.stop="closeColMenu">
              <button class="icon-pill" type="button" title="Opcoes" @click.stop="toggleColMenu(stage.key)">...</button>
              <div v-if="colMenuOpen === stage.key" class="menu-panel">
                <button type="button" class="menu-item" @click.stop="confirmDeleteStage(stage.key, stage.label)">
                  Excluir coluna
                </button>
              </div>
            </div>
          </div>

          <div class="col-body">
            <div
              v-for="lead in stage.leads"
              :key="lead.id"
              class="lead-card"
              draggable="true"
              @dragstart="startDrag(lead.id, stage.key)"
              @click.stop
            >
              <div class="lead-top">
                <div class="avatar">{{ initials(lead.name) }}</div>
                <div class="lead-info">
                  <div class="lead-name">{{ lead.name }}</div>
                  <div class="lead-sub">{{ lead.source || 'Sem origem' }}</div>
                </div>
                <div class="lead-value">{{ lead.value ? `R$ ${lead.value}` : 'R$ 0,00' }}</div>
              </div>
              <div class="lead-footer">
                <span class="tag small">{{ lead.classification || 'Sem classificacao' }}</span>
                <div class="lead-actions">
                  <select
                    :value="lead.classification ?? ''"
                    @change.stop="changeClassification(lead.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="opt in stageOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                  <span class="status-dot">OK</span>
                </div>
              </div>
            </div>

            <div class="dropzone" aria-hidden="true">Arraste cards aqui</div>
          </div>
        </section>
      </div>
    </div>

    <div v-if="pendingDelete" class="modal-backdrop" @click.self="pendingDelete = null">
      <div class="confirm-card">
        <div class="confirm-head">
          <div>
            <p class="eyebrow">Confirmar acao</p>
            <strong>Excluir coluna</strong>
            <p class="muted">Tem certeza que deseja excluir a coluna "{{ pendingDelete.label || pendingDelete.key }}"?</p>
          </div>
          <button class="icon-btn" @click="pendingDelete = null">x</button>
        </div>
        <div class="confirm-actions">
          <button class="btn ghost" type="button" @click="pendingDelete = null">Cancelar</button>
          <button class="btn primary" type="button" @click="doDeleteStage">Excluir</button>
        </div>
      </div>
    </div>

    <div v-if="showForm" class="modal-backdrop">
      <div class="modal-card">
        <div class="modal-header">
          <strong>Novo lead</strong>
          <button class="icon-btn" @click="closeLeadForm">x</button>
        </div>
        <div class="form compact">
          <div class="field">
            <label>Nome</label>
            <input class="input" v-model="form.name" placeholder="Nome do lead" />
          </div>
          <div class="field">
            <label>Telefone (opcional)</label>
            <input class="input" v-model="form.phone" placeholder="55..." />
          </div>
          <div class="field">
            <label>Valor (opcional)</label>
            <input class="input" v-model="form.value" placeholder="ex: 1200" />
          </div>
          <div class="field">
            <label>Origem</label>
            <input class="input" v-model="form.source" placeholder="Inbound, Indicacao..." />
          </div>
          <div class="field">
            <label>Classificacao</label>
            <select class="input" v-model="form.classification">
              <option v-for="opt in stageOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn ghost" @click="closeLeadForm" :disabled="saving">Cancelar</button>
          <button class="btn primary" @click="createLead" :disabled="saving">Salvar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useOnboardingStore } from '@/stores/onboarding.store'
import { useRouter } from 'vue-router'
import { http } from '@/api/http'
import { ref, onMounted, computed } from 'vue'
import { fetchPipelineData, invalidatePipelineCache } from '../usePipelineData'

const onboarding = useOnboardingStore()
const router = useRouter()

const baseStages = [
  { value: '', label: 'Sem classificacao' },
  { value: 'Lead', label: 'Lead' },
  { value: 'Cliente', label: 'Cliente' },
  { value: 'VIP', label: 'VIP' },
  { value: 'Spam', label: 'Spam' },
  { value: 'Bloqueado', label: 'Bloqueado' },
]

type StageColumn = {
  key: string
  label: string
  count: number
  total: number
  editing?: boolean
  leads: Array<{
    id: string
    name: string
    source?: string | null
    value?: string | null
    classification?: string | null
  }>
}

const stageOptions = ref<{ value: string; label: string }[]>([...baseStages])
const stages = ref<StageColumn[]>([])
const loading = ref(false)
const error = ref('')
const showForm = ref(false)
const saving = ref(false)
const dragging = ref<{ id: string; from: string } | null>(null)
const customColumns = ref<{ value: string; label: string }[]>([])
const removedColumns = ref<string[]>([])
const colMenuOpen = ref<string | null>(null)
const pendingDelete = ref<{ key: string; label: string } | null>(null)
const form = ref({
  name: '',
  phone: '',
  value: '',
  source: '',
  classification: stageOptions.value[0]?.value || '',
})

const accountId = computed(() => onboarding.accountId)

function resetAll() {
  onboarding.reset()
  router.push('/signup/account')
}

function openLeadForm() {
  showForm.value = true
}

function closeLeadForm() {
  showForm.value = false
  form.value = {
    name: '',
    phone: '',
    value: '',
    source: '',
    classification: stageOptions.value[0]?.value || '',
  }
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function addColumn() {
  const name = `Nova coluna ${stageOptions.value.length + 1}`
  const slug = slugify(name)
  const opt = { value: slug, label: name }
  removedColumns.value = removedColumns.value.filter((c) => c !== slug)
  customColumns.value.push(opt)
  stageOptions.value.push(opt)
  stages.value.push({ key: slug, label: name, count: 0, total: 0, leads: [], editing: true })
  persistCustomColumns()
  persistRemovedColumns()
  if (!form.value.classification) form.value.classification = slug
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'nova-coluna'
  )
}

async function loadPipeline(force = false) {
  restoreCustomColumns()
  restoreRemovedColumns()
  if (!accountId.value) return
  loading.value = true
  error.value = ''
  try {
    const { data: conversations } = await fetchPipelineData(accountId.value, force)

    const extra = conversations
      .map((c: any) => (c.classification ?? '').toString())
      .filter((c) => c && !stageOptions.value.some((opt) => opt.value === c))
      .map((c) => ({ value: c, label: c }))

    const allowed = [...baseStages, ...customColumns.value, ...extra].filter(
      (opt) => !removedColumns.value.includes(opt.value),
    )
    stageOptions.value = allowed

    const grouped: Record<string, StageColumn> = {}
    stageOptions.value.forEach((opt) => {
      grouped[opt.value] = { key: opt.value, label: opt.label, count: 0, total: 0, leads: [] }
    })

    conversations.forEach((c: any) => {
      const key = (c.classification ?? '').toString()
      if (removedColumns.value.includes(key)) return
      if (!grouped[key]) {
        grouped[key] = { key, label: key || 'Sem classificacao', count: 0, total: 0, leads: [] }
      }
      grouped[key].leads.push({
        id: c.id,
        name: c.contactName || c.contactPhone || 'Sem nome',
        source: c.source ?? null,
        value: c.value ?? null,
        classification: c.classification ?? null,
      })
    })

    const visible = Object.values(grouped).filter(
      (col) => col.leads.length || customColumns.value.some((c) => c.value === col.key),
    )
    stages.value = visible.map((col) => {
      const total = col.leads.reduce((acc, l) => {
        const num = l.value ? Number(String(l.value).replace(/[^0-9.-]/g, '')) : 0
        return acc + (Number.isFinite(num) ? num : 0)
      }, 0)
      return { ...col, count: col.leads.length, total, editing: false }
    })
  } catch {
    error.value = 'Nao foi possivel carregar o pipeline.'
  } finally {
    loading.value = false
  }
}

function startEdit(key: string) {
  stages.value = stages.value.map((s) => (s.key === key ? { ...s, editing: true } : s))
}

function renameStage(key: string, name: string) {
  const trimmed = name.trim() || 'Sem titulo'
  stages.value = stages.value.map((s) =>
    s.key === key ? { ...s, label: trimmed, editing: false } : s,
  )
  stageOptions.value = stageOptions.value.map((opt) =>
    opt.value === key ? { ...opt, label: trimmed } : opt,
  )
  customColumns.value = customColumns.value.map((opt) =>
    opt.value === key ? { ...opt, label: trimmed } : opt,
  )
  persistCustomColumns()
}

async function changeClassification(conversationId: string, classification: string, fromKey?: string | null) {
  if (!accountId.value) return
  const currentStage = findStageByLead(conversationId)
  const from = fromKey ?? currentStage?.key ?? null
  if (from && from === classification) return

  const snapshot = JSON.stringify(stages.value)
  moveLeadLocal(conversationId, classification, from)
  try {
    await http.post(`/whatsapp/conversations/${conversationId}/classification`, {
      accountId: accountId.value,
      classification,
    })
  } catch {
    stages.value = JSON.parse(snapshot)
  }
}

function startDrag(id: string, from: string) {
  dragging.value = { id, from }
}

async function dropOn(classification: string) {
  if (!dragging.value) return
  const { id, from } = dragging.value
  dragging.value = null
  if (from === classification) return
  await changeClassification(id, classification, from)
}

async function createLead() {
  if (!accountId.value || !form.value.name.trim()) return
  saving.value = true
  try {
    await http.post('/whatsapp/conversations', {
      accountId: accountId.value,
      contactName: form.value.name.trim(),
      contactPhone: form.value.phone.trim() || null,
      value: form.value.value.trim() || null,
      source: form.value.source.trim() || null,
      stage: null,
      classification: form.value.classification || null,
    })
    closeLeadForm()
    invalidatePipelineCache(accountId.value)
    await loadPipeline(true)
  } catch {
    // ignore
  } finally {
    saving.value = false
  }
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const second = parts[1]?.[0] ?? ''
  return (first + second).toUpperCase() || 'N'
}

function clearColumns() {
  customColumns.value = []
  stageOptions.value = [...baseStages]
  stages.value = []
  form.value.classification = stageOptions.value[0]?.value || ''
  persistCustomColumns()
  invalidatePipelineCache(accountId.value)
  loadPipeline(true)
}

function toggleColMenu(key: string) {
  colMenuOpen.value = colMenuOpen.value === key ? null : key
}

function closeColMenu() {
  colMenuOpen.value = null
}

function confirmDeleteStage(key: string, label: string) {
  colMenuOpen.value = null
  pendingDelete.value = { key, label }
}

function deleteStage(key: string) {
  stages.value = stages.value.filter((s) => s.key !== key)
  stageOptions.value = stageOptions.value.filter((opt) => opt.value !== key)
  customColumns.value = customColumns.value.filter((opt) => opt.value !== key)
  if (!removedColumns.value.includes(key)) {
    removedColumns.value.push(key)
  }
  if (form.value.classification === key) {
    form.value.classification = stageOptions.value[0]?.value || ''
  }
  persistCustomColumns()
  persistRemovedColumns()
  invalidatePipelineCache(accountId.value)
}

function doDeleteStage() {
  if (!pendingDelete.value) return
  deleteStage(pendingDelete.value.key)
  pendingDelete.value = null
}

onMounted(() => {
  loadPipeline()
})

function findStageByLead(id: string) {
  return stages.value.find((stage) => stage.leads.some((l) => l.id === id))
}

function parseValue(raw: string | null | undefined) {
  if (!raw) return 0
  const num = Number(String(raw).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(num) ? num : 0
}

function recalcStage(stage: StageColumn) {
  const total = stage.leads.reduce((acc, l) => acc + parseValue(l.value), 0)
  stage.count = stage.leads.length
  stage.total = total
}

function moveLeadLocal(id: string, toKey: string, fromKey?: string | null) {
  const source = fromKey ? stages.value.find((s) => s.key === fromKey) : findStageByLead(id)
  let target = stages.value.find((s) => s.key === toKey)
  if (!source) return
  if (!target) {
    target = { key: toKey, label: toKey || 'Sem classificacao', count: 0, total: 0, leads: [], editing: false }
    stages.value.push(target)
  }
  const idx = source.leads.findIndex((l) => l.id === id)
  if (idx === -1) return
  const [lead] = source.leads.splice(idx, 1)
  lead.classification = toKey
  target.leads.unshift(lead)
  recalcStage(source)
  recalcStage(target)
}

const CUSTOM_COLUMNS_KEY = 'splus-pipeline-custom-columns'
const REMOVED_COLUMNS_KEY = 'splus-pipeline-removed-columns'
function persistCustomColumns() {
  try {
    localStorage.setItem(CUSTOM_COLUMNS_KEY, JSON.stringify(customColumns.value))
  } catch {
    // ignore
  }
}
function restoreCustomColumns() {
  try {
    const raw = localStorage.getItem(CUSTOM_COLUMNS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        customColumns.value = parsed
      }
    }
  } catch {
    // ignore
  }
}

function persistRemovedColumns() {
  try {
    localStorage.setItem(REMOVED_COLUMNS_KEY, JSON.stringify(removedColumns.value))
  } catch {
    // ignore
  }
}

function restoreRemovedColumns() {
  try {
    const raw = localStorage.getItem(REMOVED_COLUMNS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        removedColumns.value = parsed
      }
    }
  } catch {
    // ignore
  }
}
</script>
