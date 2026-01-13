<script setup lang="ts">
import { useRouter } from 'vue-router'
import WhatsappConnectModal from '@/components/WhatsappConnectModal.vue'

const router = useRouter()
</script>

<template>
  <div class="form page">
    <div class="tag">Passo 3 de 3</div>
    <div>
      <h1>Conectar WhatsApp</h1>
      <p class="muted">Conecte seu numero para comecar a receber leads.</p>
    </div>

    <WhatsappConnectModal @close="router.push('/')" />
  </div>
</template>
