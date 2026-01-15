<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { http } from '@/api/http'
import { useOnboardingStore } from '@/stores/onboarding.store'

const router = useRouter()
const onboarding = useOnboardingStore()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function login() {
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = 'Preencha email e senha.'
    return
  }

  loading.value = true
  try {
    const response = await http.post('/auth/login', {
      email: email.value.trim(),
      password: password.value,
    })
    const token = response.data?.token
    const accountId = response.data?.user?.accountId
    if (token) {
      localStorage.setItem('access_token', token)
    }
    if (accountId) {
      onboarding.setAccountCreated(accountId)
      await syncWhatsappStatus(accountId)
    }
    onboarding.setUserCreated()
    router.push('/')
  } catch (err) {
    error.value = 'Email ou senha invalidos.'
  } finally {
    loading.value = false
  }
}

async function syncWhatsappStatus(accountId: string) {
  try {
    const { data } = await http.get('/whatsapp/status', {
      params: { accountId },
    })
    const status = (data?.status || '').toString().toLowerCase()
    const connected = status === 'connected' || status === 'main' || status === 'normal'
    if (connected) {
      onboarding.setWppConnected()
    } else {
      onboarding.setWppDisconnected()
    }
  } catch {
    onboarding.setWppDisconnected()
  }
}

async function loginWithFacebook() {
  const response = await http.get('/auth/meta/url', {
    params: { returnUrl: window.location.origin },
  })
  const url = response.data?.url
  if (url) {
    window.location.href = url
  }
}
</script>

<template>
  <div class="auth-form card">
    <div class="pill">Acesso rápido</div>
    <div class="form-headline">
      <h1>Entrar</h1>
      <p class="muted">Acesse o painel e continue o fluxo.</p>
    </div>

    <div class="form compact">
      <div class="field">
        <label>Email</label>
        <input v-model="email" class="input" placeholder="voce@splus.com" />
      </div>
      <div class="field">
        <label>Senha</label>
        <input v-model="password" class="input" type="password" placeholder="••••••••" />
      </div>
    </div>

    <p v-if="error" class="error-text">{{ error }}</p>

    <div class="form-actions spaced">
      <button class="btn primary" :disabled="loading" @click="login">
        {{ loading ? 'Entrando...' : 'Entrar' }}
      </button>
      <router-link class="btn ghost" to="/signup/account">Criar conta</router-link>
    </div>
    <div class="form-actions">
      <button class="btn ghost" type="button" @click="loginWithFacebook">
        Entrar com Facebook
      </button>
    </div>
  </div>
</template>
