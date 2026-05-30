import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, RoleCode } from '@hireflow/shared';
import { Alert, App, Button, Card, Checkbox, Modal, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { auditApi, rbacApi, usersApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { ActivityItem, PermissionDef, Role, UserItem } from '../../api/types';
import { useAuthStore } from '../../stores/auth';

const DATA_SCOPE_LABEL: Record<string, string> = {
  ALL: '全部数据',
  DEPARTMENT: '本部门',
  OWN: '仅本人',
  ASSIGNED: '仅被指派',
};

/** 编辑角色的功能点权限：按组勾选、可恢复默认；保存为全量替换 */
function RolePermissionsModal({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);

  const permissionsQuery = useQuery({
    queryKey: ['permissions'],
    queryFn: rbacApi.permissions,
    enabled: !!role,
  });

  // Modal 复用同一实例，切换角色时重置勾选
  useEffect(() => {
    setSelected(role ? role.permissions.map((p) => p.permission.code) : []);
  }, [role]);

  const saveMutation = useMutation({
    mutationFn: () => rbacApi.updateRolePermissions(role!.id, selected),
    onSuccess: () => {
      message.success('权限已保存，相关账号重新登录后生效');
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
    onError: (error) => message.error(extractErrorMessage(error, '保存失败')),
  });

  const groups = useMemo(() => {
    const map = new Map<string, PermissionDef[]>();
    (permissionsQuery.data ?? []).forEach((p) => {
      map.set(p.group, [...(map.get(p.group) ?? []), p]);
    });
    return [...map.entries()];
  }, [permissionsQuery.data]);

  const defaults = role ? DEFAULT_ROLE_PERMISSIONS[role.code as RoleCode]?.permissions : undefined;

  /** 单组勾选变化：组外已选保持不动，组内以新值为准 */
  const onGroupChange = (defs: PermissionDef[], checked: string[]) => {
    const groupCodes = new Set(defs.map((d) => d.code));
    setSelected((prev) => [...prev.filter((c) => !groupCodes.has(c)), ...checked]);
  };

  return (
    <Modal
      title={`编辑权限：${role?.name ?? ''}`}
      open={!!role}
      onCancel={onClose}
      onOk={() => saveMutation.mutate()}
      okText="保存"
      confirmLoading={saveMutation.isPending}
      width={620}
    >
      <Alert
        type="info"
        showIcon
        className="u-mb-16"
        message="权限随登录令牌下发，调整后相关账号需重新登录方可生效。"
      />
      <div className="u-flex-between u-mb-16">
        <span className="u-secondary">已选 {selected.length} 项功能点</span>
        {defaults && (
          <Button size="small" onClick={() => setSelected([...defaults])}>
            恢复默认配置
          </Button>
        )}
      </div>
      <Table<[string, PermissionDef[]]>
        rowKey={([group]) => group}
        size="small"
        loading={permissionsQuery.isLoading}
        dataSource={groups}
        pagination={false}
        showHeader={false}
        columns={[
          {
            width: 90,
            render: (_, [group, defs]) => {
              const count = defs.filter((d) => selected.includes(d.code)).length;
              return (
                <Checkbox
                  checked={count === defs.length}
                  indeterminate={count > 0 && count < defs.length}
                  onChange={(e) =>
                    onGroupChange(defs, e.target.checked ? defs.map((d) => d.code) : [])
                  }
                >
                  <Typography.Text strong>{group}</Typography.Text>
                </Checkbox>
              );
            },
          },
          {
            render: (_, [, defs]) => (
              <Checkbox.Group
                value={selected}
                options={defs.map((d) => ({ label: d.name, value: d.code }))}
                onChange={(checked) => onGroupChange(defs, checked as string[])}
              />
            ),
          },
        ]}
      />
    </Modal>
  );
}

function RolesTab() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.CONFIG_MANAGE);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rbacApi.roles });
  return (
    <>
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
          ...(canManage
            ? [
                {
                  title: '操作',
                  width: 100,
                  render: (_: unknown, r: Role) =>
                    r.code === 'ADMIN' ? (
                      <Tooltip title="系统管理员始终拥有全部权限，不可编辑">
                        <Button size="small" disabled>
                          编辑权限
                        </Button>
                      </Tooltip>
                    ) : (
                      <Button size="small" onClick={() => setEditingRole(r)}>
                        编辑权限
                      </Button>
                    ),
                },
              ]
            : []),
        ]}
      />
      <RolePermissionsModal role={editingRole} onClose={() => setEditingRole(null)} />
    </>
  );
}

