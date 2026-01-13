<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
const router = useRouter()

import { useOnboardingStore } from '@/stores/onboarding.store'
import { http } from '@/api/http'

const onboarding = useOnboardingStore()

const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function create() {
  error.value = ''
  if (!onboarding.accountId) {
    error.value = 'Conta nao encontrada. Volte e crie a conta.'
    return
  }
  if (!name.value.trim() || !email.value.trim() || !password.value) {
    error.value = 'Preencha todos os campos.'
    return
  }

  loading.value = true
  try {
    const response = await http.post('/auth/signup/user', {
      accountId: onboarding.accountId,
      name: name.value.trim(),
      email: email.value.trim(),
      password: password.value,
    })
    const token = response.data?.token
    if (token) {
      localStorage.setItem('access_token', token)
    }
    onboarding.setUserCreated()
    router.push('/setup/whatsapp')
  } catch (err) {
    error.value = 'Nao foi possivel criar o usuario.'
  } finally {
    loading.value = false
  }
}

</script>

<template>
  <div class="form page">
    <div class="tag">Passo 2 de 3</div>
    <div>
      <h1>Criar login</h1>
      <p class="muted">Agora defina o acesso administrativo para sua equipe.</p>
    </div>

    <div class="form">
      <div class="field">
        <label>Seu nome</label>
        <input v-model="name" class="input" placeholder="Matheus Henrique" />
      </div>
      <div class="field">
        <label>Seu email</label>
        <input v-model="email" class="input" placeholder="matheus@splus.com" />
      </div>
      <div class="field">
        <label>Senha</label>
        <input v-model="password" class="input" type="password" placeholder="Minimo de 8 caracteres" />
      </div>
    </div>

    <p v-if="error" class="muted">{{ error }}</p>

    <div class="form-actions">
      <button class="btn primary" :disabled="loading" @click="create">
        {{ loading ? 'Criando...' : 'Criar conta' }}
      </button>
      <button class="btn ghost" type="button">Politica de acesso</button>
    </div>

    <div class="muted">
      Ja tem acesso? <router-link to="/login">Entrar</router-link>
    </div>
  </div>
</template>
