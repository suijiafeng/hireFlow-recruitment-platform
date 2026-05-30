import { useQuery } from '@tanstack/react-query';
import { PERMISSIONS } from '@hireflow/shared';
import { Card, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { auditApi, rbacApi } from '../../api';
import type { ActivityItem, Role } from '../../api/types';
import { useAuthStore } from '../../stores/auth';

const DATA_SCOPE_LABEL: Record<string, string> = {
  ALL: '全部数据',
  DEPARTMENT: '本部门',
  OWN: '仅本人',
  ASSIGNED: '仅被指派',
};

function RolesTab() {
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rbacApi.roles });
  return (
    <Table<Role>
      rowKey="id"
      scroll={{ x: 900 }}
      loading={rolesQuery.isLoading}
      dataSource={rolesQuery.data}
      pagination={false}
      columns={[
        { title: '角色', dataIndex: 'name', width: 160 },
        { title: '角色码', dataIndex: 'code', width: 180, render: (v: string) => <code>{v}</code> },
        {
          title: '数据范围',
          dataIndex: 'dataScope',
          width: 130,
          render: (v: string) => <Tag>{DATA_SCOPE_LABEL[v] ?? v}</Tag>,
        },
        { title: '成员数', width: 90, render: (_, r) => r._count.users },
        {
          title: '功能点权限',
          render: (_, r) => (
            <>
              {r.permissions.map(({ permission }) => (
                <Tag key={permission.id} className="u-mb-4">
                  {permission.name}
                </Tag>
              ))}
              {r.permissions.length === 0 && <span className="u-muted">（门户角色，无后台权限）</span>}
            </>
          ),
        },
      ]}
    />
  );
}

/** 审计日志：全实体操作留痕检索 */
function AuditTab() {
  const [page, setPage] = useState(1);
  const auditQuery = useQuery({ queryKey: ['audit', page], queryFn: () => auditApi.recent(page) });
  return (
    <Table<ActivityItem>
      rowKey="id"
      scroll={{ x: 1100 }}
      loading={auditQuery.isLoading}
      dataSource={auditQuery.data?.items}
      pagination={{
        current: page,
        pageSize: 20,
        total: auditQuery.data?.total,
        onChange: setPage,
        showTotal: (total) => `共 ${total} 条留痕`,
      }}
      columns={[
        {
          title: '时间',
          dataIndex: 'createdAt',
          width: 170,
          render: (v: string) => dayjs(v).format('MM-DD HH:mm:ss'),
        },
        {
          title: '操作人',
          width: 130,
          render: (_, r) => r.actor?.name ?? r.actorName ?? '系统',
        },
        { title: '动作', dataIndex: 'action', width: 240, render: (v: string) => <code>{v}</code> },
        { title: '实体', dataIndex: 'entityType', width: 120, render: (v?: string) => v ?? '-' },
        {
          title: '详情',
          render: (_, r) => (
            <Typography.Text className="u-meta" ellipsis>
              {r.payload ? JSON.stringify(r.payload) : '-'}
            </Typography.Text>
          ),
        },
      ]}
    />
  );
}

export function SettingsPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const items = [
    { key: 'roles', label: '角色与权限', children: <RolesTab /> },
    ...(hasPermission(PERMISSIONS.CONFIG_MANAGE)
      ? [{ key: 'audit', label: '审计日志', children: <AuditTab /> }]
      : []),
  ];
  return (
    <div className="settings-page">
      {/* 页面头部 */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">系统设置</h1>
          <p className="page-header-subtitle">管理角色权限、查看操作审计日志</p>
        </div>
      </div>

      {/* 设置内容 */}
      <Card className="settings-content-card">
        <Tabs items={items} className="settings-tabs" />
      </Card>
    </div>
  );
}
