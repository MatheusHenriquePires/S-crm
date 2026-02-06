<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useOnboardingStore } from '@/stores/onboarding.store'
import { http } from '@/api/http'

type Conversation = {
  id: string
  contactPhone: string
  contactName?: string | null
  contactPhotoUrl?: string | null
  lastMessageAt: string
  unreadCount?: number
  classification?: string | null
}

type Message = {
  id: string
  wamid?: string | null
  direction: 'INBOUND' | 'OUTBOUND'
  body: string
  messageTimestamp: string
  status?: string | null
  hasMedia?: boolean
  mimetype?: string | null
  duration?: number | null
  replyToWamid?: string | null
}

const onboarding = useOnboardingStore()
const showSetup = computed(() => !onboarding.wppConnected)
const accountId = computed(() => onboarding.accountId)
const activeConversation = computed(() =>
  conversations.value.find((item) => item.id === activeConversationId.value),
)
const activeDisplayName = computed(() =>
  activeConversation.value
    ? activeConversation.value.contactName || formatContact(activeConversation.value.contactPhone || '')
    : '',
)
const conversations = ref<Conversation[]>([])
const activeConversationId = ref<string | null>(null)
const messages = ref<Message[]>([])
const loading = ref(false)
const stream = ref<EventSource | null>(null)
const reconnectTimer = ref<number | null>(null)
const poller = ref<number | null>(null)
const draft = ref('')
const sending = ref(false)
const savingClassification = ref(false)
const loadError = ref('')
const chatBodyRef = ref<HTMLElement | null>(null)
const seenAt = ref<Record<string, string>>(loadSeenState())
const replyTo = ref<Message | null>(null)
const composerRef = ref<HTMLTextAreaElement | null>(null)
const audioRefs = ref<Record<string, HTMLAudioElement>>({})
const audioMeta = ref<Record<string, { duration: number; current: number }>>({})
const audioPlaying = ref<Record<string, boolean>>({})
const audioVolume = ref<Record<string, number>>({})
const volumeOpenFor = ref<string | null>(null)
const editingName = ref(false)
const contactNameDraft = ref('')

const SEEN_KEY = 'conversation_seen_v1'

const replyPlaceholder = computed(() => {
  if (replyTo.value) {
    return `Respondendo: ${buildReplySnippet(replyTo.value)}`
  }
  return 'Shift + Enter para nova linha'
})

const classificationOptions = [
  { value: '', label: 'Sem classificação' },
  { value: 'Lead', label: 'Lead' },
  { value: 'Cliente', label: 'Cliente' },
  { value: 'VIP', label: 'VIP' },
  { value: 'Spam', label: 'Spam' },
  { value: 'Bloqueado', label: 'Bloqueado' },
]

const replyName = computed(() => {
  if (!replyTo.value) return ''
  return replyTo.value.direction === 'OUTBOUND'
    ? 'Vocẽ'
    : activeDisplayName.value || 'Cliente'
})

function formatContact(value: string) {
  if (!value) return 'Contato'
  if (/^\d+$/.test(value)) return `+${value}`
  return value
}

function normalizePhone(value?: string | null) {
  return (value ?? '').replace(/\D/g, '')
}

function getInitials(name?: string | null, phone?: string) {
  const clean = (name ?? '').trim()
  if (clean) {
    const parts = clean.split(/\s+/).slice(0, 2)
    return parts.map((part) => part[0]?.toUpperCase()).join('')
  }
  if (phone) return phone.slice(-2)
  return '??'
}

function formatTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function dedupeConversations(list: Conversation[]) {
  const map = new Map<string, Conversation>()
  for (const item of list) {
    const normalized = normalizePhone(item.contactPhone)
    const shortKey =
      normalized.length > 11 ? normalized.slice(-11) : normalized || item.contactPhone || item.id
    // agrupa também status@broadcast em uma única entrada
    const key = item.contactPhone?.includes('status@broadcast') ? 'status@broadcast' : shortKey
    const existing = map.get(key)
    const existingTs = existing ? new Date(existing.lastMessageAt).getTime() : 0
    const incomingTs = new Date(item.lastMessageAt).getTime()
    const useNewer = Number.isFinite(incomingTs) && incomingTs > existingTs
    if (!existing || useNewer) {
      map.set(key, { ...item })
      continue
    }
    if (existing && !existing.contactName && item.contactName) {
      map.set(key, { ...existing, contactName: item.contactName })
    }
    if (existing && !existing.classification && item.classification) {
      map.set(key, { ...existing, classification: item.classification })
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const ta = new Date(a.lastMessageAt).getTime()
    const tb = new Date(b.lastMessageAt).getTime()
    return Number.isFinite(tb) && Number.isFinite(ta) ? tb - ta : 0
  })
}

