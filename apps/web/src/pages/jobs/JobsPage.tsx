import { AppstoreOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { JOB_STATUS_LABEL, PERMISSIONS, type JobStatus } from '@hireflow/shared';
import { App, Button, Dropdown, Form, Input, InputNumber, Modal, Select, Spin, Table } from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { aiApi, departmentsApi, jobsApi, usersApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { Job } from '../../api/types';
import { ScorecardModal } from './ScorecardModal';
import { TalentPoolDrawer } from './TalentPoolDrawer';
import { useAuthStore } from '../../stores/auth';

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;

const PAGE_SIZE = 20;

/** 状态色点：招聘中正向 / 暂停预警 / 待审批主色 / 草稿与关闭中性 */
const STATUS_DOT: Record<JobStatus, string> = {
  OPEN: 'hf-dot hf-dot--ok',
  PAUSED: 'hf-dot hf-dot--alert',
  PENDING_APPROVAL: 'hf-dot hf-dot--on',
  DRAFT: 'hf-dot hf-dot--off',
  CLOSED: 'hf-dot hf-dot--off',
};
const STATUS_TEXT: Record<JobStatus, string> = {
  OPEN: '',
  PAUSED: 'hf-state--warn',
  PENDING_APPROVAL: '',
  DRAFT: 'hf-state--off',
  CLOSED: 'hf-state--off',
};

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: '全部' },
  { key: 'OPEN', label: '招聘中' },
  { key: 'PENDING_APPROVAL', label: '待审批' },
];

