import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquareOutlined } from '@ant-design/icons';
import { PERMISSIONS, REJECT_REASONS, STAGE_STAY_SLA } from '@hireflow/shared';
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Checkbox,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { AxiosError } from 'axios';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { applicationsApi, boardApi, jobsApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { BatchResult, BoardCard, BoardData, CompareData } from '../../api/types';
import { CandidateDetailDrawer } from '../../components/CandidateDetailDrawer';
import { QueryErrorResult } from '../../components/QueryErrorResult';
import { useAuthStore } from '../../stores/auth';

/** 乐观更新：在本地缓存里把卡片从旧列挪到新列尾部 */
function moveCardInBoard(board: BoardData, applicationId: string, stageId: string): BoardData {
  let moved: BoardCard | undefined;
  const stripped = board.columns.map((col) => {
    const hit = col.applications.find((a) => a.id === applicationId);
    if (hit) moved = { ...hit, stageId };
    return { ...col, applications: col.applications.filter((a) => a.id !== applicationId) };
  });
  if (!moved) return board;
  return {
    ...board,
    columns: stripped.map((col) =>
      col.stage.id === stageId ? { ...col, applications: [...col.applications, moved!] } : col,
    ),
  };
}

function scoreBand(score: number): string {
  if (score >= 85) return 'kanban-score-dot kanban-score-dot--high';
  if (score >= 70) return 'kanban-score-dot kanban-score-dot--mid';
  return 'kanban-score-dot';
}

/** 阶段停留时长：仅超 SLA 才提示——超 3 天标黄、超 7 天标红 */
function StayTag({ card }: { card: BoardCard }) {
  const days = dayjs().diff(dayjs(card.stageEnteredAt), 'day');
  if (days <= STAGE_STAY_SLA.warnDays) return null;
  return (
    <Tag color={days > STAGE_STAY_SLA.dangerDays ? 'error' : 'warning'} className="tag-meta u-mr-0">
      停留 {days} 天
    </Tag>
  );
}

/** 卡片纯视图：列表与 DragOverlay 复用同一渲染，保证拖拽跟手且不被列容器裁剪 */
function CardView({ card, overlay = false }: { card: BoardCard; overlay?: boolean }) {
  return (
    <Card
      size="small"
      className={overlay ? 'kanban-card kanban-card--overlay' : 'kanban-card'}
      classNames={{ body: 'kanban-card-body' }}
    >
      <div className="u-flex-between">
        <Typography.Text strong>{card.candidate.name}</Typography.Text>
        <Space size={6}>
          {card.matchScore != null && (
            <Tooltip title={`AI 匹配分 ${card.matchScore}（≥85 优，≥70 良）`}>
              <span className="kanban-score">
                <span className={scoreBand(card.matchScore)} />
                {card.matchScore}
              </span>
            </Tooltip>
          )}
          <StayTag card={card} />
        </Space>
      </div>
      {card.candidate.tags.length > 0 && (
        <div className="kanban-skills">{card.candidate.tags.slice(0, 3).join(' · ')}</div>
      )}
      <div className="kanban-card-foot">
        <span>{card.candidate.source ?? '未知来源'}</span>
        <span>{dayjs(card.createdAt).format('MM-DD')}</span>
      </div>
    </Card>
  );
}

function DraggableCard({
  card,
  disabled,
  onOpen,
}: {
  card: BoardCard;
  disabled: boolean;
  onOpen: (candidateId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, disabled });
  // 拖拽由 DragOverlay 渲染跟手浮层；原卡片仅降透明度占位（修复裁剪/异常位移）
  const cls = [
    'drag-source',
    disabled ? 'drag-source--readonly' : '',
    isDragging ? 'drag-source--dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => {
        // PointerSensor 有 4px 启动阈值，纯点击不会触发拖拽
        if (!isDragging) onOpen(card.candidate.id);
      }}
      className={cls}
    >
      <CardView card={card} />
    </div>
  );
}

