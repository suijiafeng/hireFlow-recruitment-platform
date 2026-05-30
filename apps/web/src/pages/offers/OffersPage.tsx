import { FieldTimeOutlined, InfoCircleOutlined, RobotOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  OFFER_APPROVAL_STATUS_LABEL,
  OFFER_DECISION_LABEL,
  OFFER_DECLINE_REASONS,
  PERMISSIONS,
  type OfferApprovalStatus,
  type OfferDecision,
} from '@hireflow/shared';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Popover,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { offersApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import { QueryErrorResult } from '../../components/QueryErrorResult';
import type { Offer, RetentionHint } from '../../api/types';
import { useAuthStore } from '../../stores/auth';

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  SENT: 'processing',
  EXPIRED: 'error',
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
          <div className="retention-pop">
            <Typography.Text strong className="u-num-20">
              {Math.round(hint.probability * 100)}%
            </Typography.Text>
            <Typography.Text type="secondary" className="u-ml-8 u-meta">
              预计通过试用期并留存
            </Typography.Text>
            <ul className="retention-list">
              {hint.factors.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        ) : (
          <Typography.Text type="secondary" className="u-meta">
            点击生成
          </Typography.Text>
        )
      }
    >
      <Button size="small" type="link" icon={<RobotOutlined />} className="u-p0">
        AI 参考
      </Button>
    </Popover>
  );
}