function loadSeenState() {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>
  } catch {
    // ignore
  }
  return {}
}

function saveSeenState() {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seenAt.value))
  } catch {
    // ignore
  }
}

function markConversationRead(conversationId: string) {
  const convo = conversations.value.find((c) => c.id === conversationId)
  const ts = convo?.lastMessageAt || new Date().toISOString()
  seenAt.value = { ...seenAt.value, [conversationId]: ts }
  saveSeenState()
}

function isUnread(conversation: Conversation) {
  const seen = seenAt.value[conversation.id]
  if (!seen) return true
  const last = new Date(conversation.lastMessageAt).getTime()
  const seenTs = new Date(seen).getTime()
  return Number.isFinite(last) && Number.isFinite(seenTs) ? last > seenTs : false
}

async function startEditName() {
  if (!activeConversation.value) return
  editingName.value = true
  contactNameDraft.value = activeConversation.value.contactName || ''
  await nextTick()
}

async function saveContactName() {
  if (!activeConversation.value || !accountId.value) {
    editingName.value = false
    return
  }
  const clean = contactNameDraft.value.trim()
  if (!clean || clean === activeConversation.value.contactName) {
    editingName.value = false
    return
  }
  try {
    await http.patch(`/whatsapp/conversations/${activeConversation.value.id}/contact`, {
      accountId: accountId.value,
      name: clean,
    })
    conversations.value = conversations.value.map((c) =>
      c.id === activeConversation.value?.id ? { ...c, contactName: clean } : c,
    )
  } catch {
    // ignore
  } finally {
    editingName.value = false
  }
}

function unreadCount(conversation: Conversation) {
  const seen = seenAt.value[conversation.id]
  const lastSeen = seen ? new Date(seen).getTime() : 0
  if (!conversation.unreadCount && !lastSeen) return 0
  // se o backend trouxer unreadCount, usamos diretamente; senão, consideramos 1 se não há visto
  if (conversation.unreadCount && conversation.unreadCount > 0) return conversation.unreadCount
  return lastSeen ? 0 : 1
}

function buildMediaUrl(messageId: string) {
  if (!accountId.value || !activeConversationId.value) return ''
  const params = new URLSearchParams({ accountId: accountId.value })
  const token = localStorage.getItem('access_token')
  if (token) params.set('token', token)
  const base =
    (typeof http.defaults.baseURL === 'string' && http.defaults.baseURL) || window.location.origin
  return `${base}/whatsapp/conversations/${activeConversationId.value}/messages/${messageId}/media?${params.toString()}`
}

function setAudioRef(id: string) {
  return (el: HTMLAudioElement | null) => {
    if (el) {
      audioRefs.value[id] = el
      const vol = audioVolume.value[id] ?? 1
      el.volume = vol
    } else {
      delete audioRefs.value[id]
    }
  }
}

function onAudioLoaded(id: string, event: Event) {
  const el = event.target as HTMLAudioElement
  audioMeta.value[id] = {
    duration: Number.isFinite(el.duration) ? el.duration : 0,
    current: el.currentTime || 0,
  }
  const vol = audioVolume.value[id] ?? 1
  el.volume = vol
}

function onAudioTime(id: string, event: Event) {
  const el = event.target as HTMLAudioElement
  const prev = audioMeta.value[id] || { duration: 0, current: 0 }
  audioMeta.value[id] = {
    duration: Number.isFinite(el.duration) ? el.duration : prev.duration,
    current: el.currentTime || 0,
  }
}

