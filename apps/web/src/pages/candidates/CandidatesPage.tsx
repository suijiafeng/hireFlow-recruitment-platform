import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS } from '@hireflow/shared';
import { App, Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { candidatesApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { Candidate } from '../../api/types';
import { CandidateDetailDrawer } from '../../components/CandidateDetailDrawer';
import { useAuthStore } from '../../stores/auth';

export function CandidatesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const candidatesQuery = useQuery({
    queryKey: ['candidates', page, keyword],
    queryFn: () => candidatesApi.list({ page, pageSize: 10, keyword: keyword || undefined }),
  });

  const createMutation = useMutation({
    mutationFn: candidatesApi.create,
    onSuccess: (candidate) => {
      message.success(`候选人「${candidate.name}」已录入`);
      setCreateOpen(false);
      form.resetFields();
      void queryClient.invalidateQueries({ queryKey: ['candidates'] });
    },
    onError: (error) => message.error(extractErrorMessage(error, '录入失败')),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; values: Parameters<typeof candidatesApi.update>[1] }) =>
      candidatesApi.update(vars.id, vars.values),
    onSuccess: (candidate) => {
      message.success(`候选人「${candidate.name}」资料已更新`);
      setEditing(null);
      form.resetFields();
      void queryClient.invalidateQueries({ queryKey: ['candidates'] });
    },
    onError: (error) => message.error(extractErrorMessage(error, '更新失败')),
  });

  const openEdit = (candidate: Candidate) => {
    setEditing(candidate);
    form.setFieldsValue({
      name: candidate.name,
      email: candidate.email ?? undefined,
      phone: candidate.phone ?? undefined,
      source: candidate.source ?? undefined,
      tags: candidate.tags,
    });
  };

  return (
    <div className="candidates-page">
      {/* 页面头部 */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">候选人库</h1>
          <p className="page-header-subtitle">管理所有候选人信息，查看应聘进度，安排面试</p>
        </div>
        <div className="page-header-actions">
          {hasPermission(PERMISSIONS.CANDIDATE_CREATE) && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新增候选人
            </Button>
          )}
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="filter-bar">
        <div className="filter-bar-row">
          <Input.Search
            placeholder="搜索姓名、邮箱、电话、标签"
            allowClear
            onSearch={(value) => {
              setPage(1);
              setKeyword(value.trim());
            }}
            className="w-320"
          />
        </div>
      </div>

      {/* 候选人列表 */}
      <Card className="list-main-card">
        <Table<Candidate>
          rowKey="id"
          scroll={{ x: 1100 }}
          loading={candidatesQuery.isLoading}
          dataSource={candidatesQuery.data?.items}
          pagination={{
            current: page,
            pageSize: 10,
            total: candidatesQuery.data?.total,
            onChange: setPage,
            showTotal: (total) => `共 ${total} 名候选人`,
          }}
          columns={[
            {
              title: '姓名',
              dataIndex: 'name',
              width: 140,
              render: (name: string, record) => (
                <div className="candidate-name-cell">
                  <Button type="link" size="small" className="candidate-name-link" onClick={() => setDetailId(record.id)}>
                    {name}
                  </Button>
                </div>
              ),
            },
            {
              title: '联系方式',
              width: 240,
              render: (_, r) => (
                <div className="contact-cell">
                  <div className="contact-email">{r.email ?? '-'}</div>
                  <div className="contact-phone">{r.phone ?? '-'}</div>
                </div>
              ),
            },
            {
              title: '来源',
              dataIndex: 'source',
              width: 120,
              render: (v?: string) => <span className="source-text">{v ?? '-'}</span>,
            },
            {
              title: '技能标签',
              dataIndex: 'tags',
              render: (tags: string[]) => (
                <div className="tags-cell">
                  {tags.slice(0, 4).map((tag) => (
                    <Tag key={tag} className="skill-tag">
                      {tag}
                    </Tag>
                  ))}
                  {tags.length > 4 && (
                    <Tooltip title={tags.slice(4).join('、')}>
                      <Tag className="more-tag">+{tags.length - 4}</Tag>
                    </Tooltip>
                  )}
                  {tags.length === 0 && <span className="u-meta">-</span>}
                </div>
              ),
            },
            {
              title: '应聘进展',
              render: (_, r) =>
                r.applications?.length ? (
                  <div className="application-tags">
                    {r.applications.map((a) => (
                      <Tag key={a.id} className="application-tag">
                        {a.job.title} · {a.stage.name}
                      </Tag>
                    ))}
                  </div>
                ) : (
                  <span className="u-meta">暂无应聘</span>
                ),
            },
            {
              title: '录入时间',
              dataIndex: 'createdAt',
              width: 140,
              render: (v: string) => <span className="u-meta">{dayjs(v).format('YYYY-MM-DD')}</span>,
            },
            {
              title: '操作',
              width: 150,
              fixed: 'right',
              render: (_, record) => (
                <Space size={0}>
                  <Button type="link" size="small" onClick={() => setDetailId(record.id)}>
                    详情
                  </Button>
                  {hasPermission(PERMISSIONS.CANDIDATE_UPDATE) && (
                    <Button type="link" size="small" onClick={() => openEdit(record)}>
                      编辑
                    </Button>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <CandidateDetailDrawer candidateId={detailId} onClose={() => setDetailId(null)} />

      <Modal
        title={editing ? `编辑候选人：${editing.name}` : '新增候选人'}
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
            editing ? updateMutation.mutate({ id: editing.id, values }) : createMutation.mutate(values)
          }
        >
          <Form.Item name="name" label="姓名" rules={[{ required: true, min: 1 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input />
          </Form.Item>
          <Form.Item name="source" label="来源渠道">
            <Select
              allowClear
              placeholder="选择或输入来源"
              options={['BOSS直聘', '猎聘', '拉勾', '内推', '猎头推荐', '官网投递', '人才库唤醒'].map(
                (s) => ({ value: s, label: s }),
              )}
            />
          </Form.Item>
          <Form.Item name="tags" label="技能标签">
            <Select mode="tags" placeholder="输入后回车，可多个（二期由 AI 自动打标）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
