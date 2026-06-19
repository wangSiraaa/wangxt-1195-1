import React, { useState } from 'react'
import { Form, Input, Button, Select, Card, message, Spin, App } from 'antd'
import { UserOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store'

export default function LoginPage() {
  const navigate = useNavigate()
  const { notification } = App.useApp()
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((s) => s.login)
  const [form] = Form.useForm()

  const onFinish = async (values) => {
    setLoading(true)
    try {
      await login(values.username, values.password)
      notification.success({ message: '登录成功', description: '欢迎使用制药偏差CAPA闭环管理系统' })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      notification.error({ message: '登录失败', description: err.message || '请检查用户名和密码' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <Card className="login-card" bordered={false}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <SafetyOutlined style={{ fontSize: 52, color: '#1677ff' }} />
        </div>
        <h2 className="login-title">制药偏差CAPA管理系统</h2>
        <p className="login-subtitle">符合GMP要求的偏差纠正预防闭环管理</p>
        <Spin spinning={loading}>
          <Form form={form} layout="vertical" onFinish={onFinish} size="large" initialValues={{ username: 'prod01', password: 'prod123' }}>
            <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<UserOutlined />} placeholder="请输入用户名" />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block style={{ height: 44 }}>
                登录系统
              </Button>
            </Form.Item>
          </Form>
        </Spin>
        <div className="login-tips">
          <p><strong>演示账号：</strong></p>
          <p>生产班组：prod01 / prod123（张伟）</p>
          <p>QA工程师：qa01 / qa123（王芳）</p>
          <p>验证工程师：val01 / val123（刘洋）</p>
          <p>系统管理员：admin / admin123</p>
        </div>
      </Card>
    </div>
  )
}
