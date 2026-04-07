import { PlusOutlined, RobotOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { JOB_STATUS_LABEL, PERMISSIONS, type JobStatus } from '@hireflow/shared';
import {
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { aiApi, departmentsApi, jobsApi, usersApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { Job } from '../../api/types';
import { useAuthStore } from '../../stores/auth';

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
            width: 150,
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
              </Space>
            ),
          },
        ]}
      />

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