/** 门户角色走 token 直链免登录，不参与内部账号分配 */
const PORTAL_ROLE_CODES: string[] = [RoleCode.CANDIDATE, RoleCode.NEW_HIRE];

/** 给成员分配角色：勾选内部角色，保存为全量替换 */
function UserRolesModal({ user, onClose }: { user: UserItem | null; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rbacApi.roles, enabled: !!user });
  const internalRoles = (rolesQuery.data ?? []).filter((r) => !PORTAL_ROLE_CODES.includes(r.code));

  // Modal 复用同一实例，切换成员时重置勾选
  useEffect(() => {
    setSelected(user ? user.roles.map((ur) => ur.role.code) : []);
  }, [user]);

  const saveMutation = useMutation({
    mutationFn: () => usersApi.updateRoles(user!.id, selected),
    onSuccess: () => {
      message.success('角色已保存，该账号重新登录后生效');
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
    onError: (error) => message.error(extractErrorMessage(error, '保存失败')),
  });

  return (
    <Modal
      title={`分配角色：${user?.name ?? ''}`}
      open={!!user}
      onCancel={onClose}
      onOk={() => saveMutation.mutate()}
      okText="保存"
      okButtonProps={{ disabled: selected.length === 0 }}
      confirmLoading={saveMutation.isPending}
      width={480}
    >
      <Alert
        type="info"
        showIcon
        className="u-mb-16"
        message="角色与数据范围随登录令牌下发，调整后该账号需重新登录方可生效。"
      />
      <Table<Role>
        rowKey="id"
        size="small"
        loading={rolesQuery.isLoading}
        dataSource={internalRoles}
        pagination={false}
        showHeader={false}
        rowSelection={{
          selectedRowKeys: internalRoles.filter((r) => selected.includes(r.code)).map((r) => r.id),
          onChange: (_, rows) => setSelected(rows.map((r) => r.code)),
        }}
        columns={[
          { render: (_, r) => r.name, width: 160 },
          {
            render: (_, r) => <Tag>{DATA_SCOPE_LABEL[r.dataScope] ?? r.dataScope}</Tag>,
            width: 110,
          },
          {
            render: (_, r) => (
              <span className="u-meta">{r.permissions.length} 项功能点权限</span>
            ),
          },
        ]}
      />
      {selected.length === 0 && (
        <p className="u-error-text u-mt-8 u-mb-4">至少保留一个角色</p>
      )}
    </Modal>
  );
}

function MembersTab() {
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const usersQuery = useQuery({ queryKey: ['users', 'settings'], queryFn: () => usersApi.list() });
  return (
    <>
      <Table<UserItem>
        rowKey="id"
        scroll={{ x: 900 }}
        loading={usersQuery.isLoading}
        dataSource={usersQuery.data}
        pagination={false}
        columns={[
          { title: '姓名', dataIndex: 'name', width: 160 },
          { title: '邮箱', dataIndex: 'email', width: 220 },
          { title: '部门', width: 140, render: (_, u) => u.department?.name ?? '-' },
          {
            title: '状态',
            dataIndex: 'status',
            width: 90,
            render: (v: string) =>
              v === 'ACTIVE' ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>,
          },
          {
            title: '角色',
            render: (_, u) => (
              <>
                {u.roles.map(({ role }) => (
                  <Tag key={role.code} className="u-mb-4">
                    {role.name}
                  </Tag>
                ))}
              </>
            ),
          },
          {
            title: '操作',
            width: 100,
            render: (_, u) => (
              <Button size="small" onClick={() => setEditingUser(u)}>
                分配角色
              </Button>
            ),
          },
        ]}
      />
      <UserRolesModal user={editingUser} onClose={() => setEditingUser(null)} />
    </>
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
    ...(hasPermission(PERMISSIONS.USER_MANAGE)
      ? [{ key: 'members', label: '成员管理', children: <MembersTab /> }]
      : []),
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