function togglePlay(id: string) {
  const el = audioRefs.value[id]
  if (!el) return
  if (audioPlaying.value[id]) {
    el.pause()
    audioPlaying.value[id] = false
  } else {
    el.play().then(
      () => {
        audioPlaying.value[id] = true
      },
      () => {
        audioPlaying.value[id] = false
      },
    )
  }
}

function onAudioEnded(id: string) {
  audioPlaying.value[id] = false
  const meta = audioMeta.value[id] || { duration: 0, current: 0 }
  audioMeta.value[id] = { ...meta, current: meta.duration }
}

function setVolume(id: string, value: number) {
  const el = audioRefs.value[id]
  const vol = Math.min(1, Math.max(0, value))
  audioVolume.value[id] = vol
  if (el) el.volume = vol
}

function formatSeconds(value?: number | null) {
  if (!value || Number.isNaN(value)) return '0:00'
  const v = Math.max(0, Math.floor(value))
  const m = Math.floor(v / 60)
  const s = String(v % 60).padStart(2, '0')
  return `${m}:${s}`
}

function onSeek(id: string, value: number) {
  const el = audioRefs.value[id]
  if (!el) return
  const meta = audioMeta.value[id]
  if (!meta?.duration) return
  const next = Math.min(meta.duration, Math.max(0, value))
  el.currentTime = next
  audioMeta.value[id] = { ...meta, current: next }
}

function toggleVolume(id: string) {
  volumeOpenFor.value = volumeOpenFor.value === id ? null : id
}

function statusLabel(status?: string | null) {
  if (!status) return 'enviado'
  if (status === 'read' || status === 'played') return 'lido'
  if (status === 'delivered') return 'entregue'
  if (status === 'sent') return 'enviado'
  return status
}

function splitQuoted(message: Message) {
  const raw = message.body || ''
  if (!raw.trim().startsWith('>')) {
    return { quote: null, text: raw, replyId: message.replyToWamid || null }
  }
  const lines = raw.split('\n')
  const first = lines.shift() || ''
  const quote = first.replace(/^>\s?/, '').trim()
  const rest = lines.join('\n').trim()
  return { quote: quote || null, text: rest || quote || raw, replyId: message.replyToWamid || null }
}

function resolveReply(message: Message) {
  if (message.replyToWamid) {
    const target = messages.value.find((m) => m.wamid === message.replyToWamid)
    if (target) {
      const thumb =
        target.hasMedia && target.mimetype?.startsWith('image')
          ? buildMediaUrl(target.id)
          : null
      return {
        name: target.direction === 'OUTBOUND' ? 'Você' : activeDisplayName.value || 'Contato',
        snippet: buildReplySnippet(target),
        targetId: target.id,
        thumb,
      }
    }
  }
  const split = splitQuoted(message)
  if (split.quote) {
    return {
      name: activeDisplayName.value || 'Contato',
      snippet: split.quote,
      targetId: split.replyId || null,
    }
  }
  return null
}

function setReply(message: Message) {
  replyTo.value = message
}

function clearReply() {
  replyTo.value = null
}

function buildReplySnippet(message: Message) {
  if (message.hasMedia && message.mimetype?.startsWith('audio')) return '[audio]'
  if (message.hasMedia && message.mimetype?.startsWith('image')) {
    const text = message.body?.trim() || ''
    const looksBase64 =
      text.startsWith('data:image') ||
      text.startsWith('/9j/') ||
      (text.length > 200 && /^[A-Za-z0-9+/=]+$/.test(text))
    if (!text || looksBase64) return '[imagem]'
    return text
  }
  return message.body || 'mensagem'
}

function jumpToMessage(messageId: string | null) {
  if (!messageId || !chatBodyRef.value) return
  const el = chatBodyRef.value.querySelector(`[data-msg-id="${messageId}"]`) as HTMLElement | null
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('msg-highlight')
    window.setTimeout(() => el.classList.remove('msg-highlight'), 1200)
  }
}

