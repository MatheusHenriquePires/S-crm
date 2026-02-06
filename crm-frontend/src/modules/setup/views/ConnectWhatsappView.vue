<script setup lang="ts">
import { useRouter } from 'vue-router'
import WhatsappConnectModal from '@/components/WhatsappConnectModal.vue'

const router = useRouter()
</script>

<template>
  <div class="whatsapp-setup">
    <div class="hero">
      <div class="badge">Passo 3 de 3</div>
      <h1>Conecte o WhatsApp e receba leads</h1>
      <p>Ative o canal para responder com velocidade e organizar tudo no CRM.</p>

      <div class="hero-steps">
        <div class="step">
          <span class="dot ready"></span>
          <div>
            <strong>Prepare o número</strong>
            <p>Use o chip que vai atender seus clientes.</p>
          </div>
        </div>
        <div class="step">
          <span class="dot ready"></span>
          <div>
            <strong>Leia o QR</strong>
            <p>Conecte em segundos com o WhatsApp Web.</p>
          </div>
        </div>
        <div class="step">
          <span class="dot ready"></span>
          <div>
            <strong>Teste a inbox</strong>
            <p>Envie um “oi” para validar a entrega.</p>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Canal</p>
          <h2>Conectar WhatsApp</h2>
          <p class="muted">Escolha Cloud API ou QR Code e acompanhe o status.</p>
        </div>
        <button class="ghost" type="button" @click="router.push('/')">Fechar</button>
      </div>

      <div class="panel-body">
        <WhatsappConnectModal @close="router.push('/')" />
      </div>
    </div>
  </div>
</template>

<style scoped>
:global(body) {
  background: radial-gradient(circle at 10% 20%, #e8f6ef 0%, #fdf3e7 30%, #f7eafc 60%, #f9f9ff 100%);
}

.whatsapp-setup {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  padding: 48px 72px;
}

.hero {
  align-self: center;
  max-width: 520px;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: #0b8f5a;
  color: #fff;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.hero h1 {
  margin: 16px 0 8px;
  font-size: 40px;
  line-height: 1.1;
  color: #0b1c33;
}

.hero p {
  color: #42526e;
  margin-bottom: 24px;
}

.hero-steps {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.step {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid #e2e8f0;
}

.step strong {
  color: #0b1c33;
}

.step p {
  color: #5c6c85;
  margin: 2px 0 0;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  margin-top: 6px;
}

.dot.ready {
  background: #0b8f5a;
  box-shadow: 0 0 0 4px rgba(11, 143, 90, 0.15);
}

.panel {
  background: #ffffff;
  border-radius: 20px;
  box-shadow:
    0 15px 40px rgba(15, 23, 42, 0.06),
    0 1px 4px rgba(15, 23, 42, 0.08);
  padding: 28px;
  border: 1px solid #e2e8f0;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.panel-head h2 {
  margin: 4px 0;
  color: #0b1c33;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 12px;
  color: #6b7280;
  margin: 0;
}

.muted {
  color: #6b7280;
  margin: 0;
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

.panel-body {
  padding: 8px 0;
}

@media (max-width: 1080px) {
  .whatsapp-setup {
    grid-template-columns: 1fr;
    padding: 32px 24px;
  }

  .panel {
    order: -1;
  }
}
</style>
