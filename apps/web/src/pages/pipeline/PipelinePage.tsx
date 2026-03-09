import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS } from '@hireflow/shared';
import { App, Badge, Card, Empty, Select, Space, Spin, Tag, Typography } from 'antd';
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

function DraggableCard({
  card,
  disabled,
  onOpen,
}: {
  card: BoardCard;
  disabled: boolean;
  onOpen: (candidateId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => {
        // PointerSensor 设置了 4px 启动阈值，纯点击不会触发拖拽
        if (!isDragging) onOpen(card.candidate.id);
      }}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.85 : 1,
        zIndex: isDragging ? 100 : undefined,
        position: 'relative',
        cursor: disabled ? 'pointer' : 'grab',
      }}
    >
      <Card size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: '8px 12px' } }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Typography.Text strong>{card.candidate.name}</Typography.Text>
          {card.matchScore != null && (
            <Tag color={scoreColor(card.matchScore)} style={{ marginInlineEnd: 0 }}>
              匹配 {card.matchScore}
            </Tag>
          )}
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
        background: isOver ? '#e6f4ff' : '#f5f5f5',
        borderRadius: 8,
        padding: 8,
        transition: 'background .15s',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 220px)',
      }}
    >
      <div style={{ padding: '4px 4px 10px', fontWeight: 600 }}>
        {stage.name} <Badge count={cards.length} color="#8c8c8c" style={{ marginLeft: 4 }} />
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
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

export function PipelinePage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [searchParams, setSearchParams] = useSearchParams();
  const jobId = searchParams.get('jobId') ?? '';
  const [detailId, setDetailId] = useState<string | null>(null);

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'options'],
    queryFn: () => jobsApi.list({ page: 1, pageSize: 100 }),
  });

  // 未指定职位时默认选中第一个
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
    mutationFn: (vars: { applicationId: string; stageId: string }) =>
      boardApi.moveCard(vars.applicationId, vars.stageId),
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
      message.error(extractErrorMessage(error, '移动卡片失败'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['board', jobId] }),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const canMove = hasPermission(PERMISSIONS.APPLICATION_MOVE);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const applicationId = String(active.id);
    const targetStageId = String(over.id);
    const card = boardQuery.data?.columns
      .flatMap((c) => c.applications)
      .find((a) => a.id === applicationId);
    if (!card || card.stageId === targetStageId) return;
    moveMutation.mutate({ applicationId, stageId: targetStageId });
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
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
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
        </DndContext>
      )}
      <CandidateDetailDrawer candidateId={detailId} onClose={() => setDetailId(null)} />
    </Card>
  );
}
