import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClockCircleOutlined, PlusOutlined, ScheduleOutlined } from '@ant-design/icons';
import { EVALUATION_CONCLUSION_LABEL, PERMISSIONS, type EvaluationConclusion } from '@hireflow/shared';
import { App, Button, DatePicker, Form, Modal, Select, Spin, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { interviewsApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { Interview } from '../../api/types';
import { CandidateDetailDrawer } from '../../components/CandidateDetailDrawer';
import { EvaluationModal } from '../../components/EvaluationModal';
import { useSyncedTableScroll } from '../../hooks/useSyncedTableScroll';
import { useAuthStore } from '../../stores/auth';

/** 15 分钟一档的全天时间选项 */
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const value = `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`;
  return { value, label: value };
});

const CONCLUSION_SHORT: Record<string, { text: string; cls: string }> = {
  STRONG_YES: { text: '强推', cls: 'hf-tag hf-tag--ok' },
  YES: { text: '推荐', cls: 'hf-tag hf-tag--ok' },
  NO: { text: '不推', cls: 'hf-tag hf-tag--warn' },
  STRONG_NO: { text: '强烈不推', cls: 'hf-tag hf-tag--err' },
};

/** 相对今天的自然语言日签 */
function dayLabel(date: string) {
  const d = dayjs(date);
  const diff = d.startOf('day').diff(dayjs().startOf('day'), 'day');
  if (diff === 0) return { text: '今天', today: true };
  if (diff === 1) return { text: '明天', today: false };
  if (diff === -1) return { text: '昨天', today: false };
  return { text: d.format('ddd'), today: false };
}