async function loadConversations() {
  if (!accountId.value) return
  const sinceTs = loadFirstLoginAt(accountId.value)
  const since = sinceTs ? new Date(sinceTs).toISOString() : null
  const shouldShowLoading = conversations.value.length === 0
  if (shouldShowLoading) loading.value = true
  loadError.value = ''
  try {
    const response = await http.get('/whatsapp/conversations', {
      params: { accountId: accountId.value, since },
    })
    const deduped = dedupeConversations(response.data ?? [])
    const activePhone = activeConversation.value
      ? normalizePhone(activeConversation.value.contactPhone)
      : null
    conversations.value = deduped
    if (conversations.value.length) {
      const keepCurrent = conversations.value.find((c) => c.id === activeConversationId.value)
      if (!keepCurrent) {
        const samePhone = activePhone
          ? conversations.value.find((c) => normalizePhone(c.contactPhone) === activePhone)
          : null
        activeConversationId.value = samePhone?.id ?? conversations.value[0].id
        await loadMessages(activeConversationId.value, true, true)
      }
    }
  } catch {
    loadError.value = 'Nao foi possivel carregar as conversas.'
  } finally {
    if (shouldShowLoading) loading.value = false
  }
}

async function loadMessages(conversationId: string, forceScroll = false, markRead = false) {
  if (!accountId.value) return
  const sinceTs = loadFirstLoginAt(accountId.value)
  const since = sinceTs ? new Date(sinceTs).toISOString() : null
  try {
    const response = await http.get(`/whatsapp/conversations/${conversationId}/messages`, {
      params: { accountId: accountId.value, since },
    })
    messages.value = response.data ?? []
    await nextTick()
    scrollToLatest(forceScroll)
    if (markRead) {
      markConversationRead(conversationId)
    }
  } catch {
    loadError.value = 'Nao foi possivel carregar as mensagens.'
  }
}

function selectConversation(conversationId: string) {
  activeConversationId.value = conversationId
  loadMessages(conversationId, true, true)
}

async function setClassification(value: string) {
  if (!accountId.value || !activeConversationId.value) return
  if (savingClassification.value) return
  savingClassification.value = true
  try {
    await http.post(`/whatsapp/conversations/${activeConversationId.value}/classification`, {
      accountId: accountId.value,
      classification: value || null,
    })
    conversations.value = conversations.value.map((c) =>
      c.id === activeConversationId.value ? { ...c, classification: value || null } : c,
    )
  } catch {
    // ignore
  } finally {
    savingClassification.value = false
  }
}

async function sendMessage() {
  if (!accountId.value || !activeConversationId.value || !draft.value.trim()) return
  if (sending.value) return
  const body = draft.value.trim()
  const finalBody = body
  sending.value = true
  loadError.value = ''
  try {
    const now = new Date().toISOString()
    messages.value = [
      ...messages.value,
      {
        id: `local-${Date.now()}`,
        direction: 'OUTBOUND',
        body: finalBody,
        messageTimestamp: now,
        replyToWamid: replyTo.value?.wamid ?? null,
        wamid: null,
      },
    ]
    scrollToLatest(true)
    await http.post(`/whatsapp/conversations/${activeConversationId.value}/messages`, {
      accountId: accountId.value,
      body: finalBody,
      replyToWamid: replyTo.value?.wamid ?? null,
    })
    draft.value = ''
    replyTo.value = null
    await nextTick()
    composerRef.value?.focus()
    await loadMessages(activeConversationId.value)
    await loadConversations()
  } catch {
    loadError.value = 'Nao foi possivel enviar a mensagem.'
  } finally {
    sending.value = false
  }
}

function shouldAutoScroll() {
  if (!chatBodyRef.value) return true
  const { scrollTop, scrollHeight, clientHeight } = chatBodyRef.value
  return scrollHeight - scrollTop - clientHeight < 120
}

function scrollToLatest(force = false) {
  if (!chatBodyRef.value) return
  if (!force && !shouldAutoScroll()) return
  chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight
}

function senderLabel(direction: Message['direction']) {
  if (direction === 'OUTBOUND') return 'Você'
  return activeDisplayName.value || 'Cliente'
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
  if (poller.value) {
    window.clearInterval(poller.value)
    poller.value = null
  }
}

