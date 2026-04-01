import {
  AppstoreOutlined,
  AuditOutlined,
  CommentOutlined,
  DashboardOutlined,
  IdcardOutlined,
  LogoutOutlined,
  ProfileOutlined,
  RocketOutlined,
  ScheduleOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { ROLE_LABEL, type RoleCode } from '@hireflow/shared';
import { Avatar, Dropdown, Layout, Menu, Space, Tag, Typography } from 'antd';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { NotificationBell } from '../components/NotificationBell';
import { useAuthStore } from '../stores/auth';

const { Header, Sider, Content } = Layout;

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': '数据大盘',
  '/jobs': '职位管理',
  '/candidates': '候选人',
  '/pipeline': '招聘看板',
  '/interviews': '面试管理',
  '/offers': '录用管理',
  '/onboarding': '入职管理',
  '/helpdesk': '入职问答',
  '/settings': '系统设置',
};

const MENU_ITEMS = [
  {
    type: 'group' as const,
    label: '招聘',
    children: [
      { key: '/dashboard', icon: <DashboardOutlined />, label: '数据大盘' },
      { key: '/jobs', icon: <ProfileOutlined />, label: '职位管理' },
      { key: '/candidates', icon: <TeamOutlined />, label: '候选人' },
      { key: '/pipeline', icon: <AppstoreOutlined />, label: '招聘看板' },
      { key: '/interviews', icon: <ScheduleOutlined />, label: '面试管理' },
    ],
  },
  {
    type: 'group' as const,
    label: '录用与入职',
    children: [
      { key: '/offers', icon: <AuditOutlined />, label: '录用管理' },
      { key: '/onboarding', icon: <IdcardOutlined />, label: '入职管理' },
      { key: '/helpdesk', icon: <CommentOutlined />, label: '入职问答' },
    ],
  },
  {
    type: 'group' as const,
    label: '系统',
    children: [{ key: '/settings', icon: <SettingOutlined />, label: '系统设置' }],
  },
];

export function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user, logout } = useAuthStore();

  if (!token) return <Navigate to="/login" replace />;

  const selectedKey = Object.keys(PAGE_TITLES).find((key) => location.pathname.startsWith(key));
  const primaryRole = user?.roles[0] as RoleCode | undefined;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={216}>
        <div
          style={{
            height: 60,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 20px',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: 'linear-gradient(135deg, #2a78d6 0%, #6db3ff 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              flexShrink: 0,
            }}
          >
            <RocketOutlined style={{ fontSize: 17 }} />
          </div>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>ART 智能招聘</div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>AI Recruiting</div>
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKey ? [selectedKey] : []}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 'none' }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 56,
            boxShadow: '0 1px 3px rgba(15, 30, 70, 0.06)',
            zIndex: 1,
          }}
        >
          <Typography.Text strong style={{ fontSize: 16 }}>
            {selectedKey ? PAGE_TITLES[selectedKey] : ''}
          </Typography.Text>
          <Space size={12}>
            <NotificationBell />
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
            <Space style={{ cursor: 'pointer' }} size={8}>
              <Avatar size="small" style={{ background: '#2a78d6' }} icon={<UserOutlined />} />
              <Typography.Text>{user?.name}</Typography.Text>
              {primaryRole && ROLE_LABEL[primaryRole] && (
                <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                  {ROLE_LABEL[primaryRole]}
                </Tag>
              )}
            </Space>
          </Dropdown>
          </Space>
        </Header>
        <Content style={{ padding: 24, overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
