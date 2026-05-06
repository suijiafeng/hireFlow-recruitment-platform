import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClockCircleOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import {
  EVALUATION_CONCLUSION_LABEL,
  INTERVIEW_STATUS_LABEL,
  PERMISSIONS,
  type EvaluationConclusion,
  type InterviewStatus,
} from '@hireflow/shared';
import { App, Button, Card, DatePicker, Form, Modal, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { interviewsApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { Interview } from '../../api/types';
import { CandidateDetailDrawer } from '../../components/CandidateDetailDrawer';
import { EvaluationModal } from '../../components/EvaluationModal';
import { useAuthStore } from '../../stores/auth';

/** 我的可约时段：面试官自维护空闲档，候选人自助选时的档期来源 */
function MySlotsCard() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form] = Form.useForm<{ range: [Dayjs, Dayjs] }>();

  const slotsQuery = useQuery({ queryKey: ['my-slots'], queryFn: interviewsApi.mySlots });

  const addMutation = useMutation({
    mutationFn: (range: [Dayjs, Dayjs]) =>
      interviewsApi.addSlot(range[0].toISOString(), range[1].toISOString()),
    onSuccess: () => {
      message.success('时段已添加，候选人可从中自助选时');
      setAddOpen(false);
      form.resetFields();
      void queryClient.invalidateQueries({ queryKey: ['my-slots'] });
    },
    onError: (error) => message.error(extractErrorMessage(error, '添加失败')),
  });

  const removeMutation = useMutation({
    mutationFn: interviewsApi.removeSlot,
    onSuccess: () => {
      message.success('时段已删除');
      void queryClient.invalidateQueries({ queryKey: ['my-slots'] });
    },
    onError: (error) => message.error(extractErrorMessage(error, '删除失败')),
  });

  return (
    <Card
      size="small"
      title={
        <>
          <ClockCircleOutlined /> 我的可约时段
        </>
      }
      extra={
        <Button size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          添加时段
        </Button>
      }
      style={{ marginBottom: 16 }}
    >
      {!slotsQuery.data?.length ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          尚未维护空闲时段。添加后，HR 发出的「候选人自助选时」链接将展示你的空闲档。
        </Typography.Text>
      ) : (
        <Space wrap size={6}>
          {slotsQuery.data.map((s) => (
            <Tag
              key={s.id}
              color={s.bookedBy ? 'orange' : 'blue'}
              closable={!s.bookedBy}
              onClose={(e) => {
                e.preventDefault();
                removeMutation.mutate(s.id);
              }}
            >
              {dayjs(s.startAt).format('MM-DD HH:mm')}-{dayjs(s.endAt).format('HH:mm')}
              {s.bookedBy ? ' · 已被预约' : ''}
            </Tag>
          ))}
        </Space>
      )}
      <Modal
        title="添加可约时段"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={addMutation.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(v) => addMutation.mutate(v.range)}>
          <Form.Item name="range" label="起止时间" rules={[{ required: true, message: '请选择时间段' }]}>
            <DatePicker.RangePicker
              showTime={{ format: 'HH:mm', minuteStep: 15 }}
              format="MM-DD HH:mm"
              minDate={dayjs()}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

const CONCLUSION_COLOR: Record<string, string> = {
  STRONG_YES: 'green',
  YES: 'cyan',
  NO: 'orange',
  STRONG_NO: 'red',
};

export function InterviewsPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [evaluateFor, setEvaluateFor] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const interviewsQuery = useQuery({
    queryKey: ['interviews', 'all'],
    queryFn: () => interviewsApi.list(),
  });

  const cancelMutation = useMutation({
    mutationFn: interviewsApi.cancel,
    onSuccess: () => {
      message.success('面试已取消，已通知面试官');
      void queryClient.invalidateQueries({ queryKey: ['interviews'] });
    },
    onError: (error) => message.error(extractErrorMessage(error, '取消失败')),
  });

  /** 复制候选人自助选时链接 */
  const copySelfScheduleLink = async (interviewId: string) => {
    try {
      const { token } = await interviewsApi.selfScheduleLink(interviewId);
      const url = `${window.location.origin}/portal/interview/${token}`;
      try {
        await navigator.clipboard.writeText(url);
        message.success('选时链接已复制，请发送给候选人');
      } catch {
        modal.info({
          title: '候选人选时链接',
          content: (
            <Typography.Text copyable style={{ wordBreak: 'break-all' }}>
              {url}
            </Typography.Text>
          ),
        });
      }
    } catch (error) {
      message.error(extractErrorMessage(error, '获取链接失败'));
    }
  };

  return (
    <>
      <MySlotsCard />
      <Card title="面试管理">
      <Table<Interview>
        rowKey="id"
        loading={interviewsQuery.isLoading}
        dataSource={interviewsQuery.data}
        pagination={{ pageSize: 10 }}
        columns={[
          {
            title: '候选人',
            width: 120,
            render: (_, r) =>
              r.application ? (
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0 }}
                  onClick={() => setDetailId(r.application!.candidate.id)}
                >
                  {r.application.candidate.name}
                </Button>
              ) : (
                '-'
              ),
          },
          { title: '职位', width: 160, render: (_, r) => r.application?.job.title ?? '-' },
          { title: '轮次', dataIndex: 'round', width: 70, render: (v: number) => `第 ${v} 轮` },
          {
            title: '时间',
            dataIndex: 'scheduledAt',
            width: 140,
            render: (v: string | null) => (v ? dayjs(v).format('MM-DD HH:mm') : '待定'),
          },
          {
            title: '面试官',
            render: (_, r) => r.interviewers.map((i) => i.user.name).join('、') || '-',
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 90,
            render: (v: string) => <Tag>{INTERVIEW_STATUS_LABEL[v as InterviewStatus] ?? v}</Tag>,
          },
          {
            title: '面评',
            render: (_, r) =>
              r.evaluations.length === 0 ? (
                <span style={{ color: '#999' }}>未提交</span>
              ) : (
                <Space size={4} wrap>
                  {r.evaluations.map((ev) =>
                    ev.conclusion ? (
                      <Tag key={ev.id} color={CONCLUSION_COLOR[ev.conclusion]}>
                        {ev.interviewer.name}:{' '}
                        {EVALUATION_CONCLUSION_LABEL[ev.conclusion as EvaluationConclusion]}
                      </Tag>
                    ) : null,
                  )}
                </Space>
              ),
          },
          {
            title: '操作',
            width: 230,
            render: (_, r) => (
              <Space size={0}>
                {hasPermission(PERMISSIONS.EVALUATION_SUBMIT) && (
                  <Button type="link" size="small" onClick={() => setEvaluateFor(r.id)}>
                    提交面评
                  </Button>
                )}
                {!r.scheduledAt && hasPermission(PERMISSIONS.INTERVIEW_SCHEDULE) && (
                  <Button
                    type="link"
                    size="small"
                    icon={<LinkOutlined />}
                    onClick={() => void copySelfScheduleLink(r.id)}
                  >
                    选时链接
                  </Button>
                )}
                {hasPermission(PERMISSIONS.INTERVIEW_SCHEDULE) && r.status === 'SCHEDULED' && (
                  <Popconfirm
                    title="确认取消这场面试？"
                    description="将通知全部被指派面试官"
                    onConfirm={() => cancelMutation.mutate(r.id)}
                  >
                    <Button type="link" size="small" danger>
                      取消
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      <EvaluationModal
        interviewId={evaluateFor}
        dimensions={interviewsQuery.data
          ?.find((i) => i.id === evaluateFor)
          ?.application?.job.scorecardTemplate?.map((t) => t.dimension)}
        onClose={() => setEvaluateFor(null)}
      />
      <CandidateDetailDrawer candidateId={detailId} onClose={() => setDetailId(null)} />
      </Card>
    </>
  );
}
