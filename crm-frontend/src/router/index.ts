import { createRouter, createWebHistory } from 'vue-router'

const AuthLayout = () => import('@/layouts/AuthLayout.vue')
const SetupLayout = () => import('@/layouts/SetupLayout.vue')
const AppLayout = () => import('@/layouts/AppLayout.vue')

const SignupAccountView = () => import('@/modules/auth/views/SignupAccountView.vue')
const SignupUserView = () => import('@/modules/auth/views/SignupUserView.vue')
const LoginView = () => import('@/modules/auth/views/LoginView.vue')
const ConnectWhatsappView = () => import('@/modules/setup/views/ConnectWhatsappView.vue')
const ConversationsView = () => import('@/modules/crm/conversations/views/ConversationsView.vue')
const PipelineView = () => import('@/modules/crm/pipeline/views/PipelineView.vue')
const FacebookCallbackView = () => import('@/views/FacebookCallbackView.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/signup',
      component: AuthLayout,
      children: [
        { path: 'account', component: SignupAccountView },
        { path: 'user', component: SignupUserView },
      ],
    },
    {
      path: '/login',
      component: AuthLayout,
      children: [{ path: '', component: LoginView }],
    },
    {
      path: '/auth/facebook/callback',
      component: AuthLayout,
      children: [{ path: '', component: FacebookCallbackView }],
    },
    {
      path: '/setup',
      component: SetupLayout,
      children: [{ path: 'whatsapp', component: ConnectWhatsappView }],
    },
    {
      path: '/',
      component: AppLayout,
      children: [
        { path: '', component: ConversationsView },
        { path: 'pipeline', component: PipelineView },
      ],
    },
  ],
})

// ==============================
// Guard: obriga seguir onboarding
// ==============================
type OnboardingState = {
  hasAccount: boolean
  hasUser: boolean
  wppConnected: boolean
}

function readOnboarding(): OnboardingState {
  try {
    const raw = localStorage.getItem('onboarding_state_v1')
    if (!raw) return { hasAccount: false, hasUser: false, wppConnected: false }
    const s = JSON.parse(raw)
    return {
      hasAccount: !!s.hasAccount,
      hasUser: !!s.hasUser,
      wppConnected: !!s.wppConnected,
    }
  } catch {
    return { hasAccount: false, hasUser: false, wppConnected: false }
  }
}

router.beforeEach((to) => {
  const { hasAccount, hasUser, wppConnected } = readOnboarding()

  if (!hasAccount && !to.path.startsWith('/signup') && to.path !== '/login') {
    return '/signup/account'
  }

  if (hasAccount && !hasUser && to.path !== '/signup/user' && to.path !== '/login') {
    return '/signup/user'
  }

  if (hasUser && !wppConnected && !to.path.startsWith('/setup') && to.path !== '/login') {
    return '/setup/whatsapp'
  }

  if (wppConnected && to.path.startsWith('/setup')) {
    return '/'
  }
})

export default router