/** 审批驳回：意见必填，随 Offer 退回 HR */
function RejectApprovalModal({
  offer,
  onClose,
  onDone,
}: {
  offer: Offer | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ note: string }>();
  const mutation = useMutation({
    mutationFn: (values: { note: string }) => offersApi.reject(offer!.id, values.note),
    onSuccess: () => {
      message.success('已驳回，意见已退回 HR 修改重提');
      onClose();
      onDone();
    },
    onError: (error) => message.error(extractErrorMessage(error, '操作失败')),
  });
  return (
    <Modal
      title={offer ? `驳回 Offer：${offer.application.candidate.name}` : '驳回 Offer'}
      open={Boolean(offer)}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认驳回"
      okButtonProps={{ danger: true }}
      confirmLoading={mutation.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)}>
        <Form.Item
          name="note"
          label="审批意见（必填，供 HR 修改重提）"
          rules={[{ required: true, message: '驳回必须填写意见' }]}
        >
          <Input.TextArea rows={3} placeholder="如：薪资超出该职级带宽，请调整后重提" maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** 驳回后修改重提：调整薪资包重新进入审批 */
function ResubmitModal({
  offer,
  onClose,
  onDone,
}: {
  offer: Offer | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ salaryBase: number; bonusMonths?: number; grade?: string; note?: string }>();
  const mutation = useMutation({
    mutationFn: (values: { salaryBase: number; bonusMonths?: number; grade?: string; note?: string }) =>
      offersApi.resubmit(offer!.id, values),
    onSuccess: () => {
      message.success('已重新提交审批');
      onClose();
      onDone();
    },
    onError: (error) => message.error(extractErrorMessage(error, '操作失败')),
  });
  return (
    <Modal
      title={offer ? `修改重提：${offer.application.candidate.name}` : '修改重提'}
      open={Boolean(offer)}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="重新提交审批"
      confirmLoading={mutation.isPending}
      destroyOnHidden
    >
      {offer?.approvalNote && (
        <Alert
          type="warning"
          showIcon
          title="审批驳回意见"
          description={offer.approvalNote}
          className="u-mb-16"
        />
      )}
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          salaryBase: offer?.salary?.base,
          bonusMonths: offer?.salary?.bonusMonths ?? 0,
          grade: offer?.grade ?? undefined,
          note: offer?.salary?.note ?? undefined,
        }}
        onFinish={(v) => mutation.mutate(v)}
      >
        <Space className="u-flex-row" align="start">
          <Form.Item
            name="salaryBase"
            label="月薪（base，元）"
            rules={[{ required: true, message: '请输入月薪' }]}
          >
            <InputNumber min={1000} max={1_000_000} step={1000} className="w-160" />
          </Form.Item>
          <Form.Item name="bonusMonths" label="年终奖月数">
            <InputNumber min={0} max={12} className="w-120" />
          </Form.Item>
          <Form.Item name="grade" label="职级">
            <Input placeholder="P6" maxLength={20} className="w-100" />
          </Form.Item>
        </Space>
        <Form.Item name="note" label="备注（审批人可见）">
          <Input.TextArea rows={2} maxLength={500} placeholder="如：已按带宽上限调整" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** HR 代录候选人拒绝：原因码必选 */
function DeclineEntryModal({
  offer,
  onClose,
  onDone,
}: {
  offer: Offer | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ reason: string }>();
  const mutation = useMutation({
    mutationFn: (values: { reason: string }) => offersApi.respond(offer!.id, 'DECLINED', values.reason),
    onSuccess: () => {
      message.success('已录入：拒绝');
      onClose();
      onDone();
    },
    onError: (error) => message.error(extractErrorMessage(error, '操作失败')),
  });
  return (
    <Modal
      title={offer ? `录入拒绝：${offer.application.candidate.name}` : '录入拒绝'}
      open={Boolean(offer)}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认录入"
      okButtonProps={{ danger: true }}
      confirmLoading={mutation.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)}>
        <Form.Item
          name="reason"
          label="拒绝原因码（必选，用于渠道与薪酬竞争力分析）"
          rules={[{ required: true, message: '请选择原因码' }]}
        >
          <Select placeholder="选择原因" options={OFFER_DECLINE_REASONS.map((r) => ({ value: r, label: r }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function OffersPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [rejectTarget, setRejectTarget] = useState<Offer | null>(null);
  const [resubmitTarget, setResubmitTarget] = useState<Offer | null>(null);
  const [declineTarget, setDeclineTarget] = useState<Offer | null>(null);

  const offersQuery = useQuery({ queryKey: ['offers'], queryFn: offersApi.list, retry: false });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['offers'] });
    void queryClient.invalidateQueries({ queryKey: ['onboardings'] });
    void queryClient.invalidateQueries({ queryKey: ['board'] });
  };

  const act = (fn: () => Promise<Offer>, success: string) => {
    fn()
      .then(() => {
        message.success(success);
        invalidate();
      })
      .catch((error) => message.error(extractErrorMessage(error, '操作失败')));
  };

  /** 获取门户令牌并复制候选人链接（剪贴板不可用时弹窗展示） */
  const copyPortalLink = async (offer: Offer) => {
    try {
      const { token } = await offersApi.portalLink(offer.id);
      const url = `${window.location.origin}/portal/offer/${token}`;
      try {
        await navigator.clipboard.writeText(url);
        message.success('候选人链接已复制，请通过邮件/IM 发送给候选人');
      } catch {
        modal.info({
          title: '候选人链接',
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

  const canApprove = hasPermission(PERMISSIONS.OFFER_APPROVE);
  const canInitiate = hasPermission(PERMISSIONS.OFFER_INITIATE);
  const canViewSalary = hasPermission(PERMISSIONS.SALARY_VIEW);

  return (
    <div className="offers-page">
      {/* 页面头部 */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">录用管理</h1>
          <p className="page-header-subtitle">发起 Offer、审批流转、发送候选人、跟踪答复状态</p>
        </div>
      </div>

      {/* 流程说明 */}
      <div className="process-flow-card">
        <div className="process-flow-title">
          <InfoCircleOutlined className="process-flow-icon" />
          <span>Offer 流程说明</span>
        </div>
        <div className="process-flow-steps">
          <span className="flow-step">HR 发起</span>
          <span className="flow-arrow">→</span>
          <span className="flow-step">审批（可驳回重提）</span>
          <span className="flow-arrow">→</span>
          <span className="flow-step">发送候选人</span>
          <span className="flow-arrow">→</span>
          <span className="flow-step">在线答复</span>
          <span className="flow-arrow">→</span>
          <span className="flow-step flow-step--final">自动生成入职单</span>
        </div>
      </div>

      {/* Offer 列表 */}
      <Card className="list-main-card u-mt-16">
        {offersQuery.isError ? (
          <QueryErrorResult error={offersQuery.error} />
        ) : (
          <Table<Offer>
            rowKey="id"
            scroll={{ x: 1300 }}
            loading={offersQuery.isLoading}
            dataSource={offersQuery.data}
            pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 份 Offer` }}
            columns={[
              {
                title: '候选人',
                width: 140,
                render: (_, r) => (
                  <div className="offer-candidate-cell">
                    <span className="candidate-name-text">{r.application.candidate.name}</span>
                  </div>
                ),
              },
              {
                title: '职位',
                render: (_, r) => (
                  <div className="offer-job-cell">
                    <div className="job-title-text">{r.application.job.title}</div>
                    <div className="job-dept-text">{r.application.job.department.name}</div>
                  </div>
                ),
              },
              {
                title: '职级',
                dataIndex: 'grade',
                width: 90,
                render: (v?: string) => v ? <span className="grade-badge">{v}</span> : '-',
              },
              {
                title: '薪资',
                width: 180,
                render: (_, r) =>
                  !canViewSalary ? (
                    <Typography.Text type="secondary" className="u-meta">
                      无权查看
                    </Typography.Text>
                  ) : r.salary ? (
                    <span className="salary-text">
                      ¥{r.salary.base.toLocaleString()} <span className="salary-months">× {12 + (r.salary.bonusMonths ?? 0)} 薪</span>
                    </span>
                  ) : (
                    '-'
                  ),
              },
              {
                title: '审批状态',
                dataIndex: 'approvalStatus',
                width: 130,
                render: (v: string, r) => (
                  <Space size={4}>
                    <Tag className="approval-tag" color={STATUS_COLOR[v]}>
                      {OFFER_APPROVAL_STATUS_LABEL[v as OfferApprovalStatus] ?? v}
                    </Tag>
                    {v === 'REJECTED' && r.approvalNote && (
                      <Tooltip title={`驳回意见：${r.approvalNote}`}>
                        <InfoCircleOutlined className="ico-warning" />
                      </Tooltip>
                    )}
                  </Space>
                ),
              },
              {
                title: '候选人答复',
                width: 160,
                render: (_, r) => {
                  if (r.decision) {
                    return (
                      <Space size={4}>
                        <Tag className="decision-tag" color={r.decision === 'ACCEPTED' ? 'success' : 'error'}>
                          {OFFER_DECISION_LABEL[r.decision as OfferDecision] ?? r.decision}
                        </Tag>
                        {r.decision === 'DECLINED' && r.decisionReason && (
                          <Tooltip title={`原因：${r.decisionReason}`}>
                            <InfoCircleOutlined className="ico-error" />
                          </Tooltip>
                        )}
                      </Space>
                    );
                  }
                  if (r.approvalStatus === 'SENT' && r.expiresAt) {
                    const daysLeft = dayjs(r.expiresAt).diff(dayjs(), 'day');
                    return (
                      <Tooltip title={`答复截止：${dayjs(r.expiresAt).format('YYYY-MM-DD HH:mm')}${r.extendedOnce ? '（已续期）' : ''}`}>
                        <Tag className="expire-tag" color={daysLeft <= 1 ? 'error' : 'default'} icon={<FieldTimeOutlined />}>
                          剩 {Math.max(daysLeft, 0)} 天
                        </Tag>
                      </Tooltip>
                    );
                  }
                  if (r.approvalStatus === 'EXPIRED') {
                    return <Tag color="error" className="expired-tag">超期未答复</Tag>;
                  }
                  return <span className="u-meta">待答复</span>;
                },
              },
              {
                title: '更新时间',
                dataIndex: 'updatedAt',
                width: 140,
                render: (v: string) => <span className="u-meta">{dayjs(v).format('MM-DD HH:mm')}</span>,
              },
              {
                title: '操作',
                width: 280,
                fixed: 'right',
                render: (_, r) => (
                  <Space size={4} wrap>
                    {r.approvalStatus === 'PENDING' && <RetentionPopover offerId={r.id} />}
                    {r.approvalStatus === 'PENDING' && canApprove && (
                      <>
                        <Popconfirm title="批准该 Offer？" onConfirm={() => act(() => offersApi.approve(r.id), '已批准')}>
                          <Button size="small" type="link" className="action-link">
                            通过
                          </Button>
                        </Popconfirm>
                        <Button size="small" type="link" danger className="action-link" onClick={() => setRejectTarget(r)}>
                          驳回
                        </Button>
                      </>
                    )}
                    {r.approvalStatus === 'REJECTED' && canInitiate && (
                      <Button size="small" type="link" className="action-link" onClick={() => setResubmitTarget(r)}>
                        修改重提
                      </Button>
                    )}
                    {r.approvalStatus === 'APPROVED' && canInitiate && (
                      <Popconfirm
                        title="电子发送 Offer？"
                        description="将生成候选人免登录链接，答复期 5 个工作日"
                        onConfirm={() => act(() => offersApi.send(r.id), 'Offer 已发送，可复制候选人链接')}
                      >
                        <Button size="small" type="link" className="action-link">
                          发送
                        </Button>
                      </Popconfirm>
                    )}
                    {(r.approvalStatus === 'SENT' || r.approvalStatus === 'EXPIRED') && canInitiate && (
                      <Button size="small" type="link" className="action-link" onClick={() => void copyPortalLink(r)}>
                        复制链接
                      </Button>
                    )}
                    {(r.approvalStatus === 'SENT' || r.approvalStatus === 'EXPIRED') &&
                      !r.decision &&
                      !r.extendedOnce &&
                      canInitiate && (
                        <Popconfirm
                          title="续期该 Offer？"
                          description="重新给予 5 个工作日答复期（仅可续期一次）"
                          onConfirm={() => act(() => offersApi.extend(r.id), '已续期 5 个工作日')}
                        >
                          <Button size="small" type="link" className="action-link">
                            续期
                          </Button>
                        </Popconfirm>
                      )}
                    {r.approvalStatus === 'SENT' && !r.decision && canInitiate && (
                      <>
                        <Popconfirm
                          title="候选人已接受 Offer？将自动创建入职单"
                          onConfirm={() => act(() => offersApi.respond(r.id, 'ACCEPTED'), '已录入：接受，入职单已创建')}
                        >
                          <Button size="small" type="link" className="action-link">
                            录入接受
                          </Button>
                        </Popconfirm>
                        <Button size="small" type="link" className="action-link" onClick={() => setDeclineTarget(r)}>
                          录入拒绝
                        </Button>
                      </>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        )}
        <RejectApprovalModal offer={rejectTarget} onClose={() => setRejectTarget(null)} onDone={invalidate} />
        <ResubmitModal offer={resubmitTarget} onClose={() => setResubmitTarget(null)} onDone={invalidate} />
        <DeclineEntryModal offer={declineTarget} onClose={() => setDeclineTarget(null)} onDone={invalidate} />
      </Card>
    </div>
  );
}
