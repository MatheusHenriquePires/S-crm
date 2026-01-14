import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export const http = axios.create({
  baseURL,
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
