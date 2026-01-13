<template>
  <div class="setup-layout page">
    <section class="setup-hero">
      <div class="brand-mark">S+</div>
      <h1 class="hero-title">Conecte o canal e comece a receber leads</h1>
      <p class="muted">
        Integre o WhatsApp para dar continuidade ao fluxo. Rapido e seguro.
      </p>
      <div class="setup-steps">
        <div class="step-item">
          <span class="step-dot"></span>
          <div>
            <strong>Prepare o numero</strong>
            <div class="muted">Use o chip que vai atender.</div>
          </div>
        </div>
        <div class="step-item">
          <span class="step-dot"></span>
          <div>
            <strong>Leia o QR</strong>
            <div class="muted">Ative em segundos.</div>
          </div>
        </div>
        <div class="step-item">
          <span class="step-dot"></span>
          <div>
            <strong>Teste a inbox</strong>
            <div class="muted">Envie um oi rapido.</div>
          </div>
        </div>
      </div>
    </section>

    <section class="setup-panel">
      <router-view />
    </section>
  </div>
</template>