export function JobsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [deptId, setDeptId] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);
  const [talentPoolJob, setTalentPoolJob] = useState<Job | null>(null);
  const [scorecardJob, setScorecardJob] = useState<Job | null>(null);
  const [form] = Form.useForm();

  const jobsQuery = useQuery({
    queryKey: ['jobs', page, keyword],
    queryFn: () => jobsApi.list({ page, pageSize: PAGE_SIZE, keyword: keyword || undefined }),
  });
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const managersQuery = useQuery({
    queryKey: ['users', 'HIRING_MANAGER'],
    queryFn: () => usersApi.list('HIRING_MANAGER'),
    enabled: createOpen || editing != null,
  });

  const createMutation = useMutation({
    mutationFn: jobsApi.create,
    onSuccess: (job) => {
      message.success(`职位「${job.title}」已创建，默认招聘流程已生成`);
      setCreateOpen(false);
      form.resetFields();
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => message.error(extractErrorMessage(error, '创建失败')),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; values: Parameters<typeof jobsApi.update>[1] }) =>
      jobsApi.update(vars.id, vars.values),
    onSuccess: (job) => {
      message.success(`职位「${job.title}」已更新`);
      setEditing(null);
      form.resetFields();
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => message.error(extractErrorMessage(error, '更新失败')),
  });

  const generateJdMutation = useMutation({
    mutationFn: aiApi.generateJd,
    onSuccess: (draft) => {
      form.setFieldsValue({ description: draft.description, requirement: draft.requirement });
      message.success(
        draft.aiMeta.provider === 'mock'
          ? 'JD 草稿已生成（当前为规则引擎，配置 ANTHROPIC_API_KEY 后由大模型生成）'
          : 'AI 已生成 JD 草稿，请检查修改',
      );
    },
    onError: (error) => message.error(extractErrorMessage(error, '生成失败')),
  });

  const handleGenerateJd = () => {
    const title = (form.getFieldValue('title') as string | undefined)?.trim();
    if (!title || title.length < 2) {
      message.warning('请先填写职位名称，再让 AI 扩写 JD');
      return;
    }
    const departmentId = form.getFieldValue('departmentId') as string | undefined;
    generateJdMutation.mutate({
      title,
      departmentName: departmentsQuery.data?.find((d) => d.id === departmentId)?.name,
      keywords: (form.getFieldValue('keywords') as string | undefined)?.trim() || undefined,
    });
  };

  const openEdit = (job: Job) => {
    setEditing(job);
    form.setFieldsValue({
      title: job.title,
      departmentId: job.department.id,
      hiringManagerId: job.hiringManager?.id,
      headcount: job.headcount,
      description: job.description ?? undefined,
      requirement: job.requirement ?? undefined,
      status: job.status,
    });
  };

  const all = jobsQuery.data?.items ?? [];
  /** 状态与部门筛选在前端做（列表接口只支持 keyword），不额外增加请求 */
  const items = all.filter((j) => (!status || j.status === status) && (!deptId || j.department.id === deptId));
  const total = jobsQuery.data?.total ?? 0;

  /** KPI 带：全部取自当前列表，不新增请求 */
  const hcTotal = all.reduce((s, j) => s + j.headcount, 0);
  const hcUsed = all.reduce((s, j) => s + ((j as Job & { hcUsed?: number }).hcUsed ?? 0), 0);

  const jobColumns: TableProps<Job>['columns'] = [
    {
      title: '职位',
      key: 'title',
      width: 300,
      onCell: (job) => ({ title: `${job.title} · ${job.department.name}` }),
      render: (_, job) => (
        <span className="u-flex-gap-10">
          <span className="hf-primary hf-ellipsis">{job.title}</span>
          <span className="hf-muted">{job.department.name}</span>
        </span>
      ),
    },
    {
      title: '用人经理',
      key: 'hm',
      width: 110,
      ellipsis: true,
      onCell: (job) => ({ title: job.hiringManager?.name ?? '' }),
      render: (_, job) => <span className="hf-secondary">{job.hiringManager?.name ?? '—'}</span>,
    },
    {
      // 状态：色点 + 文字，不用彩色 Tag
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (status: JobStatus) => (
        <span className={`hf-state ${STATUS_TEXT[status]}`}>
          <span className={STATUS_DOT[status]} />
          {JOB_STATUS_LABEL[status]}
        </span>
      ),
    },
    {
      // HC 进度：横向条，取代 28px 环形进度
      title: 'HC 进度',
      key: 'hc',
      width: 170,
      render: (_, job) => {
        const used = (job as Job & { hcUsed?: number }).hcUsed ?? 0;
        const pct = Math.min(100, Math.round((used / job.headcount) * 100));
        const barColor = pct >= 100 ? '#059669' : pct >= 80 ? '#B45309' : '#2563EB';
        return (
          <span className="hf-progress">
            <span className="hf-bar-track">
              <span className="hf-bar-fill" style={cssVars({ '--w': `${Math.max(pct, 2)}%`, '--c': barColor })} />
            </span>
            <span className="hf-progress-num">
              {used} / {job.headcount}
            </span>
          </span>
        );
      },
    },
    {
      title: '在流程',
      key: 'inFlow',
      width: 90,
      align: 'right',
      render: (_, job) => {
        const n = job._count?.applications ?? 0;
        return n > 0 ? <span className="hf-secondary hf-td--num">{n}</span> : <span className="hf-faint">—</span>;
      },
    },
    {
      title: '创建',
      dataIndex: 'createdAt',
      width: 90,
      align: 'right',
      render: (at: string) => <span className="hf-muted hf-td--num">{dayjs(at).format('MM-DD')}</span>,
    },
    {
      // 操作：主动作 + 「···」更多，取代 300px 四连链接
      title: '操作',
      key: 'action',
      width: 140,
      align: 'right',
      fixed: 'right',
      render: (_, job) => (
        <span className="u-flex-end u-flex-gap-12">
          <span className="hf-link">看板</span>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                hasPermission(PERMISSIONS.APPLICATION_CREATE) ? { key: 'pool', label: '人才库唤醒' } : null,
                hasPermission(PERMISSIONS.JOB_UPDATE) ? { key: 'scorecard', label: '评分卡模板' } : null,
                hasPermission(PERMISSIONS.JOB_UPDATE) ? { key: 'edit', label: '编辑职位' } : null,
              ].filter(Boolean) as Array<{ key: string; label: string }>,
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'pool') setTalentPoolJob(job);
                if (key === 'scorecard') setScorecardJob(job);
                if (key === 'edit') openEdit(job);
              },
            }}
          >
            <span className="hf-more" onClick={(e) => e.stopPropagation()}>
              ···
            </span>
          </Dropdown>
        </span>
      ),
    },
  ];
  const kpis = [
    { label: '招聘中', value: all.filter((j) => j.status === 'OPEN').length, unit: '个' },
    { label: '待审批', value: all.filter((j) => j.status === 'PENDING_APPROVAL').length, unit: '个' },
    { label: 'HC 总量', value: hcTotal, unit: '人' },
    { label: '已录用', value: hcUsed, unit: '人' },
    {
      label: '在流程候选人',
      value: all.reduce((s, j) => s + (j._count?.applications ?? 0), 0),
      unit: '人',
    },
  ];

  return (
    <div className="hf-page">
      {/* 控制栏：搜索 + 状态分段 + 部门 + 新建 */}
      <div className="hf-bar">
        <div className="hf-bar-left">
          <Input.Search
            className="w-260"
            placeholder="搜索职位名称、部门"
            allowClear
            onSearch={(value) => {
              setPage(1);
              setKeyword(value.trim());
            }}
          />
          <div className="hf-seg">
            {STATUS_FILTERS.map((f) => (
              <span
                key={f.key || 'all'}
                className={status === f.key ? 'hf-seg--on' : undefined}
                onClick={() => setStatus(f.key)}
              >
                {f.label}
              </span>
            ))}
          </div>
          <Select
            className="w-140"
            placeholder="全部部门"
            allowClear
            value={deptId}
            onChange={setDeptId}
            loading={departmentsQuery.isLoading}
            options={departmentsQuery.data?.map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
        <div className="hf-bar-right">
          {hasPermission(PERMISSIONS.JOB_CREATE) && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建职位
            </Button>
          )}
        </div>
      </div>

      <div className="hf-body">
        <div className="hf-kpis">
          {kpis.map((k) => (
            <div className="hf-kpi" key={k.label}>
              <div className="hf-kpi-label">{k.label}</div>
              <div className="hf-kpi-val">
                <span className="hf-kpi-num">{k.value}</span>
                <span className="hf-kpi-unit">{k.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {jobsQuery.isLoading ? (
          <div className="hf-state-block">
            <Spin />
          </div>
        ) : items.length === 0 ? (
          <div className="hf-state-block">
            <div className="hf-state-icon">
              <AppstoreOutlined />
            </div>
            <div>
              <div className="hf-state-title">没有符合条件的职位</div>
              <div className="hf-state-desc">调整筛选条件，或新建一个职位——创建后会自动生成默认招聘流程。</div>
            </div>
            {hasPermission(PERMISSIONS.JOB_CREATE) && (
              <div className="hf-state-actions">
                <Button type="primary" onClick={() => setCreateOpen(true)}>
                  新建职位
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="hf-atable">
            <Table<Job>
              columns={jobColumns}
              dataSource={items}
              rowKey="id"
              scroll={{ x: 1010, y: 1 }}
              pagination={{
                current: page,
                pageSize: PAGE_SIZE,
                total,
                showSizeChanger: false,
                showTotal: (t) => (
                  <span className="u-flex-gap-16">
                    <span>全部 {t} 个职位</span>
                    <span>
                      HC 已用 <b className="hf-td--num">{hcUsed}</b> / {hcTotal}
                    </span>
                  </span>
                ),
                onChange: setPage,
              }}
            />
          </div>
        )}
      </div>

      <TalentPoolDrawer job={talentPoolJob} onClose={() => setTalentPoolJob(null)} />
      <ScorecardModal job={scorecardJob} onClose={() => setScorecardJob(null)} />

      <Modal
        className="hf-modal"
        title={
          <>
            {editing ? '编辑职位' : '新建职位'}
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
        okText={editing ? '保存' : '创建职位'}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ headcount: 1 }}
          onFinish={(values) =>
            editing ? updateMutation.mutate({ id: editing.id, values }) : createMutation.mutate(values)
          }
        >
          {editing && (
            <Form.Item name="status" label="职位状态">
              <Select options={Object.entries(JOB_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          )}
          <Form.Item name="title" label="职位名称" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="如：后端工程师" />
          </Form.Item>
          <div className="u-flex-gap-12">
            <Form.Item
              name="departmentId"
              label="所属部门"
              rules={[{ required: true, message: '请选择部门' }]}
              className="u-flex-1"
            >
              <Select
                placeholder="选择部门"
                loading={departmentsQuery.isLoading}
                options={departmentsQuery.data?.map((d) => ({ value: d.id, label: d.name }))}
              />
            </Form.Item>
            <Form.Item name="hiringManagerId" label="用人经理" className="u-flex-1">
              <Select
                allowClear
                placeholder="可选"
                loading={managersQuery.isLoading}
                options={managersQuery.data?.map((u) => ({ value: u.id, label: u.name }))}
              />
            </Form.Item>
            <Form.Item name="headcount" label="HC" className="w-100">
              <InputNumber min={1} max={999} className="u-w-full" />
            </Form.Item>
          </div>

          {/* AI 辅助区：中性底，不用蓝底 Alert */}
          <div className="hf-ai-box u-mb-16">
            <div className="hf-ai-head">
              <RobotOutlined /> AI 扩写 JD
            </div>
            <div className="hf-ai-desc">填好职位名称与核心诉求后生成草稿，生成结果可直接修改。</div>
            <Form.Item name="keywords" className="u-mt-8 u-mb-8" noStyle>
              <Input placeholder='如："懂 React 和 Node.js 的三年经验前端"' />
            </Form.Item>
            <Button
              size="small"
              icon={<RobotOutlined />}
              className="u-mt-8"
              onClick={handleGenerateJd}
              loading={generateJdMutation.isPending}
            >
              生成草稿
            </Button>
          </div>

          <Form.Item name="description" label="岗位职责（JD）">
            <Input.TextArea rows={5} placeholder="可用上方「AI 扩写 JD」生成后修改" />
          </Form.Item>
          <Form.Item name="requirement" label="任职要求">
            <Input.TextArea rows={4} placeholder="任职要求" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
