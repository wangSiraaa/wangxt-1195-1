import React from 'react'
import { Layout, Menu, Button, Avatar, Dropdown, Space, Tag, Badge } from 'antd'
import {
  DashboardOutlined,
  FileWarningOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  UserOutlined,
  LogoutOutlined,
  SafetyOutlined
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore, useAppStore } from '../store'

const { Header, Sider, Content } = Layout

export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const roleMap = useAppStore((s) => s.roleMap)

  const roleColor = {
    production: 'blue',
    qa: 'orange',
    validation: 'purple',
    admin: 'green'
  }

  const menuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: '/deviations', icon: <FileWarningOutlined />, label: '偏差管理' },
    { key: '/measures', icon: <ToolOutlined />, label: '纠正预防措施' },
    { key: '/validations', icon: <CheckCircleOutlined />, label: '验证活动' },
    { key: '/escalations', icon: <WarningOutlined />, label: '升级提醒' }
  ]

  const userMenu = {
    items: [
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: '个人信息',
        disabled: true
      },
      { type: 'divider' },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        onClick: async () => {
          await logout()
          navigate('/login', { replace: true })
        }
      }
    ]
  }

  const selectedKey = menuItems.some(i => location.pathname.startsWith(i.key))
    ? menuItems.find(i => location.pathname.startsWith(i.key)).key
    : '/dashboard'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} style={{ background: '#001529' }}>
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          gap: 8,
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }}>
          <SafetyOutlined style={{ fontSize: 22, color: '#1677ff' }} />
          <span>制药CAPA管理</span>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ border: 'none', marginTop: 8 }}
        />
      </Sider>
      <Layout>
        <Header className="layout-header" style={{ height: 64, lineHeight: '64px', padding: '0 24px' }}>
          <div>
            <h2 className="page-title" style={{ margin: 0 }}>
              {menuItems.find(i => i.key === selectedKey)?.label || '系统'}
            </h2>
          </div>
          <div className="user-info">
            <Space>
              {user && (
                <>
                  <Tag color={roleColor[user.role]} style={{ margin: 0 }}>
                    {roleMap[user.role] || user.role}
                  </Tag>
                  <Dropdown menu={userMenu} placement="bottomRight">
                    <Space style={{ cursor: 'pointer' }}>
                      <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1677ff' }} />
                      <span>{user.name}</span>
                    </Space>
                  </Dropdown>
                  <Button type="link" danger icon={<LogoutOutlined />} onClick={async () => {
                    await logout()
                    navigate('/login', { replace: true })
                  }}>退出</Button>
                </>
              )}
            </Space>
          </div>
        </Header>
        <Content style={{ padding: 16, background: '#f0f2f5' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
