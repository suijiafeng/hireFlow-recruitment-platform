import { FieldTimeOutlined, InfoCircleOutlined, AuditOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  OFFER_APPROVAL_STATUS_LABEL,
  OFFER_DECISION_LABEL,
  PERMISSIONS,
  type OfferApprovalStatus,
  type OfferDecision,
} from '@hireflow/shared';
import { App, Popconfirm, Popover, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { offersApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import { QueryErrorResult } from '../../components/QueryErrorResult';
import type { Offer, RetentionHint } from '../../api/types';
import { DeclineEntryModal } from './DeclineEntryModal';
import { RejectApprovalModal } from './RejectApprovalModal';
import { ResubmitModal } from './ResubmitModal';
import { useAuthStore } from '../../stores/auth';

/** 分组顺序 = 流程顺序，待办排最上 */
const GROUPS: Array<{ key: string; label: string; dot: string; tone: string }> = [
  { key: 'PENDING', label: '待审批', dot: 'hf-dot hf-dot--on', tone: '' },
  { key: 'REJECTED', label: '已驳回 · 待修改重提', dot: 'hf-dot hf-dot--err', tone: 'hf-state--err' },
  { key: 'APPROVED', label: '已批准 · 待发送', dot: 'hf-dot hf-dot--on', tone: '' },
  { key: 'SENT', label: '已发送 · 待答复', dot: 'hf-dot hf-dot--alert', tone: 'hf-state--warn' },
  { key: 'EXPIRED', label: '超期未答复', dot: 'hf-dot hf-dot--err', tone: 'hf-state--err' },
  { key: 'ACCEPTED', label: '已接受', dot: 'hf-dot hf-dot--ok', tone: 'hf-state--ok' },
  { key: 'DECLINED', label: '已拒绝', dot: 'hf-dot hf-dot--off', tone: 'hf-state--off' },
];

/** AI 留存预测（辅助参考） */
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
          <div className="w-260">
            <span className="hf-kpi-num">{Math.round(hint.probability * 100)}%</span>
            <span className="hf-muted u-ml-8">预计通过试用期并留存</span>
            <ul className="plain-ol u-mt-8">
              {hint.factors.map((f, i) => (
                <li key={i} className="hf-secondary">
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <span className="hf-muted">点击生成</span>
        )
      }
    >
      <span className="hf-link" onClick={(e) => e.stopPropagation()}>
        AI 参考
      </span>
    </Popover>
  );
}

export function OffersPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [rejectTarget, setRejectTarget] = useState<Offer | null>(null);
  const [resubmitTarget, setResubmitTarget] = useState<Offer | null>(null);
  const [declineTarget, setDeclineTarget] = useState<Offer | null>(null);
  const [filter, setFilter] = useState<'all' | 'approve' | 'reply'>('all');

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

  const all = offersQuery.data ?? [];
  /** 分组键：已答复的按 decision 归组，其余按审批状态 */
  const groupKey = (o: Offer) => (o.decision ? o.decision : o.approvalStatus);
  const visible = all.filter((o) => {
    if (filter === 'approve') return o.approvalStatus === 'PENDING';
    if (filter === 'reply') return o.approvalStatus === 'SENT' && !o.decision;
    return true;
  });

  const pending = all.filter((o) => o.approvalStatus === 'PENDING').length;
  const toSend = all.filter((o) => o.approvalStatus === 'APPROVED').length;
  const toReply = all.filter((o) => o.approvalStatus === 'SENT' && !o.decision).length;
  const accepted = all.filter((o) => o.decision === 'ACCEPTED').length;
  const answered = accepted + all.filter((o) => o.decision === 'DECLINED').length;
  const avgBase =
    all.filter((o) => o.salary).reduce((s, o) => s + (o.salary?.base ?? 0), 0) /
    Math.max(all.filter((o) => o.salary).length, 1);

  const kpis = [
    { label: '待审批', value: pending, unit: '份' },
    { label: '待发送', value: toSend, unit: '份' },
    { label: '待答复', value: toReply, unit: '份' },
    { label: '接受率', value: answered ? `${Math.round((accepted / answered) * 100)}%` : '—', unit: '' },
    {
      label: '平均月薪',
      value: canViewSalary && avgBase ? `¥${Math.round(avgBase / 100) * 100}` : '—',
      unit: '',
    },
  ];

  /** 时效 / 答复：只有紧迫与终态才着色 */
  const replyCell = (o: Offer) => {
    if (o.decision) {
      const ok = o.decision === 'ACCEPTED';
      return (
        <span className={ok ? 'hf-state--ok hf-strong' : 'hf-state--off'}>
          {OFFER_DECISION_LABEL[o.decision as OfferDecision] ?? o.decision}
          {!ok && o.decisionReason ? ` · ${o.decisionReason}` : ''}
        </span>
      );
    }
    if (o.approvalStatus === 'SENT' && o.expiresAt) {
      const left = Math.max(dayjs(o.expiresAt).diff(dayjs(), 'day'), 0);
      return (
        <span className={left <= 2 ? 'hf-state--err hf-strong' : 'hf-muted'}>
          <FieldTimeOutlined /> 剩 {left} 天{o.extendedOnce ? '（已续期）' : ''}
        </span>
      );
    }
    if (o.approvalStatus === 'EXPIRED') return <span className="hf-state--err">超期未答复</span>;
    if (o.approvalStatus === 'REJECTED') return <span className="hf-muted">{o.approvalNote ?? '已驳回'}</span>;
    return <span className="hf-faint">—</span>;
  };

  /** 操作列：按状态只给一个最可能的动作，其余进 Popconfirm/弹窗 */
  const actionCell = (o: Offer) => {
    const st = o.approvalStatus;
    if (st === 'PENDING' && canApprove)
      return (
        <span className="u-flex-end u-flex-gap-12">
          <RetentionPopover offerId={o.id} />
          <Popconfirm title="批准该 Offer？" onConfirm={() => act(() => offersApi.approve(o.id), '已批准')}>
            <span className="hf-link" onClick={(e) => e.stopPropagation()}>
              通过
            </span>
          </Popconfirm>
          <span
            className="hf-link hf-link--danger"
            onClick={(e) => {
              e.stopPropagation();
              setRejectTarget(o);
            }}
          >
            驳回
          </span>
        </span>
      );
    if (st === 'REJECTED' && canInitiate)
      return (
        <span
          className="hf-link"
          onClick={(e) => {
            e.stopPropagation();
            setResubmitTarget(o);
          }}
        >
          修改重提
        </span>
      );
    if (st === 'APPROVED' && canInitiate)
      return (
        <Popconfirm
          title="电子发送 Offer？"
          description="将生成候选人免登录链接，答复期 5 个工作日"
          onConfirm={() => act(() => offersApi.send(o.id), 'Offer 已发送，可复制候选人链接')}
        >
          <span className="hf-link" onClick={(e) => e.stopPropagation()}>
            发送
          </span>
        </Popconfirm>
      );
    if ((st === 'SENT' || st === 'EXPIRED') && canInitiate)
      return (
        <span className="u-flex-end u-flex-gap-12">
          <span
            className="hf-link"
            onClick={(e) => {
              e.stopPropagation();
              void copyPortalLink(o);
            }}
          >
            复制链接
          </span>
          {!o.decision && !o.extendedOnce && (
            <Popconfirm
              title="续期该 Offer？"
              description="重新给予 5 个工作日答复期（仅可续期一次）"
              onConfirm={() => act(() => offersApi.extend(o.id), '已续期 5 个工作日')}
            >
              <span className="hf-link" onClick={(e) => e.stopPropagation()}>
                续期
              </span>
            </Popconfirm>
          )}
          {st === 'SENT' && !o.decision && (
            <Popconfirm
              title="候选人已接受 Offer？将自动创建入职单"
              onConfirm={() => act(() => offersApi.respond(o.id, 'ACCEPTED'), '已录入：接受，入职单已创建')}
            >
              <span className="hf-link" onClick={(e) => e.stopPropagation()}>
                录入接受
              </span>
            </Popconfirm>
          )}
          {/* 录入拒绝：设计稿挂了 DeclineEntryModal 却没留入口，会让「代录拒绝」能力整个丢失，按原页面补回。
              门控必须与「录入接受」一致限定 SENT——offers.service.applyDecision 对 EXPIRED 直接抛
              BadRequestException，放开到 EXPIRED 会得到一个点了必然失败的按钮。 */}
          {st === 'SENT' && !o.decision && (
            <span
              className="hf-link hf-link--danger"
              onClick={(e) => {
                e.stopPropagation();
                setDeclineTarget(o);
              }}
            >
              录入拒绝
            </span>
          )}
        </span>
      );
    return <span className="hf-link">详情</span>;
  };

  if (offersQuery.isError) {
    return (
      <div className="hf-page">
        <div className="hf-body">
          <QueryErrorResult error={offersQuery.error} />
        </div>
      </div>
    );
  }

  return (
    <div className="hf-page">
      {/* 控制栏：分段筛选 + 流程说明内联（取代整块蓝底流程卡） */}
      <div className="hf-bar">
        <div className="hf-bar-left">
          <div className="hf-seg">
            <span className={filter === 'all' ? 'hf-seg--on' : undefined} onClick={() => setFilter('all')}>
              全部
            </span>
            <span className={filter === 'approve' ? 'hf-seg--on' : undefined} onClick={() => setFilter('approve')}>
              待我审批
            </span>
            <span className={filter === 'reply' ? 'hf-seg--on' : undefined} onClick={() => setFilter('reply')}>
              待答复
            </span>
          </div>
          <span className="hf-muted">
            <InfoCircleOutlined /> HR 发起 → 审批 → 发送 → 候选人答复 → <b>自动生成入职单</b>
          </span>
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

        {offersQuery.isLoading ? (
          <div className="hf-state-block">
            <Spin />
          </div>
        ) : visible.length === 0 ? (
          <div className="hf-state-block">
            <div className="hf-state-icon">
              <AuditOutlined />
            </div>
            <div>
              <div className="hf-state-title">{filter === 'all' ? '还没有 Offer' : '没有符合条件的 Offer'}</div>
              <div className="hf-state-desc">
                在候选人详情里点「发起 Offer」，提交后会进入审批，审批通过才能发送候选人。
              </div>
            </div>
          </div>
        ) : (
          /* 按流程阶段分组，待审批排最上；取代分页 */
          <div className="hf-table">
            <div className="hf-thead">
              <span className="hf-td w-160">候选人</span>
              <span className="hf-td--grow">职位</span>
              <span className="hf-td w-48">职级</span>
              <span className="hf-td w-130">薪资</span>
              <span className="hf-td--grow">时效 / 答复</span>
              <span className="hf-td hf-td--right w-100">更新</span>
              <span className="hf-td hf-td--right w-240">操作</span>
            </div>
            <div className="hf-tbody">
              {GROUPS.map((g) => {
                const items = visible.filter((o) => groupKey(o) === g.key);
                if (items.length === 0) return null;
                return (
                  <div key={g.key}>
                    <div className="hf-group-head">
                      <span className={g.dot} />
                      <span className={`hf-group-title ${g.tone}`}>{g.label}</span>
                      <span className="hf-group-count">{items.length}</span>
                    </div>
                    {items.map((o) => (
                      <div key={o.id} className={g.key === 'PENDING' ? 'hf-tr hf-tr--focus' : 'hf-tr'}>
                        <span className="hf-td w-160">
                          <span className="hf-primary hf-ellipsis">{o.application.candidate.name}</span>
                        </span>
                        <span className="hf-td--grow u-flex-gap-10">
                          <span className="hf-secondary hf-ellipsis">{o.application.job.title}</span>
                          <span className="hf-faint">{o.application.job.department.name}</span>
                        </span>
                        <span className="hf-td w-48 hf-secondary hf-td--num">{o.grade ?? '—'}</span>
                        {/* 薪资：无权限直接弱化，不再显示「无权查看」四字 Tag */}
                        <span className="hf-td w-130 hf-td--num">
                          {!canViewSalary ? (
                            <span className="hf-faint">••••</span>
                          ) : o.salary ? (
                            <>
                              <b className="hf-secondary">¥{o.salary.base.toLocaleString()}</b>
                              <span className="hf-faint u-ml-4">× {12 + (o.salary.bonusMonths ?? 0)} 薪</span>
                            </>
                          ) : (
                            <span className="hf-faint">—</span>
                          )}
                        </span>
                        <span className="hf-td--grow hf-ellipsis">{replyCell(o)}</span>
                        <span className="hf-td hf-td--right w-100 hf-muted hf-td--num">
                          {dayjs(o.updatedAt).format('MM-DD HH:mm')}
                        </span>
                        <span className="hf-td hf-td--right w-240">{actionCell(o)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="hf-panel-foot hf-panel-foot--tight">
              <span>全部 {all.length} 份 Offer</span>
              <span className="hf-faint">
                {OFFER_APPROVAL_STATUS_LABEL['PENDING' as OfferApprovalStatus]}的 Offer 需用人经理处理
              </span>
            </div>
          </div>
        )}
      </div>

      <RejectApprovalModal offer={rejectTarget} onClose={() => setRejectTarget(null)} onDone={invalidate} />
      <ResubmitModal offer={resubmitTarget} onClose={() => setResubmitTarget(null)} onDone={invalidate} />
      <DeclineEntryModal offer={declineTarget} onClose={() => setDeclineTarget(null)} onDone={invalidate} />
    </div>
  );
}