/** 批量模式下的可选卡片：点击/复选框切换选中，选中态描边高亮 */
function SelectableCard({
  card,
  checked,
  onToggle,
}: {
  card: BoardCard;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div onClick={() => onToggle(card.id)} className="select-card">
      <div className="select-card-check">
        <Checkbox checked={checked} onChange={() => onToggle(card.id)} onClick={(e) => e.stopPropagation()} />
      </div>
      <div className={checked ? 'select-card-frame select-card-frame--on' : 'select-card-frame'}>
        <CardView card={card} />
      </div>
    </div>
  );
}

function BoardColumnView({
  stage,
  cards,
  dragDisabled,
  onOpen,
  batchMode,
  selected,
  onToggle,
  onToggleColumn,
}: {
  stage: { id: string; name: string };
  cards: BoardCard[];
  dragDisabled: boolean;
  onOpen: (candidateId: string) => void;
  batchMode: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleColumn: (ids: string[], select: boolean) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled: batchMode });
  const selectedInColumn = cards.filter((c) => selected.has(c.id)).length;
  return (
    <div ref={setNodeRef} className={isOver ? 'kanban-col kanban-col--over' : 'kanban-col'}>
      <div className="kanban-col-head">
        {batchMode && cards.length > 0 && (
          <Checkbox
            checked={selectedInColumn === cards.length}
            indeterminate={selectedInColumn > 0 && selectedInColumn < cards.length}
            onChange={(e) =>
              onToggleColumn(
                cards.map((c) => c.id),
                e.target.checked,
              )
            }
          />
        )}
        <span className="kanban-col-title">
          {stage.name} <Badge count={cards.length} className="kanban-badge" />
        </span>
      </div>
      <div className="kanban-col-scroll">
        {cards.map((card) =>
          batchMode ? (
            <SelectableCard key={card.id} card={card} checked={selected.has(card.id)} onToggle={onToggle} />
          ) : (
            <DraggableCard key={card.id} card={card} disabled={dragDisabled} onOpen={onOpen} />
          ),
        )}
        {cards.length === 0 && <div className="kanban-col-empty">暂无卡片</div>}
      </div>
    </div>
  );
}

