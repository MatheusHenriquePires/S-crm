import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export const http = axios.create({
  baseURL,
})

let isRedirecting401 = false

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    if (status === 401 && !isRedirecting401) {
      isRedirecting401 = true
      try {
        localStorage.removeItem('access_token')
        localStorage.removeItem('onboarding_state_v1')
      } catch {
        // ignore storage errors
      }
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)
