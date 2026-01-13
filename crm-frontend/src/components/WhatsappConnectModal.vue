<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { useOnboardingStore } from '@/stores/onboarding.store'
import { http } from '@/api/http'

const emit = defineEmits<{ (e: 'close'): void }>()

const onboarding = useOnboardingStore()

const mode = ref<'cloud' | 'qr'>('qr')
const status = ref<'disconnected' | 'pending' | 'connected'>('disconnected')
const qrCode = ref('')
const qrDataUrl = ref('')
const error = ref('')
const loading = ref(false)
const pollingId = ref<number | null>(null)
const lastQrError = ref('')
const loadError = ref('')
const cloudAccessToken = ref('')
const cloudPhoneNumberId = ref('')
const cloudVerifyToken = ref('')
const cloudWebhookUrl = ref('')
const activateTest = ref(true)
const autoResult = ref<{ phoneNumberId: string; displayPhone: string; verifyToken: string; webhookUrl?: string } | null>(null)
const metaStatus = ref<{ mode?: string; appName?: string; permissions?: string[] } | null>(null)

watch(qrCode, async (value) => {
  if (!value) {
    qrDataUrl.value = ''
    return
  }
  try {
    if (value.startsWith('data:image')) {
      qrDataUrl.value = value
      return
    }
    qrDataUrl.value = await QRCode.toDataURL(value, { width: 220, margin: 2 })
  } catch {
    qrDataUrl.value = ''
  }
})

onBeforeUnmount(() => {
  if (pollingId.value) window.clearInterval(pollingId.value)
})

async function fetchStatus() {
  if (!onboarding.accountId) return
  try {
    if (mode.value === 'cloud') {
      const response = await http.get('/whatsapp/connect/cloud/status', {
        params: { accountId: onboarding.accountId },
      })
      const rawStatus = response.data?.status ?? ''
      status.value = rawStatus ? rawStatus.toLowerCase() : status.value
    } else {
      const response = await http.get('/whatsapp/status', {
        params: { accountId: onboarding.accountId },
      })
      status.value = response.data?.status ?? status.value
      mode.value = response.data?.type ?? mode.value
      qrCode.value = response.data?.qrCode ?? qrCode.value
      lastQrError.value = response.data?.lastError ?? lastQrError.value
    }
    if (status.value === 'connected') {
      onboarding.setWppConnected()
      emit('close')
    }
  } catch {
    loadError.value = 'Nao foi possivel atualizar o status.'
    // ignore polling errors
  }
}

function startPolling() {
  if (pollingId.value) window.clearInterval(pollingId.value)
  pollingId.value = window.setInterval(fetchStatus, 3000)
}

async function connectCloud() {
  if (!onboarding.accountId) {
    error.value = 'Conta nao encontrada.'
    return
  }
  error.value = ''
  loadError.value = ''
  loading.value = true
  try {
    const response = await http.post('/whatsapp/connect/cloud', {
      accountId: onboarding.accountId,
      accessToken: cloudAccessToken.value.trim(),
      phoneNumberId: cloudPhoneNumberId.value.trim(),
      verifyToken: cloudVerifyToken.value.trim(),
      webhookUrl: cloudWebhookUrl.value.trim(),
    })
    mode.value = 'cloud'
    status.value = response.data?.status ?? 'pending'
    if (activateTest.value) {
      await http.post('/whatsapp/connect/cloud/activate', {
        accountId: onboarding.accountId,
      })
      status.value = 'connected'
      onboarding.setWppConnected()
      emit('close')
      return
    }
    startPolling()
  } catch (err) {
    error.value = 'Nao foi possivel salvar as credenciais.'
  } finally {
    loading.value = false
  }
}

async function connectCloudAuto() {
  error.value = ''
  loadError.value = ''
  loading.value = true
  try {
    const response = await http.get('/auth/meta/url', {
      params: { returnUrl: window.location.origin },
    })
    const url = response.data?.url
    if (url) {
      window.location.href = url
      return
    }
    error.value = 'Nao foi possivel iniciar o login com Facebook.'
  } catch (err) {
    error.value = 'Nao foi possivel iniciar o login com Facebook.'
  } finally {
    loading.value = false
  }
}

async function loadMetaStatus() {
  try {
    const response = await http.get('/auth/meta/status')
    metaStatus.value = response.data
  } catch {
    metaStatus.value = null
  }
}

loadMetaStatus()

async function copyUrls() {
  if (!autoResult.value) return
  const webhook = autoResult.value.webhookUrl || ''
  const verify = autoResult.value.verifyToken || ''
  const text = `Webhook URL: ${webhook}\nVerify Token: ${verify}`
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // ignore clipboard failures
  }
}

async function connectQr(reset = false) {
  if (!onboarding.accountId) {
    error.value = 'Conta nao encontrada.'
    return
  }
  error.value = ''
  loadError.value = ''
  loading.value = true
  try {
    const response = await http.post('/whatsapp/connect/qr', {
      accountId: onboarding.accountId,
      reset,
    })
    mode.value = 'qr'
    status.value = response.data?.state?.status ?? 'pending'
    qrCode.value = response.data?.state?.qrCode ?? ''
    lastQrError.value = response.data?.state?.lastError ?? ''
    await fetchStatus()
    startPolling()
  } catch (err) {
    error.value = 'Nao foi possivel gerar o QR.'
  } finally {
    loading.value = false
  }
}

