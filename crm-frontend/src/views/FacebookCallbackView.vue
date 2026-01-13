<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useOnboardingStore } from '@/stores/onboarding.store'
import { http } from '@/api/http'

const route = useRoute()
const router = useRouter()
const onboarding = useOnboardingStore()
const status = ref('Finalizando login...')
const detail = ref('Conectando o WhatsApp Cloud API.')

onMounted(() => {
  const token = route.query.token as string | undefined
  const accountId = route.query.accountId as string | undefined
  if (token) {
    localStorage.setItem('access_token', token)
  }
  if (accountId) {
    onboarding.setAccountCreated(accountId)
  }
  onboarding.setUserCreated()
  if (token && accountId) {
    http
      .post('/whatsapp/connect/cloud/auto', { accountId })
      .then((response) => {
        if (response.data?.error) {
          status.value = 'Falha na conexao'
          detail.value = 'Login com Facebook necessario para continuar.'
          return
        }
        status.value = 'Conexao iniciada'
        detail.value = 'Abrindo configuracao do WhatsApp.'
      })
      .catch(() => {
        status.value = 'Falha na conexao'
        detail.value = 'Voce pode configurar manualmente na proxima tela.'
      })
      .finally(() => {
        setTimeout(() => router.replace('/setup/whatsapp'), 800)
      })
  } else {
    status.value = 'Login incompleto'
    detail.value = 'Tente novamente com o Facebook.'
    setTimeout(() => router.replace('/login'), 800)
  }
})
</script>

<template>
  <div class="page">
    <h1>{{ status }}</h1>
    <p class="muted">{{ detail }}</p>
  </div>
</template>
