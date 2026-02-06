<script setup lang="ts">
import { useRouter } from 'vue-router'
import WhatsappConnectModal from '@/components/WhatsappConnectModal.vue'

const router = useRouter()
</script>

<template>
  <div class="whatsapp-page">
    <header class="page-head">
      <div>
        <p class="eyebrow">Passo 3 de 3</p>
        <h1>Conecte o canal e comece a receber leads</h1>
        <p class="muted">Ative o WhatsApp via Cloud API ou QR Code e siga o fluxo.</p>
      </div>
      <button class="ghost" type="button" @click="router.push('/')">Fechar</button>
    </header>

    <div class="card">
      <WhatsappConnectModal @close="router.push('/')" />
    </div>
  </div>
</template>

<style scoped>
:global(body) {
  background: radial-gradient(circle at 10% 20%, #e8f6ef 0%, #fdf3e7 30%, #f7eafc 60%, #f9f9ff 100%);
}

.whatsapp-page {
  min-height: 100vh;
  max-width: 860px;
  margin: 0 auto;
  padding: 48px 20px 64px;
  display: grid;
  gap: 16px;
}

.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 12px;
  color: #6b7280;
  margin: 0 0 4px;
}

.page-head h1 {
  margin: 0;
  color: #0b1c33;
  font-size: 30px;
  line-height: 1.2;
}

.muted {
  color: #6b7280;
  margin: 4px 0 0;
}

.ghost {
  border: 1px solid #e2e8f0;
  background: #fff;
  padding: 8px 12px;
  border-radius: 10px;
  color: #0b1c33;
  cursor: pointer;
}

.ghost:hover {
  border-color: #cbd5e1;
}

.card {
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  box-shadow:
    0 10px 24px rgba(15, 23, 42, 0.06),
    0 1px 3px rgba(15, 23, 42, 0.08);
  padding: 16px;
}

@media (max-width: 720px) {
  .page-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
