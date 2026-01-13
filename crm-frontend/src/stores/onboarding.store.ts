import { defineStore } from 'pinia'

type OnboardingState = {
  hasAccount: boolean
  hasUser: boolean
  wppConnected: boolean
  accountId: string | null
}

const STORAGE_KEY = 'onboarding_state_v1'

function loadState(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { hasAccount: false, hasUser: false, wppConnected: false, accountId: null }
    }
    const parsed = JSON.parse(raw)
    return {
      hasAccount: !!parsed.hasAccount,
      hasUser: !!parsed.hasUser,
      wppConnected: !!parsed.wppConnected,
      accountId: typeof parsed.accountId === 'string' ? parsed.accountId : null,
    }
  } catch {
    return { hasAccount: false, hasUser: false, wppConnected: false, accountId: null }
  }
}

function saveState(state: OnboardingState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const useOnboardingStore = defineStore('onboarding', {
  state: (): OnboardingState => loadState(),

  actions: {
    setAccountCreated(accountId: string) {
      this.hasAccount = true
      this.accountId = accountId
      saveState(this.$state)
    },
    setUserCreated() {
      this.hasUser = true
      saveState(this.$state)
    },
    setWppConnected() {
      this.wppConnected = true
      saveState(this.$state)
    },
    setWppDisconnected() {
      this.wppConnected = false
      saveState(this.$state)
    },
    reset() {
      this.hasAccount = false
      this.hasUser = false
      this.wppConnected = false
      this.accountId = null
      saveState(this.$state)
    },
  },
})
