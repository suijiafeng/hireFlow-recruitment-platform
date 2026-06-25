import { PlusOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, RoleCode } from '@hireflow/shared';
import { App, Button, Form, Input, Modal, Popconfirm, Select, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { auditApi, companyDocsApi, departmentsApi, rbacApi, usersApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { CompanyDoc, CreateRoleInput, DepartmentItem, InviteUserInput, PermissionDef, UserItem } from '../../api/types';
import { useAuthStore } from '../../stores/auth';
import { downloadCsv } from '../../utils/csv';

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;

const DATA_SCOPE_LABEL: Record<string, string> = {
  ALL: '全部数据',
  DEPARTMENT: '本部门',
  OWN: '仅本人',
  ASSIGNED: '仅被指派',
};
const PORTAL_ROLE_CODES: string[] = [RoleCode.CANDIDATE, RoleCode.NEW_HIRE];

type Section = 'roles' | 'members' | 'depts' | 'docs' | 'audit';

const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: 'roles', label: '角色与权限' },
  { key: 'members', label: '成员管理' },
  { key: 'depts', label: '部门管理' },
  { key: 'docs', label: '制度文档' },
  { key: 'audit', label: '审计日志' },
];

/* ============================================================
   角色与权限：左表格（高度随内容）+ 下方最近变更 + 右栏权限矩阵常驻
   ============================================================ */
