<template>
  <div class="auth-layout page">
    <section class="auth-hero">
      <div class="brand-mark">S+</div>
      <div class="tag">Kinbox inspired workflow</div>
      <h1 class="hero-title">Um CRM simples, com energia de studio</h1>
      <p class="muted">
        Um onboarding direto, sem peso. Organize o funil com clareza e ritmo.
      </p>
      <div class="hero-cards">
        <div class="mini-card">
          <strong>01</strong>
          <div class="muted">Conta criada</div>
        </div>
        <div class="mini-card">
          <strong>02</strong>
          <div class="muted">Equipe pronta</div>
        </div>
        <div class="mini-card">
          <strong>03</strong>
          <div class="muted">WhatsApp live</div>
        </div>
      </div>
    </section>

    <section class="auth-panel">
      <router-view />
    </section>
  </div>
</template>
