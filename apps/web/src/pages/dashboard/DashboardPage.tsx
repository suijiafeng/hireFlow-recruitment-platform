import {
  CheckCircleOutlined,
  ProfileOutlined,
  RobotOutlined,
  ScheduleOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Button, Card, Col, Empty, Row, Select, Spin, Statistic, Tooltip, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { analyticsApi, jobsApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { FunnelStage } from '../../api/types';

function StatCard({
  title,
  value,
  icon,
  color,
  loading,
}: {
  title: string;
  value: number | string;
  icon: ReactNode;
  color: string;
  loading: boolean;
}) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: `${color}1a`,
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <Statistic title={title} value={value} loading={loading} />
      </div>
    </Card>
  );
}

/* 漏斗条：单色系列（长度编码人数），文字用文本色而非系列色；每条自带 hover 提示 */
const SERIES_BLUE = '#2a78d6';
const INK_PRIMARY = 'rgba(0,0,0,0.88)';
const INK_SECONDARY = 'rgba(0,0,0,0.65)';
const INK_MUTED = 'rgba(0,0,0,0.45)';

function FunnelBar({ stage, max }: { stage: FunnelStage; max: number }) {
  const widthPct = max > 0 ? (stage.reached / max) * 100 : 0;
  const conversionText =
    stage.conversion != null ? `${Math.round(stage.conversion * 100)}%` : '—';
  return (
    <Tooltip
      title={`${stage.name}：当前停留 ${stage.current} 人 · 累计到达 ${stage.reached} 人${
        stage.conversion != null ? ` · 相对上一阶段转化 ${conversionText}` : ''
      }`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
        <span
          style={{
            width: 64,
            textAlign: 'right',
            fontSize: 12,
            color: INK_SECONDARY,
            flexShrink: 0,
          }}
        >
          {stage.name}
        </span>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div
            style={{
              width: `${widthPct}%`,
              minWidth: stage.reached > 0 ? 6 : 0,
              height: 20,
              background: SERIES_BLUE,
              borderRadius: '0 4px 4px 0',
              transition: 'width .3s',
            }}
          />
          <span
            style={{
              fontSize: 12,
              color: INK_PRIMARY,
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}
          >
            {stage.reached}
          </span>
        </div>
        <span style={{ width: 40, textAlign: 'right', fontSize: 12, color: INK_MUTED, flexShrink: 0 }}>
          {conversionText}
        </span>
      </div>
    </Tooltip>
  );
}

const TODO_META = [
  { key: 'newResumes' as const, label: '待处理新简历', link: '/pipeline', hint: '停留在首个阶段的候选人' },
  { key: 'myPendingEvaluations' as const, label: '我的待提交面评', link: '/interviews', hint: '面试已过时未提交' },
  { key: 'pendingOffers' as const, label: '待审批 Offer', link: '/offers', hint: '需要用人经理审批' },
  { key: 'onboardingInProgress' as const, label: '进行中入职单', link: '/onboarding', hint: '三方清单未完成' },
  { key: 'docsNeedReview' as const, label: '材料待人工核对', link: '/onboarding', hint: '仅图片未识别字段（低置信度）' },
];

/** 待办事项聚合 To-Do Center */
function TodoCenter() {
  const navigate = useNavigate();
  const todosQuery = useQuery({ queryKey: ['todos'], queryFn: analyticsApi.todos });
  const data = todosQuery.data;
  return (
    <Card title="待办中心" size="small" style={{ marginTop: 16 }}>
      <Row gutter={12}>
        {TODO_META.map((meta) => {
          const value = data?.[meta.key];
          if (value === null) return null; // 无权限项不展示（如非审批人不显示待审批 Offer）
          const count = value ?? 0;
          return (
            <Col span={6} key={meta.key}>
              <div
                onClick={() => navigate(meta.link)}
                style={{
                  border: '1px solid #eceef3',
                  borderRadius: 8,
                  padding: '10px 14px',
                  cursor: 'pointer',
                  background: count > 0 ? '#fffbf0' : '#fafafa',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13 }}>{meta.label}</span>
                  <span
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      color: count > 0 ? '#d48806' : 'rgba(0,0,0,0.45)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {todosQuery.isLoading ? '…' : count}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{meta.hint}</div>
              </div>
            </Col>
          );
        })}
      </Row>
    </Card>
  );
}

export function DashboardPage() {
  const { message } = App.useApp();
  const [jobId, setJobId] = useState<string>();
  const [insight, setInsight] = useState<{ text: string; provider: string } | null>(null);

  const overviewQuery = useQuery({ queryKey: ['analytics-overview'], queryFn: analyticsApi.overview });
  const jobsQuery = useQuery({
    queryKey: ['jobs', 'options'],
    queryFn: () => jobsApi.list({ page: 1, pageSize: 100 }),
  });

  useEffect(() => {
    if (!jobId && jobsQuery.data?.items.length) {
      setJobId(jobsQuery.data.items[0].id);
    }
  }, [jobId, jobsQuery.data]);

  const funnelQuery = useQuery({
    queryKey: ['funnel', jobId],
    queryFn: () => analyticsApi.funnel(jobId!),
    enabled: Boolean(jobId),
  });

  const insightMutation = useMutation({
    mutationFn: () => analyticsApi.insight(jobId!),
    onSuccess: (data) => setInsight({ text: data.insight, provider: data.aiMeta.provider }),
    onError: (error) => message.error(extractErrorMessage(error, '诊断失败')),
  });

  const maxReached = Math.max(...(funnelQuery.data?.stages.map((s) => s.reached) ?? [0]), 1);

  return (
    <div>
      <Row gutter={16}>
        <Col span={6}>
          <StatCard
            title="招聘中职位"
            value={overviewQuery.data?.openJobs ?? '-'}
            icon={<ProfileOutlined />}
            color="#2a78d6"
            loading={overviewQuery.isLoading}
          />
        </Col>
        <Col span={6}>
          <StatCard
            title="候选人总数"
            value={overviewQuery.data?.candidates ?? '-'}
            icon={<TeamOutlined />}
            color="#1baf7a"
            loading={overviewQuery.isLoading}
          />
        </Col>
        <Col span={6}>
          <StatCard
            title="待进行面试"
            value={overviewQuery.data?.upcomingInterviews ?? '-'}
            icon={<ScheduleOutlined />}
            color="#eda100"
            loading={overviewQuery.isLoading}
          />
        </Col>
        <Col span={6}>
          <StatCard
            title="已入职"
            value={overviewQuery.data?.hired ?? '-'}
            icon={<CheckCircleOutlined />}
            color="#4a3aa7"
            loading={overviewQuery.isLoading}
          />
        </Col>
      </Row>

      <TodoCenter />

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={14}>
          <Card
            title="招聘漏斗"
            extra={
              <Select
                style={{ width: 240 }}
                placeholder="选择职位"
                loading={jobsQuery.isLoading}
                value={jobId}
                onChange={(v) => {
                  setJobId(v);
                  setInsight(null);
                }}
                options={jobsQuery.data?.items.map((j) => ({
                  value: j.id,
                  label: `${j.title}（${j.department.name}）`,
                }))}
              />
            }
          >
            {funnelQuery.isLoading ? (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <Spin />
              </div>
            ) : funnelQuery.data ? (
              <>
                {funnelQuery.data.stages.map((stage) => (
                  <FunnelBar key={stage.id} stage={stage} max={maxReached} />
                ))}
                <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
                  条长 = 累计到达人数（快照口径）· 右列 = 相对上一阶段转化率 · 悬停查看明细
                </Typography.Paragraph>
              </>
            ) : (
              <Empty description="暂无职位数据" />
            )}
          </Card>
        </Col>
        <Col span={10}>
          <Card
            title="AI 招聘健康度诊断"
            extra={
              <Button
                size="small"
                icon={<RobotOutlined />}
                loading={insightMutation.isPending}
                disabled={!jobId}
                onClick={() => insightMutation.mutate()}
              >
                生成诊断
              </Button>
            }
          >
            {insight ? (
              <>
                <Typography.Paragraph style={{ fontSize: 13 }}>{insight.text}</Typography.Paragraph>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  来源：{insight.provider}
                  {insight.provider === 'mock' && '（规则引擎，配置 ANTHROPIC_API_KEY 启用大模型诊断）'}
                </Typography.Text>
              </>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="选择职位后点击「生成诊断」，AI 将基于漏斗数据输出瓶颈分析与建议"
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
