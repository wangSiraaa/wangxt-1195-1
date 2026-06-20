import React from 'react';
import { Layout, Menu, Avatar, Dropdown, Button } from 'antd';
import {
  DashboardOutlined,
  FileTextOutlined,
  SearchOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  UserOutlined,
  LogoutOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';

const { Header, Sider, Content } = Layout;

const roleNames = {
  production: '生产人员',
  qa: 'QA人员',
  validation: '验证工程师',
  admin: '管理员'
};

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const menuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: '/deviations', icon: <FileTextOutlined />, label: '偏差管理' },
    { key: '/root-causes', icon: <SearchOutlined />, label: '根因分析' },
    { key: '/actions', icon: <ToolOutlined />, label: '纠正预防措施' },
    { key: '/verifications', icon: <CheckCircleOutlined />, label: '效果验证' },
    { key: '/escalations', icon: <WarningOutlined />, label: '升级管理' }
  ];

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => {
        logout();
        navigate('/login');
      }
    }
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={220}>
        <div style={{ 
          height: 64, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          color: '#fff', 
          fontSize: 16, 
          fontWeight: 'bold',
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }}>
          CAPA闭环管理
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ 
          background: '#fff', 
          padding: '0 24px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
        }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#333' }}>
            制药偏差CAPA闭环管理系统
          </div>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}>
              <Avatar icon={<UserOutlined />} />
              <span>
                {user?.name} ({roleNames[user?.role] || user?.role})
              </span>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ margin: 0, background: '#f0f2f5', overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
