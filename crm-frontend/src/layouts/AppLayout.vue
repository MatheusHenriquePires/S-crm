<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useOnboardingStore } from '@/stores/onboarding.store'
import WhatsappConnectModal from '@/components/WhatsappConnectModal.vue'
import { http } from '@/api/http'

const onboarding = useOnboardingStore()
const wppStatus = computed(() => (onboarding.wppConnected ? 'Conectado' : 'Nao conectado'))
const showConnectModal = ref(false)
const stream = ref<EventSource | null>(null)
const reconnectTimer = ref<number | null>(null)
const collapsed = ref(false)
const checkingStatus = ref(false)

function handleLogout() {
  localStorage.clear()
  onboarding.reset()
  window.location.href = '/login'
}

async function refreshWppStatus(openModal = false) {
  if (!onboarding.accountId) {
    if (openModal) showConnectModal.value = true
    return
  }
  checkingStatus.value = true
  try {
    const { data } = await http.get('/whatsapp/status', {
      params: { accountId: onboarding.accountId },
    })
    const status = (data?.status || '').toString().toLowerCase()
    const connected = status === 'connected' || status === 'main' || status === 'normal'
    if (connected) {
      onboarding.setWppConnected()
    } else {
      onboarding.setWppDisconnected()
    }
  } catch {
    // ignore status errors, UI stays as-is
  } finally {
    checkingStatus.value = false
    if (openModal) showConnectModal.value = true
  }
}

function closeStream() {
  if (stream.value) {
    stream.value.close()
    stream.value = null
  }
  if (reconnectTimer.value) {
    window.clearTimeout(reconnectTimer.value)
    reconnectTimer.value = null
  }
}

function openStream() {
  if (!onboarding.accountId) return
  closeStream()
  const baseUrl = (http.defaults.baseURL as string | undefined) ?? 'http://localhost:3001'
  const url = new URL('/whatsapp/stream', baseUrl)
  url.searchParams.set('accountId', onboarding.accountId)
  const es = new EventSource(url.toString())
  es.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data || '{}')
      if (payload?.type === 'qr_required') {
        onboarding.setWppDisconnected()
        showConnectModal.value = true
      }
    } catch {
      // ignore parse errors
    }
  }
  es.onerror = () => {
    closeStream()
    reconnectTimer.value = window.setTimeout(() => {
      openStream()
    }, 3000)
  }
  stream.value = es
}

onMounted(() => {
  openStream()
})

watch(
  () => onboarding.accountId,
  (id) => {
    if (id) {
      openStream()
    } else {
      closeStream()
    }
  },
)

onBeforeUnmount(() => {
  closeStream()
})
</script>

<template>
  <div class="app-shell page">
    <aside :class="['sidebar', { collapsed }]">
      <div class="brand" @click="collapsed = !collapsed" title="Alternar menu">
        <div class="brand-mark">S+</div>
        <div v-if="!collapsed">
          <div class="brand-name">S+ CRM</div>
          <div class="brand-tag">Fluxo claro, vendas rapidas</div>
        </div>
      </div>

      <nav class="nav">
        <router-link class="nav-link" to="/" :title="collapsed ? 'Conversas' : ''">
          <svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 17.5 3 21l3.5-1.5H19a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v7.5a4 4 0 0 0 2 3.5Z" />
            <path d="M8 10h8M8 7h5" />
          </svg>
          <span v-if="!collapsed">Conversas</span>
        </router-link>
        <router-link class="nav-link" to="/pipeline" :title="collapsed ? 'CRM' : ''">
          <svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 6h16l-1 4H5l-1-4Z" />
            <path d="M5 10v8h14v-8" />
            <path d="M9 14h6" />
          </svg>
          <span v-if="!collapsed">CRM</span>
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <div v-if="!collapsed" class="sidebar-card">
          <strong>Semana ativa</strong>
          <span class="muted">23 leads tocados</span>
          <div class="tag">+18% velocidade</div>
        </div>
        <button class="toggle-sidebar" type="button" :title="collapsed ? 'Expandir' : 'Recolher'" @click="collapsed = !collapsed">
          <svg
            v-if="collapsed"
            class="nav-svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M10 6 16 12 10 18" />
          </svg>
          <svg
            v-else
            class="nav-svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M14 6 8 12 14 18" />
          </svg>
        </button>
        <button class="toggle-sidebar logout-btn" type="button" title="Sair" @click="handleLogout">
          <svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 3h6a2 2 0 0 1 2 2v4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
            <path d="M11 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
          </svg>
          <span v-if="!collapsed">Sair</span>
        </button>
      </div>
    </aside>

    <div class="app-main">
      <header class="topbar">
        <div>
          <strong>Visao geral</strong>
          <div class="muted">Inbox primeiro, funil depois</div>
        </div>
        <div class="search">
          <span class="muted">Buscar</span>
          <input type="text" placeholder="Lead, etapa, tag" />
        </div>
        <div class="form-actions">
          <button class="status-chip" type="button" :class="{ busy: checkingStatus }" @click="refreshWppStatus(true)">
            <span v-if="checkingStatus" class="dot dot-pulse" aria-hidden="true"></span>
            <span>{{ wppStatus }}</span>
          </button>
          <button class="btn accent" type="button" @click="showConnectModal = true">
            Configurar WhatsApp
          </button>
        </div>
      </header>

      <main class="main-content">
        <router-view />
      </main>
    </div>

    <div v-if="showConnectModal" class="modal-backdrop" @click.self="showConnectModal = false">
      <WhatsappConnectModal @close="showConnectModal = false" />
    </div>
  </div>
</template>
