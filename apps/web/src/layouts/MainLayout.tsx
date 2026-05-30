import {
  AppstoreOutlined,
  AuditOutlined,
  CommentOutlined,
  DashboardOutlined,
  FundOutlined,
  HomeOutlined,
  IdcardOutlined,
  LogoutOutlined,
  ProfileOutlined,
  RocketOutlined,
  ScheduleOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { PERMISSIONS, ROLE_LABEL, type RoleCode } from '@hireflow/shared';
import { Avatar, Breadcrumb, Dropdown, Layout, Menu, Space, Tag, Typography } from 'antd';
import { useMemo } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { NotificationBell } from '../components/NotificationBell';
import { useAuthStore } from '../stores/auth';

const { Header, Sider, Content } = Layout;

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': '数据大盘',
  '/insights': '数据洞察',
  '/jobs': '职位管理',
  '/candidates': '候选人',
  '/pipeline': '招聘看板',
  '/interviews': '面试管理',
  '/offers': '录用管理',
  '/onboarding': '入职管理',
  '/helpdesk': '入职问答',
  '/settings': '系统设置',
};

/** 菜单项与所需权限码（任一命中即可见；不配 perms = 全员可见）——按钮级权限约定 */
const MENU_DEFS: Array<{
  label: string;
  children: Array<{ key: string; icon: React.ReactNode; label: string; perms?: string[] }>;
}> = [
  {
    label: '招聘',
    children: [
      { key: '/dashboard', icon: <DashboardOutlined />, label: '数据大盘', perms: [PERMISSIONS.DASHBOARD_VIEW] },
      { key: '/insights', icon: <FundOutlined />, label: '数据洞察', perms: [PERMISSIONS.DASHBOARD_VIEW] },
      { key: '/jobs', icon: <ProfileOutlined />, label: '职位管理', perms: [PERMISSIONS.JOB_READ] },
      { key: '/candidates', icon: <TeamOutlined />, label: '候选人', perms: [PERMISSIONS.CANDIDATE_READ] },
      { key: '/pipeline', icon: <AppstoreOutlined />, label: '招聘看板', perms: [PERMISSIONS.JOB_READ] },
      {
        key: '/interviews',
        icon: <ScheduleOutlined />,
        label: '面试管理',
        perms: [PERMISSIONS.INTERVIEW_SCHEDULE, PERMISSIONS.EVALUATION_SUBMIT],
      },
    ],
  },
  {
    label: '录用与入职',
    children: [
      {
        key: '/offers',
        icon: <AuditOutlined />,
        label: '录用管理',
        perms: [PERMISSIONS.OFFER_INITIATE, PERMISSIONS.OFFER_APPROVE],
      },
      { key: '/onboarding', icon: <IdcardOutlined />, label: '入职管理', perms: [PERMISSIONS.ONBOARDING_READ] },
      { key: '/helpdesk', icon: <CommentOutlined />, label: '入职问答' },
    ],
  },
  {
    label: '系统',
    children: [
      {
        key: '/settings',
        icon: <SettingOutlined />,
        label: '系统设置',
        perms: [PERMISSIONS.USER_MANAGE, PERMISSIONS.CONFIG_MANAGE],
      },
    ],
  },
];

/** 登录后的首页 = 第一个有权限看的菜单项（面试官 → 候选人，IT → 入职管理），全不可见则兜底入职问答 */
export function firstVisiblePath(hasPermission: (p: string) => boolean): string {
  const paths = MENU_DEFS.flatMap((group) => group.children);
  return paths.find((item) => !item.perms || item.perms.some((p) => hasPermission(p)))?.key ?? '/helpdesk';
}

export function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user, logout } = useAuthStore();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const menuItems = useMemo(
    () =>
      MENU_DEFS.map((group) => ({
        type: 'group' as const,
        label: group.label,
        children: group.children
          .filter((item) => !item.perms || item.perms.some((p) => hasPermission(p)))
          .map(({ perms: _perms, ...item }) => item),
      })).filter((group) => group.children.length > 0),
    [hasPermission],
  );

  if (!token) return <Navigate to="/login" replace />;

  const selectedKey = Object.keys(PAGE_TITLES).find((key) => location.pathname.startsWith(key));
  const primaryRole = user?.roles[0] as RoleCode | undefined;

  // 面包屑：首页 / 菜单分组 / 当前页（带页面图标）
  const currentGroup = MENU_DEFS.find((g) => g.children.some((c) => c.key === selectedKey));
  const currentItem = currentGroup?.children.find((c) => c.key === selectedKey);
  const breadcrumbItems = [
    { title: <HomeOutlined /> },
    ...(currentGroup ? [{ title: currentGroup.label }] : []),
    ...(selectedKey
      ? [
          {
            title: (
              <Space size={6}>
                {currentItem?.icon}
                <Typography.Text strong>{PAGE_TITLES[selectedKey]}</Typography.Text>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    // 外层锁定视口高度：左侧菜单栏固定，右侧主内容区独立滚动
    <Layout className="layout-root">
      <Sider width={220} breakpoint="xl" collapsedWidth={64}>
        <div className="sider-inner">
          <div className="sider-logo">
            <div className="sider-logo-mark">
              <RocketOutlined />
            </div>
            <div className="sider-logo-text">
              <div className="sider-logo-name">ART 智能招聘</div>
              <div className="sider-logo-sub">AI Recruiting</div>
            </div>
          </div>
          <div className="sider-menu-scroll">
            <Menu
              theme="dark"
              mode="inline"
              selectedKeys={selectedKey ? [selectedKey] : []}
              items={menuItems}
              onClick={({ key }) => navigate(key)}
            />
          </div>
        </div>
      </Sider>
      <Layout className="layout-main">
        <Header className="layout-header">
          <Breadcrumb items={breadcrumbItems} />
          <Space>
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
              <Space size={8} className="header-user">
                <Avatar size="small" className="header-avatar" icon={<UserOutlined />} />
                <Typography.Text>{user?.name}</Typography.Text>
                {primaryRole && ROLE_LABEL[primaryRole] && (
                  <Tag className="u-mr-0">
                    {ROLE_LABEL[primaryRole]}
                  </Tag>
                )}
              </Space>
            </Dropdown>
          </Space>
        </Header>
        {/* 主内容区：唯一滚动容器 */}
        <Content className="layout-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
