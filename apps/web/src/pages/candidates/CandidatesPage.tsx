import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS } from '@hireflow/shared';
import { App, Button, Card, Form, Input, Modal, Select, Space, Table, Tag } from 'antd';
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

  return (
    <Card
      title="候选人"
      extra={
        <Space>
          <Input.Search
            placeholder="姓名/邮箱/电话/标签"
            allowClear
            onSearch={(value) => {
              setPage(1);
              setKeyword(value.trim());
            }}
            style={{ width: 240 }}
          />
          {hasPermission(PERMISSIONS.CANDIDATE_CREATE) && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新增候选人
            </Button>
          )}
        </Space>
      }
    >
      <Table<Candidate>
        rowKey="id"
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
            width: 100,
            render: (name: string, record) => (
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setDetailId(record.id)}>
                {name}
              </Button>
            ),
          },
          {
            title: '联系方式',
            width: 220,
            render: (_, r) => (
              <div style={{ fontSize: 12 }}>
                <div>{r.email ?? '-'}</div>
                <div style={{ color: '#999' }}>{r.phone ?? '-'}</div>
              </div>
            ),
          },
          { title: '来源', dataIndex: 'source', width: 110, render: (v?: string) => v ?? '-' },
          {
            title: '技能标签',
            dataIndex: 'tags',
            render: (tags: string[]) => (
              <>
                {tags.map((tag) => (
                  <Tag key={tag} color="blue">
                    {tag}
                  </Tag>
                ))}
              </>
            ),
          },
          {
            title: '应聘进展',
            render: (_, r) =>
              r.applications?.length ? (
                r.applications.map((a) => (
                  <Tag key={a.id}>
                    {a.job.title} · {a.stage.name}
                  </Tag>
                ))
              ) : (
                <span style={{ color: '#999' }}>暂无</span>
              ),
          },
          {
            title: '录入时间',
            dataIndex: 'createdAt',
            width: 110,
            render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
          },
          {
            title: '操作',
            width: 80,
            render: (_, record) => (
              <Button type="link" size="small" onClick={() => setDetailId(record.id)}>
                详情
              </Button>
            ),
          },
        ]}
      />

      <CandidateDetailDrawer candidateId={detailId} onClose={() => setDetailId(null)} />

      <Modal
        title="新增候选人"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate(values)}>
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
    </Card>
  );
}