function RolesSection({ onGoAudit }: { onGoAudit: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.CONFIG_MANAGE);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelectedCodes] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<{ code: string; name: string; dataScope: string }>();

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rbacApi.roles });
  const permissionsQuery = useQuery({ queryKey: ['permissions'], queryFn: rbacApi.permissions });
  const auditQuery = useQuery({ queryKey: ['audit', 1], queryFn: () => auditApi.recent(1) });

  const roles = rolesQuery.data ?? [];
  const role = roles.find((r) => r.id === selectedId) ?? roles.find((r) => r.code === 'HR') ?? roles[0];
  const roleId = role?.id;

  useEffect(() => {
    if (role) setSelectedCodes(role.permissions.map((p) => p.permission.code));
    // 只在切换角色时重置勾选，不能依赖 role 对象本身（每次 query 刷新都是新引用，会冲掉未保存的编辑）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId]);

  const saveMutation = useMutation({
    mutationFn: () => rbacApi.updateRolePermissions(role!.id, selected),
    onSuccess: () => {
      message.success('权限已保存，相关账号重新登录后生效');
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (error) => message.error(extractErrorMessage(error, '保存失败')),
  });

  const createMutation = useMutation({
    mutationFn: (values: { code: string; name: string; dataScope: string }) =>
      rbacApi.createRole({
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        dataScope: values.dataScope as CreateRoleInput['dataScope'],
      }),
    onSuccess: (role) => {
      message.success(`角色「${role.name}」已创建，接下来在右栏勾选权限并保存`);
      setCreateOpen(false);
      createForm.resetFields();
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
      setSelectedId(role.id); // 直接选中新角色，衔接「配权限」这一步
    },
    onError: (error) => message.error(extractErrorMessage(error, '创建失败')),
  });

  const groups = useMemo(() => {
    const map = new Map<string, PermissionDef[]>();
    (permissionsQuery.data ?? []).forEach((p) => map.set(p.group, [...(map.get(p.group) ?? []), p]));
    return [...map.entries()];
  }, [permissionsQuery.data]);

  /** 权限矩阵导出：角色 × 权限点的勾选表，直接落 CSV 供合规存档 */
  const exportMatrix = () => {
    const defs = permissionsQuery.data ?? [];
    if (!roles.length || !defs.length) {
      message.warning('权限数据尚未加载完成');
      return;
    }
    const header = ['权限分组', '权限码', '权限名', ...roles.map((r) => `${r.name}(${r.code})`)];
    const rows = defs.map((d) => [
      d.group,
      d.code,
      d.name,
      ...roles.map((r) => (r.permissions.some((rp) => rp.permission.code === d.code) ? 'Y' : '')),
    ]);
    downloadCsv(`权限矩阵_${dayjs().format('YYYYMMDD')}`, header, rows);
    message.success(`已导出 ${defs.length} 个权限点 × ${roles.length} 个角色`);
  };

  const defaults = role ? DEFAULT_ROLE_PERMISSIONS[role.code as RoleCode]?.permissions : undefined;
  const totalPerms = permissionsQuery.data?.length ?? 0;
  const isAdmin = role?.code === 'ADMIN';

  const toggle = (code: string) =>
    setSelectedCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  return (
    <>
      <div className="hf-section-head">
        <div className="u-flex-gap-12 u-flex-baseline">
          <span className="hf-section-title">角色与权限</span>
          <span className="hf-muted">
            共 {roles.length} 个角色 · {roles.reduce((s, r) => s + r._count.users, 0)} 名成员
          </span>
        </div>
        {canManage && (
          <div className="hf-bar-right">
            <Button onClick={exportMatrix}>导出权限矩阵</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建角色
            </Button>
          </div>
        )}
      </div>

      <div className="hf-notice">
        <WarningOutlined />
        <span>权限与数据范围随登录令牌下发，调整后相关账号需重新登录方可生效。系统管理员始终拥有全部权限，不可编辑。</span>
      </div>

      <div className="hf-cols">
        <div className="hf-col-main">
          {/* 角色不多，表格高度随内容；剩余空间给「最近权限变更」 */}
          <div className="hf-table hf-table--fit">
            <div className="hf-thead">
              <span className="hf-td--grow">角色</span>
              <span className="hf-td w-180">角色码</span>
              <span className="hf-td w-120">数据范围</span>
              <span className="hf-td hf-td--right w-90">成员</span>
              <span className="hf-td hf-td--right w-180">功能点权限</span>
              <span className="hf-td hf-td--right w-90">操作</span>
            </div>
            <div>
              {rolesQuery.isLoading ? (
                <div className="hf-panel-body u-flex-center">
                  <Spin />
                </div>
              ) : (
                roles.map((r) => {
                  const portal = r.permissions.length === 0;
                  return (
                    <div
                      key={r.id}
                      className={r.id === role?.id ? 'hf-tr hf-tr--on' : 'hf-tr'}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <span className="hf-td--grow hf-primary hf-ellipsis">{r.name}</span>
                      <span className="hf-td w-180 hf-muted hf-mono">{r.code}</span>
                      <span className="hf-td w-120 hf-secondary">{DATA_SCOPE_LABEL[r.dataScope] ?? r.dataScope}</span>
                      <span className="hf-td hf-td--right w-90 hf-td--num">
                        {r._count.users > 0 ? (
                          <span className="hf-secondary">{r._count.users}</span>
                        ) : (
                          <span className="hf-faint">—</span>
                        )}
                      </span>
                      <span className="hf-td hf-td--right w-180">
                        {portal ? (
                          <span className="hf-faint">门户角色 · 无后台权限</span>
                        ) : (
                          <span className="hf-progress-num">{r.permissions.length} 项</span>
                        )}
                      </span>
                      <span className="hf-td hf-td--right w-90">
                        <span className={canManage && r.code !== 'ADMIN' ? 'hf-link' : 'hf-link--off'}>编辑权限</span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="hf-panel hf-panel--grow">
            <div className="hf-panel-head">
              <span className="hf-panel-title">最近权限变更</span>
              <span className="hf-link" onClick={onGoAudit}>
                查看完整审计日志
              </span>
            </div>
            <div className="hf-tbody">
              {(auditQuery.data?.items ?? [])
                .filter(
                  (a) =>
                    a.action.startsWith('role.') || a.action.startsWith('user.') || a.action.startsWith('department.'),
                )
                .slice(0, 12)
                .map((a) => (
                  <div key={a.id} className="hf-tr hf-tr--dense">
                    <span className="hf-td w-150 hf-muted hf-td--num">
                      {dayjs(a.createdAt).format('MM-DD HH:mm:ss')}
                    </span>
                    <span className="hf-td w-130 hf-secondary">{a.actor?.name ?? a.actorName ?? '系统'}</span>
                    <span className="hf-td w-260 hf-mono hf-mono--action">{a.action}</span>
                    <span className="hf-td--grow hf-faint hf-mono hf-ellipsis">
                      {a.payload ? JSON.stringify(a.payload) : '—'}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* 右栏：权限矩阵常驻，取代 620px 弹窗 */}
        <div className="hf-rail">
          <div className="hf-panel hf-panel--grow">
            <div className="hf-panel-head">
              <div>
                <span className="hf-panel-title">{role?.name ?? '选择角色'}</span>
                <div className="hf-panel-sub">
                  数据范围：{role ? DATA_SCOPE_LABEL[role.dataScope] : '—'} · {role?._count.users ?? 0} 名成员
                </div>
              </div>
              <span className="hf-faint hf-td--num">
                已选 {selected.length} / {totalPerms} 项
              </span>
            </div>
            <div className="hf-panel-body">
              {permissionsQuery.isLoading ? (
                <Spin size="small" />
              ) : (
                groups.map(([group, defs]) => {
                  const on = defs.filter((d) => selected.includes(d.code)).length;
                  return (
                    <div key={group} className="hf-perm-group">
                      <div className="u-flex-between u-mb-4">
                        <span className="hf-caption">{group}</span>
                        <span className={on === defs.length ? 'hf-faint hf-state--ok' : 'hf-faint'}>
                          {on} / {defs.length}
                        </span>
                      </div>
                      <div className="hf-perm-grid">
                        {defs.map((d) => {
                          const checked = selected.includes(d.code);
                          return (
                            <span
                              key={d.code}
                              className="hf-perm-item"
                              onClick={() => {
                                if (canManage && !isAdmin) toggle(d.code);
                              }}
                            >
                              <span className={checked ? 'hf-check hf-check--on' : 'hf-check'}>
                                {checked ? '✓' : ''}
                              </span>
                              <span className={checked ? 'hf-check-label' : 'hf-check-label hf-state--off'}>
                                {d.name}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {canManage && !isAdmin && (
              <div className="hf-panel-foot">
                <Button type="primary" block loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                  保存权限
                </Button>
                {defaults && <Button onClick={() => setSelectedCodes([...defaults])}>恢复默认</Button>}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        className="hf-modal"
        title={
          <>
            新建角色
            <div className="hf-modal-sub">创建后在右栏勾选权限点并保存</div>
          </>
        }
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        okText="创建角色"
        confirmLoading={createMutation.isPending}
        footer={(_, { OkBtn, CancelBtn }) => (
          <>
            <span className="hf-modal-hint">角色码创建后不可修改</span>
            <CancelBtn />
            <OkBtn />
          </>
        )}
        destroyOnHidden
      >
        <Form
          form={createForm}
          layout="vertical"
          initialValues={{ dataScope: 'ASSIGNED' }}
          onFinish={(v) => createMutation.mutate(v)}
        >
          <Form.Item
            name="code"
            label="角色码"
            extra="大写字母 + 下划线，权限判定以它为准，创建后不可改；ADMIN 与门户角色码为系统保留"
            rules={[
              { required: true, message: '请填写角色码' },
              { pattern: /^[A-Za-z][A-Za-z0-9_]{1,39}$/, message: '只能用字母、数字与下划线，且以字母开头' },
            ]}
            normalize={(v?: string) => v?.toUpperCase()}
          >
            <Input placeholder="如 RECRUITING_COORDINATOR" />
          </Form.Item>
          <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请填写角色名称' }]}>
            <Input placeholder="如 招聘协调员" maxLength={40} />
          </Form.Item>
          <Form.Item
            name="dataScope"
            label="数据范围"
            extra="决定该角色能看到哪些行；缺省取最小的「仅被指派」"
            rules={[{ required: true }]}
          >
            <Select
              options={Object.entries(DATA_SCOPE_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

/* ============================================================ 成员管理 */
function MembersSection() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm] = Form.useForm<InviteUserInput>();
  /** 初始密码仅在邀请响应里返回一次，拿到后必须让管理员当场转交 */
  const [issued, setIssued] = useState<{ name: string; email: string; password: string } | null>(null);

  const usersQuery = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() });
  // 邀请弹窗也要用角色列表，不能只在编辑时才拉
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rbacApi.roles, enabled: !!editing || inviteOpen });
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list, enabled: inviteOpen });
  const internalRoles = (rolesQuery.data ?? []).filter((r) => !PORTAL_ROLE_CODES.includes(r.code));

  const inviteMutation = useMutation({
    mutationFn: (values: InviteUserInput) => usersApi.invite(values),
    onSuccess: ({ user, initialPassword }) => {
      setInviteOpen(false);
      inviteForm.resetFields();
      setIssued({ name: user.name, email: user.email, password: initialPassword });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (error) => message.error(extractErrorMessage(error, '邀请失败')),
  });

  useEffect(() => {
    setSelected(editing ? editing.roles.map((ur) => ur.role.code) : []);
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: () => usersApi.updateRoles(editing!.id, selected),
    onSuccess: () => {
      message.success('角色已保存，该账号重新登录后生效');
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (error) => message.error(extractErrorMessage(error, '保存失败')),
  });

  const users = (usersQuery.data ?? []).filter((u) => !keyword || u.name.includes(keyword) || u.email.includes(keyword));
  const active = users.filter((u) => u.status === 'ACTIVE').length;

  return (
    <>
      <div className="hf-section-head">
        <div className="u-flex-gap-12 u-flex-baseline">
          <span className="hf-section-title">成员管理</span>
          <span className="hf-muted">
            共 {users.length} 名成员 · {active} 启用 / {users.length - active} 停用
          </span>
        </div>
        <div className="hf-bar-right">
          <Input.Search className="w-240" placeholder="搜索姓名、邮箱" allowClear onSearch={setKeyword} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setInviteOpen(true)}>
            邀请成员
          </Button>
        </div>
      </div>

      <div className="hf-table">
        <div className="hf-thead">
          <span className="hf-td w-180">姓名</span>
          <span className="hf-td w-240">邮箱</span>
          <span className="hf-td w-140">部门</span>
          <span className="hf-td w-100">状态</span>
          <span className="hf-td--grow">角色</span>
          <span className="hf-td hf-td--right w-110">操作</span>
        </div>
        <div className="hf-tbody">
          {usersQuery.isLoading ? (
            <div className="hf-panel-body u-flex-center">
              <Spin />
            </div>
          ) : (
            users.map((u) => {
              const on = u.status === 'ACTIVE';
              return (
                <div key={u.id} className={on ? 'hf-tr' : 'hf-tr hf-tr--muted'} onClick={() => setEditing(u)}>
                  <span className="hf-td w-180 u-flex-gap-8">
                    <span className="hf-avatar">{u.name.charAt(0)}</span>
                    <span className="hf-primary hf-ellipsis">{u.name}</span>
                  </span>
                  <span className="hf-td w-240 hf-secondary hf-ellipsis">{u.email}</span>
                  <span className="hf-td w-140 hf-secondary">{u.department?.name ?? '—'}</span>
                  <span className={`hf-td w-100 hf-state ${on ? '' : 'hf-state--off'}`}>
                    <span className={on ? 'hf-dot hf-dot--ok' : 'hf-dot hf-dot--off'} />
                    {on ? '启用' : '停用'}
                  </span>
                  {/* 角色：一行文本，取代每行几个 Tag */}
                  <span className={on ? 'hf-td--grow hf-secondary hf-ellipsis' : 'hf-td--grow hf-faint hf-ellipsis'}>
                    {u.roles.map(({ role }) => role.name).join(' · ') || '（未分配）'}
                  </span>
                  <span className="hf-td hf-td--right w-110">
                    <span className="hf-link">分配角色</span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <Modal
        className="hf-modal"
        title={
          <>
            分配角色
            {editing && (
              <div className="hf-modal-sub">
                {editing.name} · {editing.email}
              </div>
            )}
          </>
        }
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => saveMutation.mutate()}
        okText="保存"
        okButtonProps={{ disabled: selected.length === 0 }}
        confirmLoading={saveMutation.isPending}
      >
        <div className="hf-notice u-mb-16">
          <WarningOutlined />
          <span>角色与数据范围随登录令牌下发，调整后该账号需重新登录方可生效。</span>
        </div>
        {internalRoles.map((r) => {
          const checked = selected.includes(r.code);
          return (
            <div
              key={r.id}
              className="hf-check-row"
              onClick={() => setSelected((prev) => (checked ? prev.filter((c) => c !== r.code) : [...prev, r.code]))}
            >
              <span className={checked ? 'hf-check hf-check--on' : 'hf-check'}>{checked ? '✓' : ''}</span>
              <span className="hf-check-label">{r.name}</span>
              <span className="hf-muted hf-scope-col">{DATA_SCOPE_LABEL[r.dataScope] ?? r.dataScope}</span>
              <span className="hf-faint hf-td--num">{r.permissions.length} 项</span>
            </div>
          );
        })}
      </Modal>

      <Modal
        className="hf-modal"
        title={
          <>
            邀请成员
            <div className="hf-modal-sub">未接邮件通道，创建后由你把初始密码转交本人</div>
          </>
        }
        open={inviteOpen}
        onCancel={() => {
          setInviteOpen(false);
          inviteForm.resetFields();
        }}
        onOk={() => inviteForm.submit()}
        okText="创建并生成初始密码"
        confirmLoading={inviteMutation.isPending}
        destroyOnHidden
      >
        <Form form={inviteForm} layout="vertical" onFinish={(v) => inviteMutation.mutate(v)}>
          <Form.Item
            name="email"
            label="公司邮箱"
            extra="即登录账号，创建后不可修改"
            rules={[
              { required: true, message: '请填写邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input placeholder="name@arthr.local" />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请填写姓名' }]}>
            <Input maxLength={40} />
          </Form.Item>
          <Form.Item name="departmentId" label="所属部门（可选）">
            <Select
              allowClear
              placeholder="选择部门"
              loading={departmentsQuery.isLoading}
              options={departmentsQuery.data?.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Form.Item>
          <Form.Item
            name="roleCodes"
            label="初始角色"
            extra="至少一个；没有角色的账号能登录但看不到任何页面。候选人/新员工是门户身份，不在此列"
            rules={[{ required: true, message: '至少分配一个角色' }]}
          >
            <Select
              mode="multiple"
              placeholder="选择角色"
              loading={rolesQuery.isLoading}
              options={internalRoles.map((r) => ({
                value: r.code,
                label: `${r.name} · ${DATA_SCOPE_LABEL[r.dataScope] ?? r.dataScope}`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 初始密码只在此刻拿得到，关掉就再也查不到——必须说清楚并给复制 */}
      <Modal
        className="hf-modal"
        title="账号已创建"
        open={Boolean(issued)}
        onCancel={() => setIssued(null)}
        okText="我已转交，关闭"
        onOk={() => setIssued(null)}
        cancelButtonProps={{ style: { display: 'none' } }}
        destroyOnHidden
      >
        <div className="hf-notice hf-notice--warn u-mb-16">
          <WarningOutlined />
          <span>初始密码只显示这一次，关闭后无法再查看（系统不保存明文）。请立即转交本人，并提醒其登录后尽快修改。</span>
        </div>
        <div className="hf-kv">
          <span className="hf-kv-k">姓名</span>
          <span className="hf-kv-v">{issued?.name}</span>
        </div>
        <div className="hf-kv">
          <span className="hf-kv-k">登录邮箱</span>
          <span className="hf-kv-v hf-mono">{issued?.email}</span>
        </div>
        <div className="hf-kv">
          <span className="hf-kv-k">初始密码</span>
          <span className="hf-kv-v">
            <Typography.Text copyable strong className="hf-mono">
              {issued?.password}
            </Typography.Text>
          </span>
        </div>
      </Modal>
    </>
  );
}

/* ============================================================ 部门管理 */
function DepartmentsSection() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<DepartmentItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const departmentsQuery = useQuery({ queryKey: ['departments', 'settings'], queryFn: departmentsApi.list });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['departments'] });

  const createMutation = useMutation({
    mutationFn: (values: { name: string }) => departmentsApi.create(values),
    onSuccess: () => {
      message.success('部门已创建');
      setCreateOpen(false);
      form.resetFields();
      void invalidate();
    },
    onError: (error) => message.error(extractErrorMessage(error, '创建失败')),
  });
  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; name: string }) => departmentsApi.update(vars.id, { name: vars.name }),
    onSuccess: () => {
      message.success('部门已更新');
      setEditing(null);
      form.resetFields();
      void invalidate();
    },
    onError: (error) => message.error(extractErrorMessage(error, '更新失败')),
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => departmentsApi.remove(id),
    onSuccess: () => {
      message.success('部门已删除');
      void invalidate();
    },
    onError: (error) => message.error(extractErrorMessage(error, '删除失败')),
  });

  const depts = departmentsQuery.data ?? [];
  const maxUsers = Math.max(...depts.map((d) => d._count.users), 1);

  return (
    <>
      <div className="hf-section-head">
        <div className="u-flex-gap-12 u-flex-baseline">
          <span className="hf-section-title">部门管理</span>
          <span className="hf-muted">共 {depts.length} 个部门</span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建部门
        </Button>
      </div>

      <div className="hf-table">
        <div className="hf-thead">
          <span className="hf-td--grow">部门</span>
          <span className="hf-td w-220">成员分布</span>
          <span className="hf-td hf-td--right w-90">成员</span>
          <span className="hf-td hf-td--right w-90">职位</span>
          <span className="hf-td hf-td--right w-90">子部门</span>
          <span className="hf-td hf-td--right w-120">操作</span>
        </div>
        <div className="hf-tbody">
          {depts.map((d) => {
            const empty = d._count.users + d._count.jobs + d._count.children === 0;
            return (
              <div key={d.id} className="hf-tr">
                <span className="hf-td--grow hf-primary hf-ellipsis">{d.name}</span>
                <span className="hf-td w-220 hf-progress">
                  <span className="hf-bar-track">
                    <span
                      className="hf-bar-fill"
                      style={cssVars({ '--w': `${Math.round((d._count.users / maxUsers) * 100)}%` })}
                    />
                  </span>
                </span>
                <span className="hf-td hf-td--right w-90 hf-progress-num">{d._count.users}</span>
                <span className="hf-td hf-td--right w-90 hf-secondary hf-td--num">{d._count.jobs}</span>
                <span className="hf-td hf-td--right w-90 hf-muted hf-td--num">
                  {d._count.children > 0 ? d._count.children : '—'}
                </span>
                <span className="hf-td hf-td--right w-120 u-flex-end u-flex-gap-14">
                  <span
                    className="hf-link"
                    onClick={() => {
                      setEditing(d);
                      form.setFieldsValue({ name: d.name });
                    }}
                  >
                    改名
                  </span>
                  {empty ? (
                    <Popconfirm title={`删除部门「${d.name}」？`} onConfirm={() => removeMutation.mutate(d.id)}>
                      <span className="hf-link hf-link--danger">删除</span>
                    </Popconfirm>
                  ) : (
                    <span className="hf-link--off" title="部门下还有职位 / 成员 / 子部门，需先清空或转移">
                      删除
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <div className="hf-panel-foot hf-panel-foot--tight">
          <span>部门下还有职位 / 成员 / 子部门时不可删除，需先清空或转移</span>
        </div>
      </div>

      <Modal
        className="hf-modal"
        title={editing ? '部门改名' : '新建部门'}
        open={createOpen || editing != null}
        onCancel={() => {
          setCreateOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values: { name: string }) =>
            editing ? updateMutation.mutate({ id: editing.id, name: values.name }) : createMutation.mutate(values)
          }
        >
          <Form.Item name="name" label="部门名称" rules={[{ required: true, min: 1 }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

/* ============================================================ 制度文档 */
function CompanyDocsSection() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CompanyDoc | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm();
  const docsQuery = useQuery({ queryKey: ['company-docs'], queryFn: companyDocsApi.list });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['company-docs'] });

  const createMutation = useMutation({
    mutationFn: (values: { title: string; content: string; tags?: string[] }) => companyDocsApi.create(values),
    onSuccess: () => {
      message.success('文档已创建');
      setCreateOpen(false);
      form.resetFields();
      void invalidate();
    },
    onError: (error) => message.error(extractErrorMessage(error, '创建失败')),
  });
  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; values: Parameters<typeof companyDocsApi.update>[1] }) =>
      companyDocsApi.update(vars.id, vars.values),
    onSuccess: () => {
      message.success('文档已更新');
      setEditing(null);
      form.resetFields();
      void invalidate();
    },
    onError: (error) => message.error(extractErrorMessage(error, '更新失败')),
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => companyDocsApi.remove(id),
    onSuccess: () => {
      message.success('文档已删除');
      void invalidate();
    },
    onError: (error) => message.error(extractErrorMessage(error, '删除失败')),
  });

  const docs = (docsQuery.data ?? []).filter(
    (d) =>
      !keyword || d.title.includes(keyword) || d.tags.some((t) => t.includes(keyword)) || d.content.includes(keyword),
  );
  const preview = docs.find((d) => d.id === previewId) ?? docs[0];

  return (
    <>
      <div className="hf-section-head">
        <div className="u-flex-gap-12 u-flex-baseline">
          <span className="hf-section-title">制度文档</span>
          <span className="hf-muted">共 {docs.length} 篇 · 入职问答机器人的唯一知识来源</span>
        </div>
        <div className="hf-bar-right">
          <Input.Search className="w-240" placeholder="搜索标题、标签、正文" allowClear onSearch={setKeyword} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建文档
          </Button>
        </div>
      </div>

      <div className="hf-cols">
        <div className="hf-table">
          <div className="hf-thead">
            <span className="hf-td w-200">标题</span>
            <span className="hf-td--grow">标签</span>
            <span className="hf-td hf-td--right w-100">篇幅</span>
            <span className="hf-td hf-td--right w-130">更新</span>
            <span className="hf-td hf-td--right w-100">操作</span>
          </div>
          <div className="hf-tbody">
            {docs.map((d) => (
              <div
                key={d.id}
                className={d.id === preview?.id ? 'hf-tr hf-tr--on' : 'hf-tr'}
                onClick={() => setPreviewId(d.id)}
              >
                <span className="hf-td w-200 hf-primary hf-ellipsis">{d.title}</span>
                <span className="hf-td--grow hf-secondary hf-ellipsis">{d.tags.join(' · ') || '—'}</span>
                <span className="hf-td hf-td--right w-100 hf-muted hf-td--num">
                  {(d.content.length / 1000).toFixed(1)}k 字
                </span>
                <span className="hf-td hf-td--right w-130 hf-muted hf-td--num">
                  {dayjs(d.updatedAt).format('MM-DD HH:mm')}
                </span>
                <span className="hf-td hf-td--right w-100 u-flex-end u-flex-gap-12">
                  <span
                    className="hf-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(d);
                      form.setFieldsValue({ title: d.title, content: d.content, tags: d.tags });
                    }}
                  >
                    编辑
                  </span>
                  <Popconfirm title={`删除文档「${d.title}」？`} onConfirm={() => removeMutation.mutate(d.id)}>
                    <span className="hf-link hf-link--danger" onClick={(e) => e.stopPropagation()}>
                      删除
                    </span>
                  </Popconfirm>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 右栏：正文预览常驻 */}
        <div className="hf-rail">
          <div className="hf-panel hf-panel--grow">
            <div className="hf-panel-head">
              <div>
                <span className="hf-panel-title">{preview?.title ?? '选择文档'}</span>
                <div className="hf-panel-sub">标签：{preview?.tags.join(' · ') || '—'}</div>
              </div>
              {preview && (
                <span className="hf-faint hf-td--num">
                  {(preview.content.length / 1000).toFixed(1)}k 字 · {dayjs(preview.updatedAt).format('MM-DD')} 更新
                </span>
              )}
            </div>
            <div className="hf-panel-body">
              <div className="hf-caption u-mb-8">正文预览</div>
              <div className="hf-doc-preview">{preview?.content ?? '—'}</div>
            </div>
            <div className="hf-panel-foot hf-panel-foot--tight hf-notice--flat">
              <span className="hf-faint">入职问答机器人只依据这些文档作答；标签建议覆盖同义词，命中即可被检索到。</span>
            </div>
          </div>
        </div>
      </div>

      <Modal
        className="hf-modal"
        width={640}
        title={
          <>
            {editing ? '编辑文档' : '新建制度文档'}
            {editing && <div className="hf-modal-sub">{editing.title}</div>}
          </>
        }
        open={createOpen || editing != null}
        onCancel={() => {
          setCreateOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values: { title: string; content: string; tags?: string[] }) =>
            editing ? updateMutation.mutate({ id: editing.id, values }) : createMutation.mutate(values)
          }
        >
          <Form.Item name="title" label="标题" rules={[{ required: true, min: 1 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="tags" label="标签" extra="命中即可被检索到，建议覆盖同义词">
            <Select mode="tags" placeholder="输入后回车，可多个" />
          </Form.Item>
          <Form.Item name="content" label="正文" rules={[{ required: true, min: 1 }]}>
            <Input.TextArea rows={10} placeholder="入职问答机器人将依据这段内容回答员工提问" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

/* ============================================================ 审计日志 */
/** 一次导出的上限：留痕是只增不减的，全量拉容易把浏览器拖死；超过就截断并明说 */
const AUDIT_EXPORT_CAP = 5000;
const AUDIT_PAGE_SIZE = 20;

function AuditSection() {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const auditQuery = useQuery({ queryKey: ['audit', page], queryFn: () => auditApi.recent(page) });
  const items = auditQuery.data?.items ?? [];
  const total = auditQuery.data?.total ?? 0;
  const maxPage = Math.max(Math.ceil(total / AUDIT_PAGE_SIZE), 1);

  /**
   * 导出审计日志。
   * 合规场景要的是整段留痕而不是当前这 20 条，所以逐页取全量；
   * 但留痕只增不减，加个上限并在提示里说清楚截断了多少，不能悄悄少给。
   */
  const exportAudit = async () => {
    setExporting(true);
    try {
      const rows: Array<Array<unknown>> = [];
      const pages = Math.min(Math.ceil(total / AUDIT_PAGE_SIZE), Math.ceil(AUDIT_EXPORT_CAP / AUDIT_PAGE_SIZE));
      for (let p = 1; p <= pages; p += 1) {
        const chunk = await auditApi.recent(p, AUDIT_PAGE_SIZE);
        for (const a of chunk.items) {
          rows.push([
            dayjs(a.createdAt).format('YYYY-MM-DD HH:mm:ss'),
            a.actor?.name ?? a.actorName ?? '系统',
            a.action,
            a.entityType ?? '',
            a.entityId ?? '',
            a.payload ? JSON.stringify(a.payload) : '',
          ]);
        }
        if (rows.length >= AUDIT_EXPORT_CAP) break;
      }
      const clipped = rows.slice(0, AUDIT_EXPORT_CAP);
      downloadCsv(
        `审计日志_${dayjs().format('YYYYMMDD_HHmm')}`,
        ['时间', '操作人', '动作', '实体类型', '实体 ID', '详情'],
        clipped,
      );
      message.success(
        clipped.length < total
          ? `已导出最近 ${clipped.length} 条（共 ${total} 条，单次上限 ${AUDIT_EXPORT_CAP}）`
          : `已导出全部 ${clipped.length} 条留痕`,
      );
    } catch (error) {
      message.error(extractErrorMessage(error, '导出失败'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="hf-section-head">
        <div className="u-flex-gap-12 u-flex-baseline">
          <span className="hf-section-title">审计日志</span>
          <span className="hf-muted">共 {total} 条留痕</span>
        </div>
        <div className="hf-bar-right">
          <Button icon={<ReloadOutlined />} onClick={() => void auditQuery.refetch()} loading={auditQuery.isFetching}>
            刷新
          </Button>
          <Button type="primary" disabled={total === 0} loading={exporting} onClick={() => void exportAudit()}>
            导出 CSV
          </Button>
        </div>
      </div>

      <div className="hf-table">
        <div className="hf-thead">
          <span className="hf-td w-150">时间</span>
          <span className="hf-td w-130">操作人</span>
          <span className="hf-td w-260">动作</span>
          <span className="hf-td w-110">实体</span>
          <span className="hf-td--grow">详情</span>
        </div>
        <div className="hf-tbody">
          {auditQuery.isLoading ? (
            <div className="hf-panel-body u-flex-center">
              <Spin />
            </div>
          ) : (
            items.map((a) => (
              <div key={a.id} className="hf-tr hf-tr--dense">
                <span className="hf-td w-150 hf-muted hf-td--num">{dayjs(a.createdAt).format('MM-DD HH:mm:ss')}</span>
                <span className={a.actor ? 'hf-td w-130 hf-secondary' : 'hf-td w-130 hf-muted'}>
                  {a.actor?.name ?? a.actorName ?? '系统'}
                </span>
                <span className="hf-td w-260 hf-mono hf-mono--action">{a.action}</span>
                <span className="hf-td w-110 hf-muted">{a.entityType ?? '—'}</span>
                <span className="hf-td--grow hf-faint hf-mono hf-ellipsis">
                  {a.payload ? JSON.stringify(a.payload) : '—'}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="hf-panel-foot">
          <span>
            第 {total === 0 ? 0 : (page - 1) * 20 + 1}–{Math.min(page * 20, total)} 条 / 共 {total} 条
          </span>
          <span className="u-flex-gap-16">
            <span className="hf-faint">留痕不可删除、不可修改 · 保留 24 个月</span>
            <span className="u-flex-gap-8">
              <Button size="small" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                上一页
              </Button>
              <span className="hf-td--num">
                {page} / {maxPage}
              </span>
              <Button size="small" disabled={page >= maxPage} onClick={() => setPage(page + 1)}>
                下一页
              </Button>
            </span>
          </span>
        </div>
      </div>
    </>
  );
}

export function SettingsPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.CONFIG_MANAGE);
  const [section, setSection] = useState<Section>('roles');

  /** 无配置权限的账号只看角色与权限（只读） */
  const sections = canManage ? SECTIONS : SECTIONS.filter((s) => s.key === 'roles');

  return (
    <div className="hf-page">
      {/* 横向 Tabs 改左侧二级导航 */}
      <div className="hf-cols hf-cols--flush">
        <div className="hf-subnav">
          <div className="hf-subnav-title hf-caption">设置</div>
          {sections.map((s) => (
            <div
              key={s.key}
              className={section === s.key ? 'hf-subnav-item hf-subnav-item--on' : 'hf-subnav-item'}
              onClick={() => setSection(s.key)}
            >
              {s.label}
            </div>
          ))}
        </div>

        <div className="hf-body hf-body--fill">
          {section === 'roles' && <RolesSection onGoAudit={() => setSection('audit')} />}
          {section === 'members' && <MembersSection />}
          {section === 'depts' && <DepartmentsSection />}
          {section === 'docs' && <CompanyDocsSection />}
          {section === 'audit' && <AuditSection />}
        </div>
      </div>
    </div>
  );
}
