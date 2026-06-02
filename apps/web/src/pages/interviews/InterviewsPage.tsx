import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClockCircleOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import {
  EVALUATION_CONCLUSION_LABEL,
  INTERVIEW_STATUS_LABEL,
  PERMISSIONS,
  type EvaluationConclusion,
  type InterviewStatus,
} from '@hireflow/shared';
import { App, Button, Card, DatePicker, Form, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { interviewsApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { Interview } from '../../api/types';
import { CandidateDetailDrawer } from '../../components/CandidateDetailDrawer';
import { EvaluationModal } from '../../components/EvaluationModal';
import { useAuthStore } from '../../stores/auth';

/** 15 分钟一档的全天时间选项：下拉单击即选，不用在时间轮盘上滚动+确认 */
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const value = `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`;
  return { value, label: value };
});

/** 我的可约时段：面试官自维护空闲档，候选人自助选时的档期来源 */
function MySlotsCard() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form] = Form.useForm<{ date: Dayjs; startTime: string; endTime: string }>();
  const startTime = Form.useWatch('startTime', form);

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
    <Card className="slots-card" size="small">
      <div className="section-header">
        <div className="section-title">
          <ClockCircleOutlined className="section-icon" />
          <span>我的可约时段</span>
        </div>
        <Button size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          添加时段
        </Button>
      </div>
      {!slotsQuery.data?.length ? (
        <Typography.Text type="secondary" className="u-meta">
          尚未维护空闲时段。添加后，HR 发出的「候选人自助选时」链接将展示你的空闲档。
        </Typography.Text>
      ) : (
        <Space wrap size={6}>
          {slotsQuery.data.map((s) => (
            <Tag
              key={s.id}
              className={`slot-tag ${s.bookedBy ? 'slot-tag--booked' : ''}`}
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
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => {
            const [h1, m1] = v.startTime.split(':').map(Number);
            const [h2, m2] = v.endTime.split(':').map(Number);
            const start = v.date.hour(h1).minute(m1).second(0).millisecond(0);
            const end = v.date.hour(h2).minute(m2).second(0).millisecond(0);
            addMutation.mutate([start, end]);
          }}
        >
          <Form.Item name="date" label="日期" rules={[{ required: true, message: '请选择日期' }]}>
            <DatePicker minDate={dayjs()} className="w-160" />
          </Form.Item>
          <Space className="u-flex-row" align="start">
            <Form.Item name="startTime" label="开始时间" rules={[{ required: true, message: '请选择开始时间' }]}>
              <Select
                className="w-120"
                showSearch
                placeholder="00:00"
                options={TIME_OPTIONS}
                onChange={() => form.setFieldValue('endTime', undefined)}
              />
            </Form.Item>
            <Form.Item name="endTime" label="结束时间" rules={[{ required: true, message: '请选择结束时间' }]}>
              <Select
                className="w-120"
                showSearch
                placeholder="00:00"
                disabled={!startTime}
                options={TIME_OPTIONS.filter((t) => !startTime || t.value > startTime)}
              />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Card>
  );
}

const CONCLUSION_COLOR: Record<string, string> = {
  STRONG_YES: 'success',
  YES: 'success',
  NO: 'warning',
  STRONG_NO: 'error',
};

export function InterviewsPage() {
  const { message, modal } = App.useApp();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [evaluateFor, setEvaluateFor] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const interviewsQuery = useQuery({
    queryKey: ['interviews', 'all'],
    queryFn: () => interviewsApi.list(),
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
            <Typography.Text copyable className="u-break-all">
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
    <div className="interviews-page">
      {/* 页面头部 */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">面试管理</h1>
          <p className="page-header-subtitle">安排面试时间，提交面评，管理可约时段</p>
        </div>
      </div>

      {/* 我的可约时段 */}
      <MySlotsCard />

      {/* 面试列表 */}
      <Card className="list-main-card u-mt-16">
        <Table<Interview>
          rowKey="id"
          scroll={{ x: 1200 }}
          loading={interviewsQuery.isLoading}
          dataSource={interviewsQuery.data}
          pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 场面试` }}
          columns={[
            {
              title: '候选人',
              width: 140,
              render: (_, r) =>
                r.application ? (
                  <div className="interview-candidate-cell">
                    <Button
                      type="link"
                      size="small"
                      className="candidate-name-link"
                      onClick={() => setDetailId(r.application!.candidate.id)}
                    >
                      {r.application.candidate.name}
                    </Button>
                  </div>
                ) : (
                  '-'
                ),
            },
            {
              title: '职位',
              width: 180,
              render: (_, r) => <span className="job-name-text">{r.application?.job.title ?? '-'}</span>,
            },
            {
              title: '轮次',
              dataIndex: 'round',
              width: 90,
              render: (v: number) => <span className="round-badge">第 {v} 轮</span>,
            },
            {
              title: '时间',
              dataIndex: 'scheduledAt',
              width: 140,
              render: (v: string | null) =>
                v ? (
                  <div className="interview-time">
                    <span className="time-date">{dayjs(v).format('MM-DD')}</span>
                    <span className="time-hour">{dayjs(v).format('HH:mm')}</span>
                  </div>
                ) : (
                  <Tag color="warning" className="pending-tag">待安排</Tag>
                ),
            },
            {
              title: '面试官',
              render: (_, r) => (
                <span className="interviewers-text">
                  {r.interviewers.map((i) => i.user.name).join('、') || '-'}
                </span>
              ),
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 120,
              render: (v: string) => (
                <Tag className="interview-status-tag" color={
                  v === 'COMPLETED' ? 'success' : v === 'SCHEDULED' ? 'processing' : 'default'
                }>
                  {INTERVIEW_STATUS_LABEL[v as InterviewStatus] ?? v}
                </Tag>
              ),
            },
            {
              title: '面评结果',
              render: (_, r) =>
                r.evaluations.length === 0 ? (
                  <span className="u-meta">未提交</span>
                ) : (
                  <div className="evaluation-tags">
                    {r.evaluations.map((ev) =>
                      ev.conclusion ? (
                        <Tag key={ev.id} className="evaluation-tag" color={CONCLUSION_COLOR[ev.conclusion]}>
                          {ev.interviewer.name}: {EVALUATION_CONCLUSION_LABEL[ev.conclusion as EvaluationConclusion]}
                        </Tag>
                      ) : null,
                    )}
                  </div>
                ),
            },
            {
              title: '操作',
              width: 180,
              fixed: 'right',
              render: (_, r) => (
                <Space size={4}>
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
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <EvaluationModal
        interviewId={evaluateFor}
        dimensions={interviewsQuery.data
          ?.find((i) => i.id === evaluateFor)
          ?.application?.job.scorecardTemplate?.map((t) => t.dimension)}
        onClose={() => setEvaluateFor(null)}
      />
      <CandidateDetailDrawer candidateId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