async function refreshQr() {
  await connectQr(true)
}

async function disconnectQr() {
  if (!onboarding.accountId) return
  loading.value = true
  loadError.value = ''
  try {
    await http.post('/whatsapp/connect/qr/disconnect', {
      accountId: onboarding.accountId,
    })
    status.value = 'disconnected'
    qrCode.value = ''
    lastQrError.value = ''
  } finally {
    loading.value = false
  }
}

const statusLabel = computed(() => {
  if (status.value === 'connected') return 'Conexao ativa.'
  if (status.value === 'pending' && mode.value === 'qr') return 'Aguardando leitura do QR.'
  if (status.value === 'pending' && mode.value === 'cloud') return 'Credenciais salvas, aguardando webhook.'
  return 'Sem conexao. Gere um novo QR.'
})

watch(mode, (next) => {
  if (next === 'qr') {
    connectQr()
  }
})

onMounted(() => {
  if (mode.value === 'qr') {
    connectQr()
  }
})
</script>

<template>
  <div class="modal-card">
    <div class="modal-header">
      <strong>Conectar WhatsApp</strong>
      <button class="btn ghost" type="button" @click="emit('close')">Fechar</button>
    </div>

    <p class="muted">Escolha Cloud API ou QR Code para ativar o inbox.</p>
    <p v-if="loadError" class="muted">{{ loadError }}</p>

    <div class="connect-options">
      <button class="option-card" type="button" @click="mode = 'qr'">
        <strong>WhatsApp Web (QR)</strong>
        <p class="muted">Conecte com QR Code (nao oficial).</p>
      </button>
      <button class="option-card" type="button" @click="mode = 'cloud'">
        <strong>WhatsApp Cloud API</strong>
        <p class="muted">Oficial, use suas credenciais da Meta.</p>
      </button>
    </div>

    <div v-if="mode === 'cloud'" class="mini-card">
      <strong>Credenciais Cloud API</strong>
      <div class="field">
        <label>Access Token</label>
        <input v-model="cloudAccessToken" class="input" placeholder="EAA..." />
      </div>
      <div class="field">
        <label>Phone Number ID</label>
        <input v-model="cloudPhoneNumberId" class="input" placeholder="1234567890" />
      </div>
      <div class="field">
        <label>Verify Token</label>
        <input v-model="cloudVerifyToken" class="input" placeholder="seu-verify-token" />
      </div>
      <div class="field">
        <label>Webhook URL</label>
        <input v-model="cloudWebhookUrl" class="input" placeholder="https://seu-dominio.com/whatsapp/webhook" />
      </div>
      <label class="toggle-line">
        <input v-model="activateTest" type="checkbox" />
        <span>Ativar para testes agora</span>
      </label>
      <div class="form-actions">
        <button class="btn accent" :disabled="loading" @click="connectCloud">
          {{ loading ? 'Salvando...' : 'Salvar credenciais' }}
        </button>
        <button class="btn ghost" type="button" :disabled="loading" @click="connectCloudAuto">
          Conectar via Facebook
        </button>
      </div>
      <div v-if="metaStatus" class="muted">
        <div>Meta app: {{ metaStatus.appName || 'desconhecido' }}</div>
        <div>Modo: {{ metaStatus.mode || 'desconhecido' }}</div>
        <div v-if="metaStatus.permissions?.length">
          Permissoes: {{ metaStatus.permissions.join(', ') }}
        </div>
      </div>
      <div v-if="autoResult" class="muted">
        <div>Phone Number ID: {{ autoResult.phoneNumberId }}</div>
        <div>Numero: {{ autoResult.displayPhone }}</div>
        <div>Verify Token: {{ autoResult.verifyToken }}</div>
        <div v-if="autoResult.webhookUrl">Webhook: {{ autoResult.webhookUrl }}</div>
        <div class="form-actions">
          <button class="btn ghost" type="button" @click="copyUrls">
            Copiar URLs
          </button>
        </div>
      </div>
    </div>

    <div class="mini-card">
      <strong>Status</strong>
      <p class="muted">Modo: {{ mode }} | Estado: {{ status }}</p>
      <p class="muted">{{ statusLabel }}</p>
      <p v-if="status === 'disconnected'" class="muted">
        Se o QR nao aparecer, clique em Atualizar QR.
      </p>
      <p v-if="lastQrError" class="muted">Erro: {{ lastQrError }}</p>
      <div v-if="mode === 'qr' && !qrCode" class="qr-box">
        <div class="tag">Gerando QR...</div>
      </div>
      <div v-if="mode === 'qr' && qrCode" class="qr-box">
        <div class="tag">QR gerado</div>
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR Code" class="qr-image" />
      </div>
    </div>

    <p v-if="error" class="muted">{{ error }}</p>

    <div class="form-actions">
      <button class="btn ghost" type="button" @click="refreshQr">Atualizar QR</button>
      <button class="btn ghost" type="button" @click="disconnectQr">Desconectar</button>
      <button class="btn ghost" type="button" @click="emit('close')">Fechar</button>
    </div>
  </div>
</template>
