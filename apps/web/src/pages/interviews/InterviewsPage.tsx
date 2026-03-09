import { useQuery } from '@tanstack/react-query';
import {
  EVALUATION_CONCLUSION_LABEL,
  INTERVIEW_STATUS_LABEL,
  PERMISSIONS,
  type EvaluationConclusion,
  type InterviewStatus,
} from '@hireflow/shared';
import { Button, Card, Space, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { interviewsApi } from '../../api';
import type { Interview } from '../../api/types';
import { CandidateDetailDrawer } from '../../components/CandidateDetailDrawer';
import { EvaluationModal } from '../../components/EvaluationModal';
import { useAuthStore } from '../../stores/auth';

const CONCLUSION_COLOR: Record<string, string> = {
  STRONG_YES: 'green',
  YES: 'cyan',
  NO: 'orange',
  STRONG_NO: 'red',
};

export function InterviewsPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [evaluateFor, setEvaluateFor] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const interviewsQuery = useQuery({
    queryKey: ['interviews', 'all'],
    queryFn: () => interviewsApi.list(),
  });

  return (
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
            width: 100,
            render: (_, r) =>
              hasPermission(PERMISSIONS.EVALUATION_SUBMIT) && (
                <Button type="link" size="small" onClick={() => setEvaluateFor(r.id)}>
                  提交面评
                </Button>
              ),
          },
        ]}
      />
      <EvaluationModal interviewId={evaluateFor} onClose={() => setEvaluateFor(null)} />
      <CandidateDetailDrawer candidateId={detailId} onClose={() => setDetailId(null)} />
    </Card>
  );
}
