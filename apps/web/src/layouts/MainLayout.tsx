import {
  AppstoreOutlined,
  DashboardOutlined,
  LogoutOutlined,
  ProfileOutlined,
  ScheduleOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Dropdown, Layout, Menu, Space, Typography } from 'antd';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuthStore } from '../stores/auth';

const { Header, Sider, Content } = Layout;

const MENU_ITEMS = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '数据大盘' },
  { key: '/jobs', icon: <ProfileOutlined />, label: '职位管理' },
  { key: '/candidates', icon: <TeamOutlined />, label: '候选人' },
  { key: '/pipeline', icon: <AppstoreOutlined />, label: '招聘看板' },
  { key: '/interviews', icon: <ScheduleOutlined />, label: '面试管理' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
];

export function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user, logout } = useAuthStore();

  if (!token) return <Navigate to="/login" replace />;

  const selectedKey = MENU_ITEMS.find((item) => location.pathname.startsWith(item.key))?.key;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={208}>
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: 1,
          }}
        >
          智能招聘平台
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKey ? [selectedKey] : []}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            height: 56,
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
          }}
        >
          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  onClick: () => {
                    logout();
                    navigate('/login');
                  },
                },
              ],
            }}
          >
            <Space style={{ cursor: 'pointer' }}>
              <Avatar size="small" icon={<UserOutlined />} />
              <Typography.Text>{user?.name}</Typography.Text>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ padding: 16, overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
