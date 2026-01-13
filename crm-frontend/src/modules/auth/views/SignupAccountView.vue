<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
const router = useRouter()

import { useOnboardingStore } from '@/stores/onboarding.store'
import { http } from '@/api/http'

const onboarding = useOnboardingStore()

const name = ref('')
const ownerName = ref('')
const email = ref('')
const error = ref('')
const loading = ref(false)

async function next() {
  error.value = ''
  if (!name.value.trim()) {
    error.value = 'Preencha o nome da empresa.'
    return
  }

  loading.value = true
  try {
    const response = await http.post('/auth/signup/account', {
      name: name.value.trim(),
      ownerName: ownerName.value.trim() || null,
      email: email.value.trim() || null,
    })
    const accountId = response.data?.id
    if (!accountId) {
      throw new Error('Account id missing')
    }
    onboarding.setAccountCreated(accountId)
    router.push('/signup/user')
  } catch (err) {
    error.value = 'Nao foi possivel criar a conta.'
  } finally {
    loading.value = false
  }
}

</script>

<template>
  <div class="form page">
    <div class="tag">Passo 1 de 3</div>
    <div>
      <h1>Criar sua conta</h1>
      <p class="muted">Primeiro, cadastre sua empresa e o contato principal.</p>
    </div>

    <div class="form">
      <div class="field">
        <label>Nome da empresa</label>
        <input v-model="name" class="input" placeholder="S+ Studio" />
      </div>
      <div class="field">
        <label>Seu nome</label>
        <input v-model="ownerName" class="input" placeholder="Matheus Henrique" />
      </div>
      <div class="field">
        <label>Email da empresa</label>
        <input v-model="email" class="input" placeholder="contato@splus.com" />
      </div>
    </div>

    <p v-if="error" class="muted">{{ error }}</p>

    <div class="form-actions">
      <button class="btn primary" :disabled="loading" @click="next">
        {{ loading ? 'Salvando...' : 'Continuar' }}
      </button>
      <button class="btn ghost" type="button">Falar com suporte</button>
    </div>

    <div class="muted">
      Ja tem acesso? <router-link to="/login">Entrar</router-link>
    </div>
  </div>
</template>
