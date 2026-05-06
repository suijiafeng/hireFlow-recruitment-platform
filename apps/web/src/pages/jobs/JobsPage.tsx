import { PlusOutlined, RobotOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { JOB_STATUS_LABEL, PERMISSIONS, type JobStatus } from '@hireflow/shared';
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { aiApi, departmentsApi, jobsApi, usersApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { Job, TalentPoolScanResult } from '../../api/types';
import { useAuthStore } from '../../stores/auth';

/** 岗位评分卡模板配置（动态表单引擎第一个兑现点） */
function ScorecardModal({ job, onClose }: { job: Job | null; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ template: Array<{ dimension: string; weight: number }> }>();

  const saveMutation = useMutation({
    mutationFn: (template: Array<{ dimension: string; weight: number }>) =>
      jobsApi.update(job!.id, { scorecardTemplate: template }),
    onSuccess: () => {
      message.success('评分卡模板已保存，面评表单与 AI 草稿将按新维度出题');
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      void queryClient.invalidateQueries({ queryKey: ['interviews'] });
      onClose();
    },
    onError: (error) => message.error(extractErrorMessage(error, '保存失败')),
  });

  return (
    <Modal
      title={job ? `评分卡模板 · ${job.title}` : '评分卡模板'}
      open={Boolean(job)}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saveMutation.isPending}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        面评表单与 AI 面评草稿都会按此模板出维度（2-8 个）；权重供终审对比参考。
      </Typography.Paragraph>
      <Form
        form={form}
        initialValues={{
          template: job?.scorecardTemplate?.length
            ? job.scorecardTemplate
            : [
                { dimension: '技术能力', weight: 40 },
                { dimension: '工程素养', weight: 30 },
                { dimension: '沟通协作', weight: 30 },
              ],
        }}
        onFinish={(v) => saveMutation.mutate(v.template)}
      >
        <Form.List
          name="template"
          rules={[
            {
              validator: async (_, value: unknown[]) => {
                if (!value || value.length < 2) throw new Error('至少 2 个维度');
                if (value.length > 8) throw new Error('最多 8 个维度');
              },
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <>
              {fields.map((field) => (
                <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 4 }}>
                  <Form.Item
                    name={[field.name, 'dimension']}
                    rules={[{ required: true, message: '维度名必填' }, { max: 20 }]}
                  >
                    <Input placeholder="维度名，如：系统设计" style={{ width: 220 }} />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'weight']}
                    rules={[{ required: true, message: '权重必填' }]}
                  >
                    <InputNumber min={0} max={100} placeholder="权重" style={{ width: 100 }} addonAfter="%" />
                  </Form.Item>
                  <Button type="link" danger size="small" onClick={() => remove(field.name)}>
                    删除
                  </Button>
                </Space>
              ))}
              <Button block type="dashed" icon={<PlusOutlined />} onClick={() => add({ dimension: '', weight: 10 })}>
                添加维度
              </Button>
              <Form.ErrorList errors={errors} />
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}

/** 人才库唤醒抽屉：打开即扫描，AI 打分推荐 + 一键激活 */
function TalentPoolDrawer({ job, onClose }: { job: Job | null; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<TalentPoolScanResult | null>(null);
  const [activated, setActivated] = useState<Set<string>>(new Set());

  const scanMutation = useMutation({
    mutationFn: (jobId: string) => jobsApi.talentPoolScan(jobId),
    onSuccess: setResult,
    onError: (error) => message.error(extractErrorMessage(error, '扫描失败')),
  });

  const activateMutation = useMutation({
    mutationFn: (candidateId: string) => jobsApi.talentPoolActivate(job!.id, candidateId),
    onSuccess: (_card, candidateId) => {
      setActivated((prev) => new Set(prev).add(candidateId));
      message.success('已激活：新应聘已进入简历初筛');
      void queryClient.invalidateQueries({ queryKey: ['board'] });
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => message.error(extractErrorMessage(error, '激活失败')),
  });

  return (
    <Drawer
      title={job ? `人才库唤醒 · ${job.title}` : '人才库唤醒'}
      size={560}
      open={Boolean(job)}
      onClose={() => {
        setResult(null);
        setActivated(new Set());
        onClose();
      }}
      destroyOnHidden
      afterOpenChange={(open) => {
        if (open && job) scanMutation.mutate(job.id);
      }}
    >
      {scanMutation.isPending ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin tip="AI 正在按本职位要求重新评估历史候选人…" />
        </div>
      ) : !result ? null : result.recommendations.length === 0 ? (
        <Empty description={`已扫描 ${result.scanned} 位历史候选人，暂无匹配推荐`} />
      ) : (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            title={`已扫描 ${result.scanned} 位历史淘汰/撤回候选人，按匹配度推荐 ${result.recommendations.length} 位`}
            description={result.recommendations[0]?.aiMeta.degraded ? 'AI 引擎降级中，结果由规则引擎生成' : undefined}
          />
          {result.recommendations.map((rec) => (
            <Card key={rec.candidate.id} size="small" style={{ marginBottom: 10 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <Typography.Text strong>{rec.candidate.name}</Typography.Text>
                  <Tag color={rec.score >= 85 ? 'green' : rec.score >= 70 ? 'blue' : 'default'}>
                    匹配 {rec.score}
                  </Tag>
                </Space>
                <Button
                  size="small"
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  disabled={activated.has(rec.candidate.id)}
                  loading={activateMutation.isPending && activateMutation.variables === rec.candidate.id}
                  onClick={() => activateMutation.mutate(rec.candidate.id)}
                >
                  {activated.has(rec.candidate.id) ? '已激活' : '激活到本职位'}
                </Button>
              </Space>
              <div style={{ margin: '6px 0 4px' }}>
                {rec.hits.map((h) => (
                  <Tag key={h} color="blue" style={{ fontSize: 11 }}>
                    {h}
                  </Tag>
                ))}
              </div>
              <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>
                {rec.highlights}
              </Typography.Paragraph>
              {rec.lastApplication && (
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  上次：{rec.lastApplication.jobTitle} ·{' '}
                  {rec.lastApplication.status === 'WITHDRAWN' ? '已撤回' : '已淘汰'}
                  {rec.lastApplication.rejectReason ? `（${rec.lastApplication.rejectReason}）` : ''} ·{' '}
                  {dayjs(rec.lastApplication.updatedAt).format('YYYY-MM-DD')}
                </Typography.Text>
              )}
            </Card>
          ))}
        </>
      )}
    </Drawer>
  );
}

const STATUS_COLOR: Record<JobStatus, string> = {
  DRAFT: 'default',
  PENDING_APPROVAL: 'gold',
  OPEN: 'green',
  PAUSED: 'orange',
  CLOSED: 'red',
};

export function JobsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);
  const [talentPoolJob, setTalentPoolJob] = useState<Job | null>(null);
  const [scorecardJob, setScorecardJob] = useState<Job | null>(null);
  const [form] = Form.useForm();

  const jobsQuery = useQuery({
    queryKey: ['jobs', page, keyword],
    queryFn: () => jobsApi.list({ page, pageSize: 10, keyword: keyword || undefined }),
  });
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const managersQuery = useQuery({
    queryKey: ['users', 'HIRING_MANAGER'],
    queryFn: () => usersApi.list('HIRING_MANAGER'),
    enabled: createOpen,
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

  return (
    <Card
      title="职位管理"
      extra={
        <Space>
          <Input.Search
            placeholder="搜索职位名称"
            allowClear
            onSearch={(value) => {
              setPage(1);
              setKeyword(value.trim());
            }}
            style={{ width: 240 }}
          />
          {hasPermission(PERMISSIONS.JOB_CREATE) && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建职位
            </Button>
          )}
        </Space>
      }
    >
      <Table<Job>
        rowKey="id"
        loading={jobsQuery.isLoading}
        dataSource={jobsQuery.data?.items}
        pagination={{
          current: page,
          pageSize: 10,
          total: jobsQuery.data?.total,
          onChange: setPage,
          showTotal: (total) => `共 ${total} 个职位`,
        }}
        columns={[
          { title: '职位名称', dataIndex: 'title' },
          { title: '部门', dataIndex: ['department', 'name'], width: 120 },
          {
            title: '用人经理',
            dataIndex: ['hiringManager', 'name'],
            width: 140,
            render: (name: string | undefined) => name ?? '-',
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (status: JobStatus) => (
              <Tag color={STATUS_COLOR[status]}>{JOB_STATUS_LABEL[status]}</Tag>
            ),
          },
          { title: 'HC', dataIndex: 'headcount', width: 70 },
          {
            title: '候选人',
            width: 90,
            render: (_, record) => record._count?.applications ?? 0,
          },
          {
            title: '创建时间',
            dataIndex: 'createdAt',
            width: 120,
            render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
          },
          {
            title: '操作',
            width: 230,
            render: (_, record) => (
              <Space size={0}>
                <Button type="link" size="small" onClick={() => navigate(`/pipeline?jobId=${record.id}`)}>
                  查看看板
                </Button>
                {hasPermission(PERMISSIONS.JOB_UPDATE) && (
                  <Button type="link" size="small" onClick={() => openEdit(record)}>
                    编辑
                  </Button>
                )}
                {hasPermission(PERMISSIONS.APPLICATION_CREATE) && (
                  <Button
                    type="link"
                    size="small"
                    icon={<ThunderboltOutlined />}
                    onClick={() => setTalentPoolJob(record)}
                  >
                    人才库唤醒
                  </Button>
                )}
                {hasPermission(PERMISSIONS.JOB_UPDATE) && (
                  <Button type="link" size="small" onClick={() => setScorecardJob(record)}>
                    评分卡
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />

      <TalentPoolDrawer job={talentPoolJob} onClose={() => setTalentPoolJob(null)} />
      <ScorecardModal job={scorecardJob} onClose={() => setScorecardJob(null)} />

      <Modal
        title={editing ? `编辑职位：${editing.title}` : '新建职位'}
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
          onFinish={(values) =>
            editing
              ? updateMutation.mutate({ id: editing.id, values })
              : createMutation.mutate(values)
          }
          initialValues={{ headcount: 1 }}
        >
          {editing && (
            <Form.Item name="status" label="职位状态">
              <Select
                options={Object.entries(JOB_STATUS_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Form.Item>
          )}
          <Form.Item name="title" label="职位名称" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="如：后端工程师" />
          </Form.Item>
          <Form.Item name="departmentId" label="所属部门" rules={[{ required: true, message: '请选择部门' }]}>
            <Select
              placeholder="选择部门"
              loading={departmentsQuery.isLoading}
              options={departmentsQuery.data?.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Form.Item>
          <Form.Item name="hiringManagerId" label="用人经理">
            <Select
              allowClear
              placeholder="选择用人经理（可选）"
              loading={managersQuery.isLoading}
              options={managersQuery.data?.map((u) => ({ value: u.id, label: u.name }))}
            />
          </Form.Item>
          <Form.Item name="headcount" label="招聘人数（HC）">
            <InputNumber min={1} max={999} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="keywords" label="核心诉求（供 AI 扩写用，可选）">
            <Input placeholder='如："需要一个懂 React 和 Node.js 的三年经验前端"' />
          </Form.Item>
          <Form.Item style={{ marginBottom: 12 }}>
            <Button
              icon={<RobotOutlined />}
              onClick={handleGenerateJd}
              loading={generateJdMutation.isPending}
            >
              AI 生成 JD
            </Button>
          </Form.Item>
          <Form.Item name="description" label="岗位职责（JD）">
            <Input.TextArea rows={5} placeholder="可点击上方「AI 生成 JD」自动扩写，生成后可修改" />
          </Form.Item>
          <Form.Item name="requirement" label="任职要求">
            <Input.TextArea rows={4} placeholder="任职要求（AI 生成后可修改）" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