/** 候选人对比（V2 页面清单）：2-4 人并排 + AI 综合意见；AI 是辅助，终审在人 */
function CompareModal({ data, loading, onClose }: { data: CompareData | null; loading: boolean; onClose: () => void }) {
  const CONCLUSION_TEXT: Record<string, string> = {
    STRONG_YES: '强烈推荐',
    YES: '推荐',
    NO: '不推荐',
    STRONG_NO: '强烈不推荐',
  };
  return (
    <Modal
      title={data ? `候选人对比 · ${data.jobTitle}` : 'AI 正在对比…'}
      open={loading || Boolean(data)}
      onCancel={onClose}
      footer={null}
      width={Math.min(320 * (data?.candidates.length ?? 2) + 80, 1200)}
      classNames={{ body: 'modal-body-scroll' }}
      destroyOnHidden
    >
      {loading || !data ? (
        <div className="loading-center loading-center--lg">
          <Spin description="AI 正在汇总匹配分与面评数据…" />
        </div>
      ) : (
        <>
          <div className="compare-cols">
            {data.candidates.map((c) => {
              const rank = data.ai.ranking.find((r) => r.name === c.name)?.rank;
              return (
                <Card
                  key={c.applicationId}
                  size="small"
                  className={rank === 1 ? 'compare-card compare-card--top' : 'compare-card'}
                  title={
                    <Space>
                      {c.name}
                      {rank === 1 && <Tag color="processing">AI 首推</Tag>}
                    </Space>
                  }
                >
                  <p className="compare-line">
                    匹配分：
                    {c.matchScore != null ? <Tag color={c.matchScore >= 85 ? 'success' : c.matchScore >= 70 ? 'processing' : 'default'}>{c.matchScore}</Tag> : '未评分'}
                  </p>
                  <div className="u-mb-4">
                    {c.tags.slice(0, 4).map((t) => (
                      <Tag key={t} className="tag-meta">
                        {t}
                      </Tag>
                    ))}
                  </div>
                  {c.highlights && (
                    <Typography.Paragraph className="u-meta u-mb-4" ellipsis={{ rows: 3 }}>
                      {c.highlights}
                    </Typography.Paragraph>
                  )}
                  <div className="u-meta">
                    面评：
                    {c.evaluations.length === 0 ? (
                      <span className="u-muted">暂无</span>
                    ) : (
                      c.evaluations.map((e, i) => (
                        <Tag key={i} color={e.conclusion?.includes('YES') ? 'success' : 'warning'} className="tag-meta">
                          {CONCLUSION_TEXT[e.conclusion ?? ''] ?? '无结论'}
                          {e.avgScore != null ? ` ${e.avgScore}分` : ''}
                        </Tag>
                      ))
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
          <Alert
            type="info"
            showIcon
            title={`AI 综合意见（${data.aiMeta.provider}${data.aiMeta.degraded ? '·降级' : ''}，仅供参考，终审权在用人经理）`}
            description={
              <>
                <Typography.Paragraph className="u-mb-8">{data.ai.summary}</Typography.Paragraph>
                <ol className="plain-ol">
                  {data.ai.ranking
                    .slice()
                    .sort((a, b) => a.rank - b.rank)
                    .map((r) => (
                      <li key={r.name}>
                        <b>{r.name}</b> — {r.rationale}
                      </li>
                    ))}
                </ol>
                <Typography.Text type="secondary" className="u-meta u-block u-mt-8">
                  风险提示：{data.ai.risks}
                </Typography.Text>
              </>
            }
          />
        </>
      )}
    </Modal>
  );
}

interface PendingMove {
  applicationId: string;
  stageId: string;
  expectedVersion: number;
  candidateName: string;
  fromStage: string;
  toStage: string;
}

export function PipelinePage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [searchParams, setSearchParams] = useSearchParams();
  const jobId = searchParams.get('jobId') ?? '';
  const [detailId, setDetailId] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);
  const [pendingRevert, setPendingRevert] = useState<PendingMove | null>(null);
  const [revertForm] = Form.useForm();
  // 批量操作：选择态仅存前端，切换职位/退出批量即清空
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchRejectOpen, setBatchRejectOpen] = useState(false);
  const [batchMoveOpen, setBatchMoveOpen] = useState(false);
  const [batchRejectForm] = Form.useForm<{ reason: string; note?: string }>();
  const [batchMoveForm] = Form.useForm<{ stageId: string; reason?: string }>();

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'options'],
    queryFn: () => jobsApi.list({ page: 1, pageSize: 100 }),
  });

  useEffect(() => {
    if (!jobId && jobsQuery.data?.items.length) {
      setSearchParams({ jobId: jobsQuery.data.items[0].id }, { replace: true });
    }
  }, [jobId, jobsQuery.data, setSearchParams]);

  // 切换职位即清空批量选择态：否则勾选的是 A 职位的候选人，操作却在 B 职位看板上下文触发
  useEffect(() => {
    setBatchMode(false);
    setSelected(new Set());
  }, [jobId]);

  const boardQuery = useQuery({
    queryKey: ['board', jobId],
    queryFn: () => boardApi.get(jobId),
    enabled: Boolean(jobId),
  });

  const moveMutation = useMutation({
    mutationFn: (vars: {
      applicationId: string;
      stageId: string;
      reason?: string;
      expectedVersion?: number;
    }) =>
      boardApi.moveCard(vars.applicationId, {
        stageId: vars.stageId,
        reason: vars.reason,
        expectedVersion: vars.expectedVersion,
      }),
    onMutate: async ({ applicationId, stageId }) => {
      await queryClient.cancelQueries({ queryKey: ['board', jobId] });
      const previous = queryClient.getQueryData<BoardData>(['board', jobId]);
      if (previous) {
        queryClient.setQueryData(['board', jobId], moveCardInBoard(previous, applicationId, stageId));
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['board', jobId], context.previous);
      const status = (error as AxiosError)?.response?.status;
      if (status === 409) {
        message.warning('该卡片刚被他人移动，看板已自动刷新');
      } else {
        message.error(extractErrorMessage(error, '移动卡片失败'));
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['board', jobId] }),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const canMove = hasPermission(PERMISSIONS.APPLICATION_MOVE);

  const exitBatch = () => {
    setBatchMode(false);
    setSelected(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleColumn = (ids: string[], select: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (select ? next.add(id) : next.delete(id)));
      return next;
    });
  };

  /** 批量结果反馈：全部成功报数字；部分失败弹错误报告 */
  const reportBatch = (result: BatchResult, verb: string) => {
    void queryClient.invalidateQueries({ queryKey: ['board', jobId] });
    setSelected(new Set());
    if (result.failed.length === 0) {
      message.success(`${verb}成功 ${result.succeeded} 人`);
      return;
    }
    modal.warning({
      title: `${verb}完成：成功 ${result.succeeded} / ${result.total} 人`,
      width: 520,
      content: (
        <ul className="batch-fail-list">
          {result.failed.map((f) => (
            <li key={f.id}>
              <b>{f.candidate ?? f.id}</b>：{f.error}
            </li>
          ))}
        </ul>
      ),
    });
  };

  const batchRejectMutation = useMutation({
    mutationFn: (values: { reason: string; note?: string }) =>
      boardApi.batchReject({ ids: [...selected], ...values }),
    onSuccess: (result) => {
      setBatchRejectOpen(false);
      batchRejectForm.resetFields();
      reportBatch(result, '淘汰');
    },
    onError: (error) => message.error(extractErrorMessage(error, '批量淘汰失败')),
  });

  const batchMoveMutation = useMutation({
    mutationFn: (values: { stageId: string; reason?: string }) =>
      boardApi.batchMove({ ids: [...selected], stageId: values.stageId, reason: values.reason || undefined }),
    onSuccess: (result) => {
      setBatchMoveOpen(false);
      batchMoveForm.resetFields();
      reportBatch(result, '移动');
    },
    onError: (error) => message.error(extractErrorMessage(error, '批量移动失败')),
  });

  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const compareMutation = useMutation({
    mutationFn: () => applicationsApi.compare([...selected]),
    onSuccess: setCompareData,
    onError: (error) => message.error(extractErrorMessage(error, '对比失败')),
  });

  /** 发预筛链接（选中恰 1 人时可用；V2 1.2 邀约前核实硬性条件） */
  const sendPrescreen = async () => {
    const id = [...selected][0];
    try {
      const { token } = await applicationsApi.prescreenLink(id);
      const url = `${window.location.origin}/portal/prescreen/${token}`;
      try {
        await navigator.clipboard.writeText(url);
        message.success('预筛链接已复制，请发送给候选人（薪资/到岗/出差三问）');
      } catch {
        modal.info({
          title: '候选人预筛链接',
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

  const findCard = (id: string) =>
    boardQuery.data?.columns.flatMap((c) => c.applications).find((a) => a.id === id);

  const onDragStart = (event: DragStartEvent) => {
    setActiveCard(findCard(String(event.active.id)) ?? null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = event;
    if (!over || !boardQuery.data) return;
    const applicationId = String(active.id);
    const targetStageId = String(over.id);
    const card = findCard(applicationId);
    if (!card || card.stageId === targetStageId) return;

    const fromCol = boardQuery.data.columns.find((c) => c.stage.id === card.stageId);
    const toCol = boardQuery.data.columns.find((c) => c.stage.id === targetStageId);
    if (!fromCol || !toCol) return;

    // 受控回退：向后拖必须填写原因
    if (toCol.stage.order < fromCol.stage.order) {
      setPendingRevert({
        applicationId,
        stageId: targetStageId,
        expectedVersion: card.version,
        candidateName: card.candidate.name,
        fromStage: fromCol.stage.name,
        toStage: toCol.stage.name,
      });
      return;
    }
    moveMutation.mutate({ applicationId, stageId: targetStageId, expectedVersion: card.version });
  };

  return (
    <div className="pipeline-page">
      {/* 页面头部 */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">招聘看板</h1>
          <p className="page-header-subtitle">拖拽卡片管理候选人流程，支持批量操作与AI对比</p>
        </div>
        <div className="page-header-actions">
          <Space size={12}>
            <Select
              className="w-260"
              placeholder="选择职位"
              loading={jobsQuery.isLoading}
              value={jobId || undefined}
              onChange={(value) => setSearchParams({ jobId: value })}
              options={jobsQuery.data?.items.map((j) => ({
                value: j.id,
                label: `${j.title}（${j.department.name}）`,
              }))}
            />
            {!canMove && <Typography.Text type="secondary" className="pipeline-readonly-tip">仅查看</Typography.Text>}
            {canMove &&
              (batchMode ? (
                <Button onClick={exitBatch}>退出批量</Button>
              ) : (
                <Button icon={<CheckSquareOutlined />} onClick={() => setBatchMode(true)}>
                  批量操作
                </Button>
              ))}
          </Space>
        </div>
      </div>

      {/* 看板区域 */}
      <Card className="kanban-board-card">
        {batchMode && (
          <Alert
            type="info"
            showIcon
            className="batch-alert"
            message={
              <Space wrap>
                <span>
                  已选 <b>{selected.size}</b> 人（点卡片或列头复选框选择）
                </span>
                <Button
                  size="small"
                  danger
                  disabled={selected.size === 0}
                  onClick={() => setBatchRejectOpen(true)}
                >
                  批量淘汰
                </Button>
                <Button
                  size="small"
                  type="primary"
                  disabled={selected.size === 0}
                  onClick={() => setBatchMoveOpen(true)}
                >
                  批量移动
                </Button>
                <Button
                  size="small"
                  disabled={selected.size < 2 || selected.size > 4}
                  loading={compareMutation.isPending}
                  onClick={() => compareMutation.mutate()}
                >
                  AI 对比（2-4 人）
                </Button>
                <Button size="small" disabled={selected.size !== 1} onClick={() => void sendPrescreen()}>
                  预筛链接
                </Button>
                <Button size="small" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
                  清空选择
                </Button>
              </Space>
            }
          />
        )}
        {!jobId || boardQuery.isLoading ? (
          <div className="loading-center loading-center--lg">
            {jobsQuery.isLoading || boardQuery.isLoading ? (
              <Spin />
            ) : (
              <Empty description="暂无职位，请先创建职位" />
            )}
          </div>
        ) : boardQuery.isError ? (
          <QueryErrorResult error={boardQuery.error} />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setActiveCard(null)}
          >
            <div className="kanban-board">
              {boardQuery.data?.columns.map((column) => (
                <BoardColumnView
                  key={column.stage.id}
                  stage={column.stage}
                  cards={column.applications}
                  dragDisabled={!canMove || batchMode}
                  onOpen={setDetailId}
                  batchMode={batchMode}
                  selected={selected}
                  onToggle={toggleSelected}
                  onToggleColumn={toggleColumn}
                />
              ))}
            </div>
            {/* 拖拽浮层：脱离列容器渲染，修复卡片被 overflow 裁剪/异常位移的问题 */}
            <DragOverlay dropAnimation={null}>
              {activeCard ? (
                <div className="drag-overlay-card">
                  <CardView card={activeCard} overlay />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </Card>

      <Modal
        title="回退阶段需填写原因"
        open={Boolean(pendingRevert)}
        onCancel={() => {
          setPendingRevert(null);
          revertForm.resetFields();
        }}
        onOk={() => revertForm.submit()}
        confirmLoading={moveMutation.isPending}
        destroyOnHidden
      >
        {pendingRevert && (
          <Typography.Paragraph>
            将「{pendingRevert.candidateName}」从 <Tag>{pendingRevert.fromStage}</Tag> 回退到{' '}
            <Tag>{pendingRevert.toStage}</Tag>，回退操作仅 HR 可执行且全程留痕。
          </Typography.Paragraph>
        )}
        <Form
          form={revertForm}
          layout="vertical"
          onFinish={(values: { reason: string }) => {
            if (!pendingRevert) return;
            moveMutation.mutate(
              { ...pendingRevert, reason: values.reason },
              {
                onSuccess: () => {
                  setPendingRevert(null);
                  revertForm.resetFields();
                  message.success('已回退并留痕');
                },
              },
            );
          }}
        >
          <Form.Item
            name="reason"
            label="回退原因"
            rules={[{ required: true, min: 2, message: '请填写回退原因（至少 2 个字）' }]}
          >
            <Input.TextArea rows={3} placeholder="如：二面评价存在分歧，需重新安排一面补充考察" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量淘汰：破坏性操作显示影响人数 */}
      <Modal
        title={`批量淘汰 ${selected.size} 人`}
        open={batchRejectOpen}
        onCancel={() => setBatchRejectOpen(false)}
        onOk={() => batchRejectForm.submit()}
        okText={`确认淘汰 ${selected.size} 人`}
        okButtonProps={{ danger: true }}
        confirmLoading={batchRejectMutation.isPending}
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          className="u-mb-16"
          title="淘汰为终态操作，不可逆"
          description="每人独立留痕；原因码将用于漏斗分析与人才库回流。感谢信通道接入后将按防呆规则延迟 3 天发送。"
        />
        <Form form={batchRejectForm} layout="vertical" onFinish={(v) => batchRejectMutation.mutate(v)}>
          <Form.Item name="reason" label="淘汰原因码（应用于全部所选）" rules={[{ required: true, message: '请选择原因码' }]}>
            <Select placeholder="选择原因" options={REJECT_REASONS.map((r) => ({ value: r, label: r }))} />
          </Form.Item>
          <Form.Item name="note" label="补充说明（可选）">
            <Input.TextArea rows={2} maxLength={300} placeholder="如：本批次为简历初筛不匹配" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量移动：目标阶段 + 可选回退原因（批量含回退卡时后端逐条校验） */}
      <Modal
        title={`批量移动 ${selected.size} 人`}
        open={batchMoveOpen}
        onCancel={() => setBatchMoveOpen(false)}
        onOk={() => batchMoveForm.submit()}
        okText={`移动 ${selected.size} 人`}
        confirmLoading={batchMoveMutation.isPending}
        destroyOnHidden
      >
        <Form form={batchMoveForm} layout="vertical" onFinish={(v) => batchMoveMutation.mutate(v)}>
          <Form.Item name="stageId" label="目标阶段" rules={[{ required: true, message: '请选择目标阶段' }]}>
            <Select
              placeholder="选择阶段"
              options={boardQuery.data?.columns.map((c) => ({ value: c.stage.id, label: c.stage.name }))}
            />
          </Form.Item>
          <Form.Item
            name="reason"
            label="回退原因（所选中含需回退的卡片时必填，未填的回退卡会失败并列入报告）"
          >
            <Input.TextArea rows={2} maxLength={200} placeholder="如：批量回退重新安排一面" />
          </Form.Item>
        </Form>
      </Modal>

      <CompareModal
        data={compareData}
        loading={compareMutation.isPending}
        onClose={() => setCompareData(null)}
      />

      <CandidateDetailDrawer candidateId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
