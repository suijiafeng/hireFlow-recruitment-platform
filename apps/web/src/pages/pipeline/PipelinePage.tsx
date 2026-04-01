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
import { PERMISSIONS, STAGE_STAY_SLA } from '@hireflow/shared';
import { App, Badge, Card, Empty, Form, Input, Modal, Select, Space, Spin, Tag, Typography } from 'antd';
import type { AxiosError } from 'axios';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { boardApi, jobsApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { BoardCard, BoardData } from '../../api/types';
import { CandidateDetailDrawer } from '../../components/CandidateDetailDrawer';
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

function scoreColor(score: number): string {
  if (score >= 85) return 'green';
  if (score >= 70) return 'blue';
  return 'default';
}

/** 阶段停留时长：超 3 天标黄、超 7 天标红 */
function StayTag({ card }: { card: BoardCard }) {
  const days = dayjs().diff(dayjs(card.stageEnteredAt), 'day');
  if (days <= 0) return null;
  const color = days > STAGE_STAY_SLA.dangerDays ? 'red' : days > STAGE_STAY_SLA.warnDays ? 'gold' : 'default';
  return (
    <Tag color={color} style={{ fontSize: 11, marginInlineEnd: 0 }}>
      停留 {days} 天
    </Tag>
  );
}

/** 卡片纯视图：列表与 DragOverlay 复用同一渲染，保证拖拽跟手且不被列容器裁剪 */
function CardView({ card, overlay = false }: { card: BoardCard; overlay?: boolean }) {
  return (
    <Card
      size="small"
      style={{
        marginBottom: 8,
        boxShadow: overlay ? '0 8px 24px rgba(15,30,70,0.18)' : undefined,
        cursor: overlay ? 'grabbing' : undefined,
      }}
      styles={{ body: { padding: '8px 12px' } }}
    >
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Text strong>{card.candidate.name}</Typography.Text>
        <Space size={4}>
          {card.matchScore != null && (
            <Tag color={scoreColor(card.matchScore)} style={{ marginInlineEnd: 0 }}>
              匹配 {card.matchScore}
            </Tag>
          )}
          <StayTag card={card} />
        </Space>
      </Space>
      <div style={{ margin: '6px 0' }}>
        {card.candidate.tags.slice(0, 3).map((tag) => (
          <Tag key={tag} style={{ fontSize: 11 }}>
            {tag}
          </Tag>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#999', display: 'flex', justifyContent: 'space-between' }}>
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
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => {
        // PointerSensor 有 4px 启动阈值，纯点击不会触发拖拽
        if (!isDragging) onOpen(card.candidate.id);
      }}
      style={{
        // 拖拽由 DragOverlay 渲染跟手浮层；原卡片仅降透明度占位（修复裁剪/异常位移）
        opacity: isDragging ? 0.3 : 1,
        cursor: disabled ? 'pointer' : 'grab',
      }}
    >
      <CardView card={card} />
    </div>
  );
}

function BoardColumnView({
  stage,
  cards,
  dragDisabled,
  onOpen,
}: {
  stage: { id: string; name: string };
  cards: BoardCard[];
  dragDisabled: boolean;
  onOpen: (candidateId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        width: 272,
        flexShrink: 0,
        background: isOver ? '#dfeeff' : '#f0f2f7',
        outline: isOver ? '2px dashed #2a78d6' : 'none',
        outlineOffset: -2,
        borderRadius: 10,
        padding: 8,
        transition: 'background .15s',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 230px)',
      }}
    >
      <div style={{ padding: '4px 4px 10px', fontWeight: 600 }}>
        {stage.name} <Badge count={cards.length} color="#8c8c8c" style={{ marginLeft: 4 }} />
      </div>
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 60 }}>
        {cards.map((card) => (
          <DraggableCard key={card.id} card={card} disabled={dragDisabled} onOpen={onOpen} />
        ))}
        {cards.length === 0 && (
          <div style={{ textAlign: 'center', color: '#bbb', fontSize: 12, padding: '24px 0' }}>
            拖拽卡片到此阶段
          </div>
        )}
      </div>
    </div>
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
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [searchParams, setSearchParams] = useSearchParams();
  const jobId = searchParams.get('jobId') ?? '';
  const [detailId, setDetailId] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);
  const [pendingRevert, setPendingRevert] = useState<PendingMove | null>(null);
  const [revertForm] = Form.useForm();

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'options'],
    queryFn: () => jobsApi.list({ page: 1, pageSize: 100 }),
  });

  useEffect(() => {
    if (!jobId && jobsQuery.data?.items.length) {
      setSearchParams({ jobId: jobsQuery.data.items[0].id }, { replace: true });
    }
  }, [jobId, jobsQuery.data, setSearchParams]);

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
    <Card
      title={
        <Space>
          招聘看板
          <Select
            style={{ width: 260 }}
            placeholder="选择职位"
            loading={jobsQuery.isLoading}
            value={jobId || undefined}
            onChange={(value) => setSearchParams({ jobId: value })}
            options={jobsQuery.data?.items.map((j) => ({
              value: j.id,
              label: `${j.title}（${j.department.name}）`,
            }))}
          />
        </Space>
      }
      extra={
        !canMove && <Typography.Text type="secondary">当前角色仅可查看，不可移动卡片</Typography.Text>
      }
    >
      {!jobId || boardQuery.isLoading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          {jobsQuery.isLoading || boardQuery.isLoading ? (
            <Spin />
          ) : (
            <Empty description="暂无职位，请先创建职位" />
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveCard(null)}
        >
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
            {boardQuery.data?.columns.map((column) => (
              <BoardColumnView
                key={column.stage.id}
                stage={column.stage}
                cards={column.applications}
                dragDisabled={!canMove}
                onOpen={setDetailId}
              />
            ))}
          </div>
          {/* 拖拽浮层：脱离列容器渲染，修复卡片被 overflow 裁剪/异常位移的问题 */}
          <DragOverlay dropAnimation={null}>
            {activeCard ? (
              <div style={{ width: 256 }}>
                <CardView card={activeCard} overlay />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

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
          <Typography.Paragraph style={{ fontSize: 13 }}>
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

      <CandidateDetailDrawer candidateId={detailId} onClose={() => setDetailId(null)} />
    </Card>
  );
}
