import { CheckOutlined, CloseOutlined, RobotOutlined, SendOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  OFFER_APPROVAL_STATUS_LABEL,
  OFFER_DECISION_LABEL,
  PERMISSIONS,
  type OfferApprovalStatus,
  type OfferDecision,
} from '@hireflow/shared';
import { App, Button, Card, Popconfirm, Popover, Space, Spin, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { offersApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { Offer, RetentionHint } from '../../api/types';
import { useAuthStore } from '../../stores/auth';

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  PENDING: 'gold',
  APPROVED: 'blue',
  REJECTED: 'red',
  SENT: 'cyan',
};

/** AI 留存预测气泡（辅助参考） */
function RetentionPopover({ offerId }: { offerId: string }) {
  const [hint, setHint] = useState<RetentionHint | null>(null);
  const retentionMutation = useMutation({
    mutationFn: () => offersApi.retention(offerId),
    onSuccess: setHint,
  });
  return (
    <Popover
      title="AI 留存预测（辅助参考）"
      trigger="click"
      onOpenChange={(open) => {
        if (open && !hint && !retentionMutation.isPending) retentionMutation.mutate();
      }}
      content={
        retentionMutation.isPending ? (
          <Spin size="small" />
        ) : hint ? (
          <div style={{ maxWidth: 320 }}>
            <Typography.Text strong style={{ fontSize: 20 }}>
              {Math.round(hint.probability * 100)}%
            </Typography.Text>
            <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
              预计通过试用期并留存
            </Typography.Text>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#555' }}>
              {hint.factors.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            点击生成
          </Typography.Text>
        )
      }
    >
      <Button size="small" icon={<RobotOutlined />}>
        AI 参考
      </Button>
    </Popover>
  );
}

export function OffersPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const offersQuery = useQuery({ queryKey: ['offers'], queryFn: offersApi.list });

  const act = (fn: () => Promise<Offer>, success: string) => {
    fn()
      .then(() => {
        message.success(success);
        void queryClient.invalidateQueries({ queryKey: ['offers'] });
        void queryClient.invalidateQueries({ queryKey: ['onboardings'] });
        void queryClient.invalidateQueries({ queryKey: ['board'] });
      })
      .catch((error) => message.error(extractErrorMessage(error, '操作失败')));
  };

  const canApprove = hasPermission(PERMISSIONS.OFFER_APPROVE);
  const canInitiate = hasPermission(PERMISSIONS.OFFER_INITIATE);
  const canViewSalary = hasPermission(PERMISSIONS.SALARY_VIEW);

  return (
    <Card title="录用管理" styles={{ body: { paddingTop: 8 } }}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
        流程：HR 从候选人详情发起 Offer → 用人经理审批 → HR 电子发送 → 录入候选人答复；接受后自动生成入职单并移卡「待入职」
      </Typography.Paragraph>
      <Table<Offer>
        rowKey="id"
        loading={offersQuery.isLoading}
        dataSource={offersQuery.data}
        pagination={{ pageSize: 10 }}
        columns={[
          { title: '候选人', width: 110, render: (_, r) => r.application.candidate.name },
          {
            title: '职位',
            render: (_, r) => `${r.application.job.title}（${r.application.job.department.name}）`,
          },
          { title: '职级', dataIndex: 'grade', width: 80, render: (v?: string) => v ?? '-' },
          {
            title: '薪资',
            width: 150,
            render: (_, r) =>
              !canViewSalary ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  无权查看
                </Typography.Text>
              ) : r.salary ? (
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  ¥{r.salary.base.toLocaleString()} × {12 + (r.salary.bonusMonths ?? 0)} 薪
                </span>
              ) : (
                '-'
              ),
          },
          {
            title: '审批状态',
            dataIndex: 'approvalStatus',
            width: 100,
            render: (v: string) => (
              <Tag color={STATUS_COLOR[v]}>
                {OFFER_APPROVAL_STATUS_LABEL[v as OfferApprovalStatus] ?? v}
              </Tag>
            ),
          },
          {
            title: '候选人答复',
            dataIndex: 'decision',
            width: 100,
            render: (v: string | null) =>
              v ? (
                <Tag color={v === 'ACCEPTED' ? 'green' : 'red'}>
                  {OFFER_DECISION_LABEL[v as OfferDecision] ?? v}
                </Tag>
              ) : (
                <span style={{ color: '#999' }}>待答复</span>
              ),
          },
          {
            title: '更新时间',
            dataIndex: 'updatedAt',
            width: 110,
            render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
          },
          {
            title: '操作',
            width: 230,
            render: (_, r) => (
              <Space size={4} wrap>
                {r.approvalStatus === 'PENDING' && <RetentionPopover offerId={r.id} />}
                {r.approvalStatus === 'PENDING' && canApprove && (
                  <>
                    <Popconfirm title="批准该 Offer？" onConfirm={() => act(() => offersApi.approve(r.id), '已批准')}>
                      <Button size="small" type="primary" icon={<CheckOutlined />}>
                        通过
                      </Button>
                    </Popconfirm>
                    <Popconfirm title="驳回该 Offer？" onConfirm={() => act(() => offersApi.reject(r.id), '已驳回')}>
                      <Button size="small" danger icon={<CloseOutlined />}>
                        驳回
                      </Button>
                    </Popconfirm>
                  </>
                )}
                {r.approvalStatus === 'APPROVED' && canInitiate && (
                  <Popconfirm
                    title="电子发送 Offer 给候选人？"
                    onConfirm={() => act(() => offersApi.send(r.id), 'Offer 已发送')}
                  >
                    <Button size="small" type="primary" icon={<SendOutlined />}>
                      发送
                    </Button>
                  </Popconfirm>
                )}
                {r.approvalStatus === 'SENT' && !r.decision && canInitiate && (
                  <>
                    <Popconfirm
                      title="候选人已接受 Offer？将自动创建入职单"
                      onConfirm={() => act(() => offersApi.respond(r.id, 'ACCEPTED'), '已录入：接受，入职单已创建')}
                    >
                      <Button size="small" type="primary">
                        录入接受
                      </Button>
                    </Popconfirm>
                    <Popconfirm
                      title="候选人拒绝了 Offer？"
                      onConfirm={() => act(() => offersApi.respond(r.id, 'DECLINED'), '已录入：拒绝')}
                    >
                      <Button size="small">录入拒绝</Button>
                    </Popconfirm>
                  </>
                )}
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );
}
