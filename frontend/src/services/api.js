import axios from 'axios'

const request = axios.create({
  baseURL: '/',
  timeout: 60000
})

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('capa_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response) {
      const data = error.response.data
      if (error.response.status === 401) {
        localStorage.removeItem('capa_token')
        localStorage.removeItem('capa_user')
        if (!window.location.hash.includes('#/login')) {
          window.location.hash = '#/login'
        }
      }
      return Promise.reject(new Error(data.error || data.message || '请求失败'))
    }
    return Promise.reject(error)
  }
)

export const api = {
  auth: {
    login: (data) => request.post('/api/auth/login', data),
    logout: () => request.post('/api/auth/logout'),
    me: () => request.get('/api/auth/me')
  },
  users: {
    list: (params) => request.get('/api/users', { params }),
    roles: () => request.get('/api/users/roles'),
    byRole: (role) => request.get(`/api/users/by-role/${role}`)
  },
  deviations: {
    list: (params) => request.get('/api/deviations', { params }),
    stats: () => request.get('/api/deviations/stats'),
    detail: (id) => request.get(`/api/deviations/${id}`),
    create: (data) => request.post('/api/deviations', data),
    update: (id, data) => request.put(`/api/deviations/${id}`, data),
    submit: (id, data) => request.post(`/api/deviations/${id}/submit`, data),
    qaEvaluate: (id, data) => request.post(`/api/deviations/${id}/qa-evaluate`, data),
    saveRootCause: (id, data) => request.post(`/api/deviations/${id}/save-root-cause`, data),
    approveRootCause: (id, data) => request.post(`/api/deviations/${id}/approve-root-cause`, data),
    toMeasuresImplementing: (id) => request.post(`/api/deviations/${id}/to-measures-implementing`),
    toValidationPending: (id) => request.post(`/api/deviations/${id}/to-validation-pending`),
    startValidation: (id) => request.post(`/api/deviations/${id}/start-validation`),
    close: (id, data) => request.post(`/api/deviations/${id}/close`, data),
    cancel: (id, data) => request.post(`/api/deviations/${id}/cancel`, data)
  },
  measures: {
    list: (params) => request.get('/api/measures', { params }),
    detail: (id) => request.get(`/api/measures/${id}`),
    create: (data) => request.post('/api/measures', data),
    update: (id, data) => request.put(`/api/measures/${id}`, data),
    start: (id) => request.post(`/api/measures/${id}/start`),
    complete: (id, data) => request.post(`/api/measures/${id}/complete`, data),
    verify: (id, data) => request.post(`/api/measures/${id}/verify`, data),
    remove: (id) => request.delete(`/api/measures/${id}`),
    checkOverdue: () => request.get('/api/measures/check-overdue')
  },
  validations: {
    list: (params) => request.get('/api/validations', { params }),
    detail: (id) => request.get(`/api/validations/${id}`),
    create: (data) => request.post('/api/validations', data),
    update: (id, data) => request.put(`/api/validations/${id}`, data),
    start: (id) => request.post(`/api/validations/${id}/start`),
    submitResult: (id, data) => request.post(`/api/validations/${id}/result`, data),
    remove: (id) => request.delete(`/api/validations/${id}`)
  },
  escalations: {
    list: (params) => request.get('/api/escalations', { params }),
    detail: (id) => request.get(`/api/escalations/${id}`),
    create: (data) => request.post('/api/escalations', data),
    acknowledge: (id, data) => request.post(`/api/escalations/${id}/acknowledge`, data),
    resolve: (id, data) => request.post(`/api/escalations/${id}/resolve`, data),
    levels: () => request.get('/api/escalations/levels/definitions')
  },
  evidences: {
    list: (params) => request.get('/api/evidences', { params }),
    upload: (formData, evidenceType) => {
      return request.post('/api/evidences/upload', formData, {
        headers: { 'evidence-type': evidenceType || 'general', 'Content-Type': 'multipart/form-data' }
      })
    },
    remove: (id) => request.delete(`/api/evidences/${id}`)
  }
}

export default request
