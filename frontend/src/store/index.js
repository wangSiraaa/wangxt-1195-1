import { create } from 'zustand'
import { api } from '../services/api'

const savedToken = localStorage.getItem('capa_token')
const savedUser = localStorage.getItem('capa_user')

export const useAuthStore = create((set) => ({
  token: savedToken || null,
  user: savedUser ? JSON.parse(savedUser) : null,
  loading: false,
  error: null,

  login: async (username, password) => {
    set({ loading: true, error: null })
    try {
      const res = await api.auth.login({ username, password })
      const { token, user } = res
      localStorage.setItem('capa_token', token)
      localStorage.setItem('capa_user', JSON.stringify(user))
      set({ token, user, loading: false })
      return true
    } catch (err) {
      set({ error: err.message, loading: false })
      throw err
    }
  },

  logout: async () => {
    try { await api.auth.logout() } catch (_) {}
    localStorage.removeItem('capa_token')
    localStorage.removeItem('capa_user')
    set({ token: null, user: null })
  },

  fetchMe: async () => {
    try {
      const res = await api.auth.me()
      localStorage.setItem('capa_user', JSON.stringify(res.user))
      set({ user: res.user })
    } catch (_) {}
  }
}))

export const useAppStore = create((set) => ({
  roleMap: {
    production: '生产班组',
    qa: 'QA工程师',
    validation: '验证工程师',
    admin: '系统管理员'
  },
  statusMap: {
    draft: { name: '草稿', color: 'default' },
    submitted: { name: '已提交', color: 'blue' },
    root_cause_pending: { name: '待根因分析', color: 'cyan' },
    root_cause_analysis: { name: '根因分析中', color: 'cyan' },
    measures_pending: { name: '待制定措施', color: 'geekblue' },
    measures_implementing: { name: '措施执行中', color: 'geekblue' },
    validation_pending: { name: '待验证', color: 'purple' },
    validating: { name: '验证中', color: 'purple' },
    closed: { name: '已关闭', color: 'green' },
    cancelled: { name: '已取消', color: 'default' }
  },
  severityMap: {
    minor: { name: '一般偏差', color: 'blue' },
    major: { name: '重大偏差', color: 'orange' },
    critical: { name: '严重偏差', color: 'red' }
  },
  measureStatusMap: {
    pending: { name: '待执行', color: 'default' },
    in_progress: { name: '执行中', color: 'blue' },
    completed: { name: '已完成', color: 'cyan' },
    verified: { name: '已验证', color: 'green' },
    overdue: { name: '超期', color: 'red' }
  },
  measureTypeMap: {
    correction: { name: '纠正措施', color: 'blue' },
    preventive: { name: '预防措施', color: 'purple' }
  },
  validationStatusMap: {
    pending: { name: '待启动', color: 'default' },
    in_progress: { name: '进行中', color: 'blue' },
    passed: { name: '验证通过', color: 'green' },
    failed: { name: '验证未通过', color: 'red' },
    needs_retest: { name: '需复测', color: 'orange' }
  },
  escalationStatusMap: {
    pending: { name: '待确认', color: 'red' },
    acknowledged: { name: '已确认', color: 'blue' },
    resolved: { name: '已解决', color: 'green' }
  }
}))