function openStream() {
  if (!accountId.value) return
  closeStream()
  const baseUrl = (http.defaults.baseURL as string | undefined) ?? 'http://localhost:3001'
  const url = new URL('/whatsapp/stream', baseUrl)
  url.searchParams.set('accountId', accountId.value)
  const es = new EventSource(url.toString())
  es.onopen = () => {
    loadConversations()
    if (activeConversationId.value) {
      loadMessages(activeConversationId.value)
    }
  }
  es.onmessage = (event) => {
    let raw: Record<string, any> | null = null
    try {
      raw = JSON.parse(event.data || '{}')
    } catch {
      // ignore parse errors
    }
    if (!raw) return
    const payload = (raw.data as Record<string, any> | undefined) ?? raw
    const type = payload?.type
    if (type === 'message') {
      if (!activeConversationId.value && payload.conversationId) {
        activeConversationId.value = payload.conversationId
      }
      loadConversations()
      if (activeConversationId.value) {
        loadMessages(activeConversationId.value)
      }
    }
    if (type === 'ping') {
      loadConversations()
      if (activeConversationId.value) {
        loadMessages(activeConversationId.value)
      }
    }
    if (type === 'connected') {
      loadConversations()
    }
  }
  es.onerror = () => {
    closeStream()
    reconnectTimer.value = window.setTimeout(() => {
      openStream()
    }, 2000)
  }
  stream.value = es
}

function startRealtime() {
  if (!accountId.value) return
  loadConversations()
  openStream()
  poller.value = window.setInterval(() => {
    loadConversations()
    if (activeConversationId.value) {
      loadMessages(activeConversationId.value)
    }
  }, 5000)
}

function loadFirstLoginAt(accountId: string | null) {
  if (!accountId) return null
  try {
    const raw = localStorage.getItem('first_login_at_v1')
    if (!raw) return null
    const map = JSON.parse(raw)
    const val = map?.[accountId]
    const ts = val ? new Date(val).getTime() : NaN
    return Number.isFinite(ts) ? ts : null
  } catch {
    return null
  }
}

onMounted(() => {
  startRealtime()
})

