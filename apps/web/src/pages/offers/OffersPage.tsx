import { FieldTimeOutlined, InfoCircleOutlined, AuditOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  OFFER_APPROVAL_STATUS_LABEL,
  OFFER_DECISION_LABEL,
  PERMISSIONS,
  type OfferApprovalStatus,
  type OfferDecision,
} from '@hireflow/shared';
import { App, Modal, Spin, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { offersApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import { QueryErrorResult } from '../../components/QueryErrorResult';
import { RowActions } from '../../components/RowActions';
import { useSyncedTableScroll } from '../../hooks/useSyncedTableScroll';
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

/** AI 留存预测（辅助参考）。从操作列的「···」里唤起，不再占一个常驻链接位 */
function RetentionModal({ offerId, onClose }: { offerId: string | null; onClose: () => void }) {
  const [hint, setHint] = useState<RetentionHint | null>(null);
  const retentionMutation = useMutation({
    mutationFn: (id: string) => offersApi.retention(id),
    onSuccess: setHint,
  });
  return (
    <Modal
      className="hf-modal"
      title="AI 留存预测（辅助参考）"
      open={Boolean(offerId)}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      afterOpenChange={(open) => {
        if (open && offerId) {
          setHint(null);
          retentionMutation.mutate(offerId);
        }
      }}
    >
      {retentionMutation.isPending || !hint ? (
        <Spin size="small" />
      ) : (
        <>
          <span className="hf-kpi-num">{Math.round(hint.probability * 100)}%</span>
          <span className="hf-muted u-ml-8">预计通过试用期并留存</span>
          <ul className="plain-ol u-mt-8">
            {hint.factors.map((f, i) => (
              <li key={i} className="hf-secondary">
                {f}
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

export function OffersPage() {
  const { message, modal } = App.useApp();
  const [retentionFor, setRetentionFor] = useState<string | null>(null);
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

  const act = (fn: () => Promise<Offer>, success: string) =>
    fn()
      .then(() => {
        message.success(success);
        invalidate();
      })
      .catch((error) => message.error(extractErrorMessage(error, '操作失败')));

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

  /**
   * 操作列：所有动作走 RowActions —— 平铺 2 个最常用的，其余收进「···」。
   * 按「同一门控条件下的动作」分组展开，每个状态判断只写一次，避免同样的条件散在各处漂移。
   */
  const actionCell = (o: Offer) => {
    const st = o.approvalStatus;
    const pendingApproval = st === 'PENDING' && canApprove;
    /** 已发出、还挂在候选人那边（含超期）：链接与续期都归这一组 */
    const outstanding = (st === 'SENT' || st === 'EXPIRED') && canInitiate;
    /** 代录答复仅限 SENT：服务层 applyDecision 对 EXPIRED 直接抛错，放开只会得到点了必然失败的按钮 */
    const answerable = st === 'SENT' && !o.decision;

    /** 二次确认 + 请求 + 成功提示，是这一列里唯一重复的模板，收成一个函数 */
    const ask = (title: string, content: string, run: () => Promise<Offer>, success: string) => () =>
      modal.confirm({ title, content, cancelText: '取消', onOk: () => act(run, success) });

    return (
      <RowActions
        actions={[
          ...(pendingApproval
            ? [
                {
                  key: 'approve',
                  label: '通过',
                  hint: '批准该 Offer',
                  onClick: ask('批准该 Offer？', '批准后可发送给候选人。', () => offersApi.approve(o.id), '已批准'),
                },
                { key: 'reject', label: '驳回', hint: '驳回并填写原因', danger: true, onClick: () => setRejectTarget(o) },
              ]
            : []),
          ...(st === 'REJECTED' && canInitiate
            ? [{ key: 'resubmit', label: '重提', hint: '修改后重新提交审批', onClick: () => setResubmitTarget(o) }]
            : []),
          ...(st === 'APPROVED' && canInitiate
            ? [
                {
                  key: 'send',
                  label: '发送',
                  hint: '电子发送 Offer 给候选人',
                  onClick: ask(
                    '电子发送 Offer？',
                    '将生成候选人免登录链接，答复期 5 个工作日。',
                    () => offersApi.send(o.id),
                    'Offer 已发送，可复制候选人链接',
                  ),
                },
              ]
            : []),
          ...(outstanding
            ? [
                { key: 'link', label: '通知', hint: '复制录用通知链接发给候选人', onClick: () => void copyPortalLink(o) },
                ...(answerable
                  ? [
                      {
                        key: 'accept',
                        label: '接受',
                        hint: '代候选人录入「接受」，将自动创建入职单',
                        onClick: ask(
                          '候选人已接受 Offer？',
                          '将自动创建入职单。',
                          () => offersApi.respond(o.id, 'ACCEPTED'),
                          '已录入：接受，入职单已创建',
                        ),
                      },
                      { key: 'decline', label: '拒绝', hint: '代候选人录入「拒绝」', danger: true, onClick: () => setDeclineTarget(o) },
                    ]
                  : []),
                ...(!o.decision && !o.extendedOnce
                  ? [
                      {
                        key: 'extend',
                        label: '续期',
                        hint: '重新给予 5 个工作日答复期（仅一次）',
                        onClick: ask(
                          '续期该 Offer？',
                          '重新给予 5 个工作日答复期（仅可续期一次）。',
                          () => offersApi.extend(o.id),
                          '已续期 5 个工作日',
                        ),
                      },
                    ]
                  : []),
              ]
            : []),
          // 辅助参考，排在最后 —— 顺序靠后自然会被收进「···」
          { key: 'retention', label: '预测', hint: 'AI 留存预测（辅助参考）', onClick: () => setRetentionFor(o.id) },
        ]}
      />
    );
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

  const groupListRef = useSyncedTableScroll<HTMLDivElement>();
  /** 列宽合计，低于此宽度出现横向滚动而不是把列挤扁 */
  const OFFER_TABLE_X = 848;
  /** 首个非空分组才画表头，其余组直接接在下面，避免整页都是表头 */
  const firstGroupKey = GROUPS.find((g) => visible.some((o) => groupKey(o) === g.key))?.key;

  const offerColumns: TableProps<Offer>['columns'] = [
    {
      title: '候选人',
      key: 'candidate',
      width: 120,
      render: (_, o) => <span className="hf-primary hf-ellipsis">{o.application.candidate.name}</span>,
    },
    {
      title: '职位',
      key: 'job',
      ellipsis: true,
      render: (_, o) => (
        <span className="u-flex-gap-10">
          <span className="hf-secondary hf-ellipsis">{o.application.job.title}</span>
          <span className="hf-faint">{o.application.job.department.name}</span>
        </span>
      ),
    },
    {
      title: '职级',
      dataIndex: 'grade',
      width: 60,
      render: (grade: string | null) => <span className="hf-secondary hf-td--num">{grade ?? '—'}</span>,
    },
    {
      title: '薪资',
      key: 'salary',
      width: 140,
      // 无权限直接弱化，不显示「无权查看」四字 Tag
      render: (_, o) =>
        !canViewSalary ? (
          <span className="hf-faint">••••</span>
        ) : o.salary ? (
          <span className="hf-td--num">
            <b className="hf-secondary">¥{o.salary.base.toLocaleString()}</b>
            <span className="hf-faint u-ml-4">× {12 + (o.salary.bonusMonths ?? 0)} 薪</span>
          </span>
        ) : (
          <span className="hf-faint">—</span>
        ),
    },
    {
      title: '时效 / 答复',
      key: 'reply',
      width: 180,
      ellipsis: true,
      render: (_, o) => <span className="hf-ellipsis">{replyCell(o)}</span>,
    },
    {
      title: '更新',
      dataIndex: 'updatedAt',
      width: 116,
      align: 'right',
      render: (at: string) => <span className="hf-muted hf-td--num">{dayjs(at).format('MM-DD HH:mm')}</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 132,
      align: 'right',
      fixed: 'right',
      render: (_, o) => actionCell(o),
    },
  ];

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
          /* 按流程阶段分组，待审批排最上；取代分页。
             每组一张 Table：只有首个非空组显示表头，各组横滚由 useSyncedTableScroll 串起来 */
          <div ref={groupListRef}>
            {GROUPS.map((g) => {
              const items = visible.filter((o) => groupKey(o) === g.key);
              if (items.length === 0) return null;
              const first = firstGroupKey === g.key;
              return (
                <div key={g.key}>
                  <div className="hf-group-head">
                    <span className={g.dot} />
                    <span className={`hf-group-title ${g.tone}`}>{g.label}</span>
                    <span className="hf-group-count">{items.length}</span>
                  </div>
                  <div className="hf-atable hf-atable--fit">
                    <Table<Offer>
                      columns={offerColumns}
                      dataSource={items}
                      rowKey="id"
                      pagination={false}
                      showHeader={first}
                      scroll={{ x: OFFER_TABLE_X }}
                      rowClassName={() => (g.key === 'PENDING' ? 'hf-row--todo' : '')}
                    />
                  </div>
                </div>
              );
            })}
            <div className="hf-panel-foot hf-panel-foot--tight">
              <span>全部 {all.length} 份 Offer</span>
              <span className="hf-faint">
                {OFFER_APPROVAL_STATUS_LABEL['PENDING' as OfferApprovalStatus]}的 Offer 需用人经理处理
              </span>
            </div>
          </div>
        )}
      </div>

      <RetentionModal offerId={retentionFor} onClose={() => setRetentionFor(null)} />
      <RejectApprovalModal offer={rejectTarget} onClose={() => setRejectTarget(null)} onDone={invalidate} />
      <ResubmitModal offer={resubmitTarget} onClose={() => setResubmitTarget(null)} onDone={invalidate} />
      <DeclineEntryModal offer={declineTarget} onClose={() => setDeclineTarget(null)} onDone={invalidate} />
    </div>
  );
}