/** 右栏：我的可约时段。按日分组，标注「N / M 可约」，取代横向 Tag 云 */
function SlotsRail() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form] = Form.useForm<{ date: Dayjs; startTime: string; endTime: string }>();
  const startTime = Form.useWatch('startTime', form);

  const slotsQuery = useQuery({ queryKey: ['my-slots'], queryFn: interviewsApi.mySlots });

  const addMutation = useMutation({
    mutationFn: (range: [Dayjs, Dayjs]) => interviewsApi.addSlot(range[0].toISOString(), range[1].toISOString()),
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

  const slots = slotsQuery.data ?? [];
  const groups: Array<{ key: string; items: typeof slots }> = [];
  slots
    .slice()
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .forEach((s) => {
      const key = dayjs(s.startAt).format('MM-DD');
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(s);
      else groups.push({ key, items: [s] });
    });

  return (
    <div className="hf-panel hf-panel--grow">
      <div className="hf-panel-head">
        <span className="hf-panel-title">我的可约时段</span>
        <Button size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          添加
        </Button>
      </div>
      {/* .hf-notice 是 flex 容器：裸文本与 <b> 会各自成为 flex item 把句子拆开，
          必须包一个 span 让整句作为单个 flex item 正常流动 */}
      <div className="hf-notice hf-notice--flat">
        <span>
          候选人自助选时链接只会展示<b>未被预约</b>的档期。
        </span>
      </div>
      <div className="hf-panel-body">
        {slotsQuery.isLoading ? (
          <Spin size="small" />
        ) : groups.length === 0 ? (
          <Typography.Text type="secondary" className="hf-muted">
            尚未维护空闲时段。添加后，HR 发出的「候选人自助选时」链接将展示你的空闲档。
          </Typography.Text>
        ) : (
          groups.map((g) => {
            const free = g.items.filter((s) => !s.bookedBy).length;
            return (
              <div key={g.key} className="u-mb-16">
                <div className="u-flex-between u-mb-4">
                  <span className="u-flex-gap-8">
                    <span className="hf-group-title hf-td--num">{g.key}</span>
                    <span className="hf-faint">{dayLabel(g.items[0].startAt).text}</span>
                  </span>
                  <span className="hf-faint hf-td--num">
                    {free} / {g.items.length} 可约
                  </span>
                </div>
                {g.items.map((s) => (
                  <div
                    key={s.id}
                    className={s.bookedBy ? 'hf-opt hf-opt--off' : 'hf-opt'}
                    onClick={() => {
                      if (!s.bookedBy) removeMutation.mutate(s.id);
                    }}
                    title={s.bookedBy ? '已被预约，不可删除' : '点击删除该时段'}
                  >
                    <span className="hf-td--num">
                      {dayjs(s.startAt).format('HH:mm')} – {dayjs(s.endAt).format('HH:mm')}
                    </span>
                    <span className="u-flex-1" />
                    {s.bookedBy ? (
                      <span className="hf-faint" onClick={(e) => e.stopPropagation()}>
                        {s.bookedBy} 已约
                      </span>
                    ) : (
                      <span className="hf-link" onClick={(e) => e.stopPropagation()}>
                        可约
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>

      <Modal
        className="hf-modal"
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
            addMutation.mutate([
              v.date.hour(h1).minute(m1).second(0).millisecond(0),
              v.date.hour(h2).minute(m2).second(0).millisecond(0),
            ]);
          }}
        >
          <Form.Item name="date" label="日期" rules={[{ required: true, message: '请选择日期' }]}>
            <DatePicker minDate={dayjs()} className="w-160" />
          </Form.Item>
          <div className="u-flex-gap-12">
            <Form.Item
              name="startTime"
              label="开始时间"
              rules={[{ required: true, message: '请选择开始时间' }]}
              className="u-flex-1"
            >
              <Select
                showSearch
                placeholder="00:00"
                options={TIME_OPTIONS}
                onChange={() => form.setFieldValue('endTime', undefined)}
              />
            </Form.Item>
            <Form.Item
              name="endTime"
              label="结束时间"
              rules={[{ required: true, message: '请选择结束时间' }]}
              className="u-flex-1"
            >
              <Select
                showSearch
                placeholder="00:00"
                disabled={!startTime}
                options={TIME_OPTIONS.filter((t) => !startTime || t.value > startTime)}
              />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

type Filter = 'all' | 'mine' | 'pending';

export function InterviewsPage() {
  const { message, modal } = App.useApp();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [evaluateFor, setEvaluateFor] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const interviewsQuery = useQuery({ queryKey: ['interviews', 'all'], queryFn: () => interviewsApi.list() });

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

  const all = interviewsQuery.data ?? [];
  const needsMyEval = (iv: Interview) =>
    iv.status === 'COMPLETED' &&
    iv.interviewers.some((i) => i.user.id === currentUserId) &&
    !iv.evaluations.some((ev) => ev.interviewer.id === currentUserId);

  const upcoming = all.filter((iv) => iv.status === 'SCHEDULED').length;
  const pendingCount = all.filter((iv) => !iv.scheduledAt).length;
  const myEvalCount = all.filter(needsMyEval).length;

  const visible = all.filter((iv) => {
    if (filter === 'pending') return !iv.scheduledAt;
    if (filter === 'mine') return needsMyEval(iv);
    return true;
  });

  /** 按日分组：待安排单独成组排最上，其余按时间正序 */
  const noDate = visible.filter((iv) => !iv.scheduledAt);
  const dated = visible.filter((iv) => iv.scheduledAt).sort((a, b) => (a.scheduledAt! > b.scheduledAt! ? 1 : -1));
  const dayGroups: Array<{ key: string; label: string; today: boolean; items: Interview[] }> = [];
  dated.forEach((iv) => {
    const key = dayjs(iv.scheduledAt!).format('MM-DD');
    const last = dayGroups[dayGroups.length - 1];
    if (last && last.key === key) last.items.push(iv);
    else {
      const l = dayLabel(iv.scheduledAt!);
      dayGroups.push({ key, label: l.text, today: l.today, items: [iv] });
    }
  });
  const groups = [...(noDate.length ? [{ key: '待安排', label: '', today: false, items: noDate }] : []), ...dayGroups];

  /** 各分组的横向滚动串在一起，表头才能只留首组一行 */
  const groupListRef = useSyncedTableScroll<HTMLDivElement>();

  /** 所有分组共用同一套列定义，宽度写死，各组之间才对得齐 */
  const IV_TABLE_X = 820;
  const ivColumns: TableProps<Interview>['columns'] = [
    {
      title: '时间',
      key: 'time',
      width: 60,
      render: (_, iv) => (
        <span className="hf-primary hf-primary--sm hf-td--num">
          {iv.scheduledAt ? dayjs(iv.scheduledAt).format('HH:mm') : '—'}
        </span>
      ),
    },
    {
      title: '',
      key: 'dot',
      width: 20,
      render: (_, iv) => {
        const pending = !iv.scheduledAt;
        const done = iv.status === 'COMPLETED';
        return (
          <span className="u-flex-center">
            <span className={pending ? 'hf-dot hf-dot--warn' : done ? 'hf-dot hf-dot--off' : 'hf-dot hf-dot--on'} />
          </span>
        );
      },
    },
    {
      title: '候选人',
      key: 'candidate',
      width: 150,
      ellipsis: true,
      onCell: (iv) => ({ title: iv.application?.candidate.name ?? '' }),
      render: (_, iv) => (
        <span className="hf-primary hf-primary--sm">{iv.application?.candidate.name ?? '—'}</span>
      ),
    },
    {
      title: '职位',
      key: 'job',
      width: 200,
      onCell: (iv) => ({ title: `${iv.application?.job.title ?? '—'} · 第 ${iv.round} 轮` }),
      render: (_, iv) => (
        <span className="u-flex-gap-8">
          <span className="hf-secondary hf-ellipsis">{iv.application?.job.title ?? '—'}</span>
          <span className="hf-faint">第 {iv.round} 轮</span>
        </span>
      ),
    },
    {
      title: '面试官',
      key: 'interviewers',
      width: 180,
      ellipsis: true,
      onCell: (iv) => ({ title: iv.interviewers.map((i) => i.user.name).join('、') }),
      render: (_, iv) => (
        <span className="hf-secondary">{iv.interviewers.map((i) => i.user.name).join('、') || '—'}</span>
      ),
    },
    {
      // 面评：结论缩为短标；未提交时按状态给不同弱化文案
      title: '面评',
      key: 'eval',
      width: 120,
      render: (_, iv) => {
        const evals = iv.evaluations.filter((ev) => ev.conclusion);
        if (evals.length === 0) {
          const pending = !iv.scheduledAt;
          const done = iv.status === 'COMPLETED';
          const mineTodo = needsMyEval(iv);
          return (
            <span className={mineTodo ? 'hf-faint hf-state--warn' : 'hf-faint'}>
              {pending ? '未安排' : done ? '待面评' : '面试后提交'}
            </span>
          );
        }
        return (
          <span className="u-flex-gap-6">
            {evals.map((ev) => {
              const c = CONCLUSION_SHORT[ev.conclusion!] ?? {
                text: EVALUATION_CONCLUSION_LABEL[ev.conclusion as EvaluationConclusion],
                cls: 'hf-tag',
              };
              return (
                <span key={ev.id} className={c.cls} title={`${ev.interviewer.name}：${c.text}`}>
                  {c.text}
                </span>
              );
            })}
          </span>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      align: 'right',
      fixed: 'right',
      render: (_, iv) => {
        const pending = !iv.scheduledAt;
        const done = iv.status === 'COMPLETED';
        const mineTodo = needsMyEval(iv);
        if (pending && hasPermission(PERMISSIONS.INTERVIEW_SCHEDULE))
          return (
            <span
              className="hf-link"
              onClick={(e) => {
                e.stopPropagation();
                void copySelfScheduleLink(iv.id);
              }}
            >
              选时链接
            </span>
          );
        if ((done || mineTodo) && hasPermission(PERMISSIONS.EVALUATION_SUBMIT))
          return (
            <span
              className="hf-link"
              onClick={(e) => {
                e.stopPropagation();
                setEvaluateFor(iv.id);
              }}
            >
              提交面评
            </span>
          );
        return <span className="hf-link">详情</span>;
      },
    },
  ];

  return (
    <div className="hf-page">
      {/* 控制栏：分段筛选 + 概览计数 */}
      <div className="hf-bar">
        <div className="hf-bar-left">
          <div className="hf-seg">
            <span className={filter === 'all' ? 'hf-seg--on' : undefined} onClick={() => setFilter('all')}>
              全部
            </span>
            <span className={filter === 'mine' ? 'hf-seg--on' : undefined} onClick={() => setFilter('mine')}>
              待我面评
            </span>
            <span className={filter === 'pending' ? 'hf-seg--on' : undefined} onClick={() => setFilter('pending')}>
              待安排
            </span>
          </div>
          <div className="hf-summary">
            <span>
              待进行 <b>{upcoming}</b> 场
            </span>
            <span className="sep" />
            <span className="warn">
              <ClockCircleOutlined />
              待我面评 <b>{myEvalCount}</b>
            </span>
            <span className="sep" />
            <span>
              待安排 <b>{pendingCount}</b>
            </span>
          </div>
        </div>
      </div>

      <div className="hf-body">
        <div className="hf-cols">
          {interviewsQuery.isLoading ? (
            <div className="hf-state-block">
              <Spin />
            </div>
          ) : groups.length === 0 ? (
            <div className="hf-state-block">
              <div className="hf-state-icon">
                <ScheduleOutlined />
              </div>
              <div>
                <div className="hf-state-title">{filter === 'all' ? '还没有面试安排' : '没有符合条件的面试'}</div>
                <div className="hf-state-desc">
                  {filter === 'all'
                    ? '在候选人详情里点「安排面试」，或把卡片拖到面试阶段，面试会自动出现在这里。'
                    : '切回「全部」查看所有面试。'}
                </div>
              </div>
            </div>
          ) : (
            /* 按日分组：每组一张独立的 Table。
               各组本是彼此独立的横向滚动容器，useSyncedTableScroll 把它们的 scrollLeft 串起来，
               于是表头只需首组保留一行——任何一组横滚，首组表头随其表体一起走，列不会错位。 */
            <div className="hf-agroup-list" ref={groupListRef}>
              {groups.map((g, gi) => (
                <div key={g.key} className="hf-agroup-item">
                  <div className="hf-group-head">
                    <span className="hf-group-title hf-td--num">{g.key}</span>
                    {g.label && (
                      <span className={g.today ? 'hf-group-badge hf-group-badge--today' : 'hf-group-badge'}>
                        {g.label}
                      </span>
                    )}
                    <span className="hf-group-count">{g.items.length} 场</span>
                  </div>
                  <div className="hf-atable hf-atable--fit">
                    <Table<Interview>
                      columns={ivColumns}
                      dataSource={g.items}
                      rowKey="id"
                      pagination={false}
                      showHeader={gi === 0}
                      scroll={{ x: IV_TABLE_X }}
                      rowClassName={(iv) => (!iv.scheduledAt ? 'hf-row--todo' : '')}
                      onRow={(iv) => ({
                        onClick: () => iv.application && setDetailId(iv.application.candidate.id),
                      })}
                    />
                  </div>
                </div>
              ))}
              <div className="hf-panel-foot hf-panel-foot--tight">
                <span>
                  待进行 {upcoming} 场 · 共 {all.length} 场面试
                </span>
              </div>
            </div>
          )}

          <div className="hf-rail hf-rail--narrow">
            <SlotsRail />
          </div>
        </div>
      </div>

      <EvaluationModal
        interviewId={evaluateFor}
        dimensions={all.find((i) => i.id === evaluateFor)?.application?.job.scorecardTemplate?.map((t) => t.dimension)}
        onClose={() => setEvaluateFor(null)}
      />
      <CandidateDetailDrawer candidateId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