watch(
  () => accountId.value,
  (id) => {
    if (id) {
      startRealtime()
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
  <div class="page inbox-page">
    <div v-if="showSetup" class="setup-banner">
      <div>
        <strong>Conecte o WhatsApp para liberar conversas em tempo real.</strong>
        <div class="muted">Sem conexao, o funil fica bloqueado.</div>
      </div>
      <router-link class="btn accent" to="/setup/whatsapp">Conectar agora</router-link>
    </div>

    <div class="inbox-shell">
      <aside class="inbox-sidebar">
        <div class="inbox-header">
          <div>
            <strong>Abertos</strong>
            <span class="tag">{{ conversations.length }}</span>
          </div>
          <div class="inbox-actions">
            <button class="icon-btn" type="button" title="Filtrar">...</button>
            <button class="icon-btn" type="button" title="Novo">+</button>
          </div>
        </div>

        <div class="inbox-search">
          <input class="input" placeholder="Pesquisar" />
        </div>

        <div v-if="loading" class="inbox-list empty-state">
          <strong>Carregando...</strong>
          <p class="muted">Buscando conversas do WhatsApp.</p>
        </div>
        <div v-else-if="loadError" class="inbox-list empty-state">
          <strong>Falha ao carregar</strong>
          <p class="muted">{{ loadError }}</p>
        </div>
        <div v-else-if="!conversations.length" class="inbox-list empty-state">
          <strong>Nenhuma conversa ainda</strong>
          <p class="muted">Quando chegar uma mensagem, ela aparece aqui.</p>
        </div>
        <div v-else class="inbox-list">
          <button
            v-for="conversation in conversations"
            :key="conversation.id"
            class="conversation-tile"
            :class="{ active: conversation.id === activeConversationId }"
            type="button"
            @click="selectConversation(conversation.id)"
          >
            <div class="conversation-avatar">
              <img
                v-if="conversation.contactPhotoUrl"
                :src="conversation.contactPhotoUrl"
                alt=""
              />
              <span v-else>
                {{ getInitials(conversation.contactName, conversation.contactPhone) }}
              </span>
            </div>
            <div class="conversation-body">
              <div class="conversation-top">
                <strong>
                  {{ conversation.contactName || formatContact(conversation.contactPhone) }}
                </strong>
                <span class="conversation-time">
                  {{ formatTime(conversation.lastMessageAt) || 'agora' }}
                </span>
              </div>
              <div class="conversation-preview">
                <span class="status-dot"></span>
                <span class="muted">WhatsApp</span>
                <span v-if="conversation.classification" class="class-badge">
                  {{ conversation.classification }}
                </span>
                <span v-if="isUnread(conversation)" class="unread-badge">
                  {{ unreadCount(conversation) }}
                </span>
              </div>
            </div>
          </button>
        </div>
      </aside>

      <section class="inbox-main">
        <div class="chat-header">
          <div v-if="activeConversationId" class="chat-title">
            <div class="conversation-avatar large">
              <img
                v-if="activeConversation?.contactPhotoUrl"
                :src="activeConversation.contactPhotoUrl"
                alt=""
              />
              <span v-else>
                {{ getInitials(activeConversation?.contactName, activeConversation?.contactPhone) }}
              </span>
            </div>
            <div>
              <div class="name-row">
                <template v-if="editingName">
                  <input
                    v-model="contactNameDraft"
                    class="inline-input"
                    @keyup.enter="saveContactName"
                    @blur="saveContactName"
                  />
                </template>
                <template v-else>
                  <strong @click="startEditName">
                    {{ activeConversation?.contactName || formatContact(activeConversation?.contactPhone || '') }}
                  </strong>
                </template>
                <button class="icon-btn" type="button" title="Renomear" @click="startEditName">✏️</button>
              </div>
              <div class="muted">WhatsApp conectado</div>
            </div>
          </div>
          <div v-else>
            <strong>Selecione uma conversa</strong>
            <div class="muted">Resposta rapida e organizada.</div>
          </div>
          <div class="chat-actions">
            <div v-if="activeConversationId" class="class-select">
              <label class="muted" for="classSelect">Classificação</label>
              <select
                id="classSelect"
                :disabled="savingClassification"
                :value="activeConversation?.classification || ''"
                @change="setClassification(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="opt in classificationOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <button class="icon-btn" type="button">Resolver</button>
            <button class="icon-btn" type="button">Atribuir</button>
            <button class="icon-btn" type="button">...</button>
          </div>
        </div>

        <div v-if="!activeConversationId" class="chat-body empty-state">
          <p class="muted">Nenhuma conversa selecionada.</p>
        </div>
        <div v-else ref="chatBodyRef" class="chat-body">
          <div class="chat-hint">Hoje</div>
          <div
            v-for="message in messages"
            :key="message.id"
            class="chat-message"
            :class="message.direction === 'OUTBOUND' ? 'outgoing' : 'incoming'"
            :data-msg-id="message.id"
          >
            <div class="chat-meta">
              {{ senderLabel(message.direction) }}
              {{ formatTime(message.messageTimestamp) }}
            </div>
            <div
              class="chat-bubble"
              :class="message.direction === 'OUTBOUND' ? 'outgoing' : 'incoming'"
              @contextmenu.prevent="setReply(message)"
            >
              <template v-if="message.hasMedia && message.mimetype?.startsWith('audio')">
                <div class="audio-shell">
                  <audio
                    :ref="setAudioRef(message.id)"
                    :src="buildMediaUrl(message.id)"
                    preload="metadata"
                    @loadedmetadata="onAudioLoaded(message.id, $event)"
                    @timeupdate="onAudioTime(message.id, $event)"
                    @ended="onAudioEnded(message.id)"
                  ></audio>
                  <div class="audio-row">
                    <button class="audio-btn" type="button" @click="togglePlay(message.id)" :title="audioPlaying[message.id] ? 'Pausar' : 'Tocar'">
                      <svg v-if="audioPlaying[message.id]" viewBox="0 0 24 24" class="audio-ico"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                      <svg v-else viewBox="0 0 24 24" class="audio-ico"><path d="M7 5v14l11-7z"/></svg>
                    </button>
                    <input
                      class="audio-progress"
                      type="range"
                      min="0"
                      :max="audioMeta[message.id]?.duration || message.duration || 0"
                      step="0.1"
                      :value="audioMeta[message.id]?.current || 0"
                      @input="onSeek(message.id, Number(($event.target as HTMLInputElement).value))"
                    />
                    <div class="audio-time">
                      {{ formatSeconds(audioMeta[message.id]?.current) }} /
                      {{ formatSeconds(audioMeta[message.id]?.duration || message.duration) }}
                    </div>
                    <div class="audio-volume-row inline">
                      <button class="audio-btn ghost" type="button" @click="toggleVolume(message.id)" title="Volume">
                        <svg viewBox="0 0 24 24" class="audio-ico"><path d="M5 9v6h4l5 4V5l-5 4H5z"/><path d="M15 9.35a4 4 0 0 1 0 5.3m2-7.3a7 7 0 0 1 0 9.3"/></svg>
                      </button>
                      <div v-if="volumeOpenFor === message.id" class="volume-pop inline">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          :value="audioVolume[message.id] ?? 1"
                          @input="setVolume(message.id, Number(($event.target as HTMLInputElement).value))"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </template>
              <template v-else-if="message.hasMedia && message.mimetype?.startsWith('image')">
                <img
                  class="chat-image"
                  :src="buildMediaUrl(message.id)"
                  alt="imagem"
                  loading="lazy"
                />
              </template>
              <template v-else>
                <template v-if="resolveReply(message)">
                  <div
                    class="quoted-block"
                    :class="message.direction === 'OUTBOUND' ? 'q-out' : 'q-in'"
                    @click="jumpToMessage(resolveReply(message)?.targetId || null)"
                  >
                    <div class="quoted-name">{{ resolveReply(message)?.name }}</div>
                    <div class="quoted-content">
                      <img
                        v-if="resolveReply(message)?.thumb"
                        class="quoted-thumb"
                        :src="resolveReply(message)?.thumb"
                        alt="preview"
                      />
                      <div class="quoted-text">{{ resolveReply(message)?.snippet }}</div>
                    </div>
                  </div>
                  <div v-if="message.body" class="chat-text">{{ splitQuoted(message).text }}</div>
                </template>
                <template v-else-if="splitQuoted(message).quote || splitQuoted(message).replyId">
                  <div
                    class="quoted-block"
                    :class="message.direction === 'OUTBOUND' ? 'q-out' : 'q-in'"
                    @click="jumpToMessage(splitQuoted(message).replyId)"
                  >
                    <div class="quoted-name">{{ activeDisplayName || 'Contato' }}</div>
                    <div class="quoted-text">{{ splitQuoted(message).quote || splitQuoted(message).text }}</div>
                  </div>
                  <div v-if="splitQuoted(message).text" class="chat-text">{{ splitQuoted(message).text }}</div>
                </template>
                <template v-else>
                  {{ message.body }}
                </template>
              </template>
            </div>
            <div
              v-if="message.direction === 'OUTBOUND'"
              class="chat-status"
              :data-status="message.status || 'sent'"
            >
              <span class="ticks"></span>
              <span class="muted">{{ statusLabel(message.status) }}</span>
            </div>
          </div>
        </div>

        <div class="chat-composer">
          <div v-if="replyTo" class="reply-preview">
            <div class="reply-meta">
              <span class="reply-name">{{ replyName }}</span>
              <button class="reply-close" type="button" @click="clearReply">✕</button>
            </div>
            <div class="reply-snippet">
              {{ buildReplySnippet(replyTo) }}
            </div>
          </div>
          <div class="composer-input">
            <textarea
              v-model="draft"
              ref="composerRef"
              class="input"
              :placeholder="replyPlaceholder"
              :disabled="!activeConversationId || sending"
              rows="2"
              @keydown.enter.exact.prevent="sendMessage"
            ></textarea>
          </div>
          <div class="composer-actions">
            <button class="icon-btn" type="button" :disabled="!activeConversationId || sending">
              ...
            </button>
            <button
              class="btn primary"
              type="button"
              :disabled="!activeConversationId || sending"
              @click="sendMessage"
            >
              Enviar
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
