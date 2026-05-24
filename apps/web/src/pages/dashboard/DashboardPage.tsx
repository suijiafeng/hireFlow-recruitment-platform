import {
  CarryOutOutlined,
  FunnelPlotOutlined,
  LineChartOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Button, Card, Col, Row, Select, Spin, Tooltip, Typography } from 'antd';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import dayjs from 'dayjs';
import { analyticsApi, jobsApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { FunnelStage } from '../../api/types';
import { ChartTip, SERIES, TrendChart } from '../../components/charts';
import { EmptyBlock } from '../../components/ui';
import { useAuthStore } from '../../stores/auth';

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;

/* 漏斗条：单色系列（长度编码人数，位置编码阶段次序）；每条自带 hover 提示 */
function FunnelBar({ stage, max }: { stage: FunnelStage; max: number }) {
  const widthPct = max > 0 ? (stage.reached / max) * 100 : 0;
  const conversionText = stage.conversion != null ? `${Math.round(stage.conversion * 100)}%` : '—';
  return (
    <Tooltip
      trigger={['hover', 'focus']}
      title={
        <ChartTip
          title={stage.name}
          rows={[
            { value: stage.reached, label: '累计到达' },
            { value: stage.current, label: '当前停留' },
            ...(stage.conversion != null ? [{ value: conversionText, label: '相对上一阶段转化' }] : []),
          ]}
        />
      }
    >
      <div className="funnel-row" tabIndex={0}>
        <span className="funnel-label">{stage.name}</span>
        <div className="funnel-track">
          <div
            className="funnel-bar"
            style={cssVars({ '--w': `${widthPct}%`, '--minw': stage.reached > 0 ? '6px' : '0' })}
          />
          <span className="funnel-value">{stage.reached}</span>
        </div>
        <span className="funnel-rate">{conversionText}</span>
      </div>
    </Tooltip>
  );
}

const TODO_META = [
  { key: 'newResumes' as const, label: '待处理新简历', link: '/pipeline', hint: '停留在首个阶段的候选人' },
  { key: 'myPendingEvaluations' as const, label: '我的待提交面评', link: '/interviews', hint: '面试已过时未提交' },
  { key: 'pendingOffers' as const, label: '待审批 Offer', link: '/offers', hint: '需要用人经理审批' },
  { key: 'rejectedOffers' as const, label: '被驳回待重提', link: '/offers', hint: 'Offer 方案需修改后重新提交' },
  { key: 'offersDue' as const, label: 'Offer 到期待处理', link: '/offers', hint: '24h 内到期或已失效可续期' },
  { key: 'onboardingInProgress' as const, label: '进行中入职单', link: '/onboarding', hint: '三方清单未完成' },
  { key: 'docsNeedReview' as const, label: '材料待人工核对', link: '/onboarding', hint: '仅图片未识别字段（低置信度）' },
];

/** 待办事项聚合 To-Do Center */
function TodoCenter() {
  const navigate = useNavigate();
  const todosQuery = useQuery({ queryKey: ['todos'], queryFn: analyticsApi.todos });
  const data = todosQuery.data;
  const visible = TODO_META.filter((meta) => data?.[meta.key] !== null);
  return (
    <Card className="todo-center-card" size="small">
      <div className="section-header">
        <div className="section-title">
          <CarryOutOutlined className="section-icon" />
          <span>待办中心</span>
        </div>
      </div>
      {visible.length === 0 && !todosQuery.isLoading ? (
        <EmptyBlock minHeight={120} description="暂无待办事项" />
      ) : (
        <Row gutter={[12, 12]}>
          {visible.map((meta) => {
            const count = data?.[meta.key] ?? 0;
            return (
              <Col span={6} key={meta.key}>
                <div
                  className={count > 0 ? 'todo-tile todo-tile--hot hover-lift' : 'todo-tile hover-lift'}
                  onClick={() => navigate(meta.link)}
                >
                  <div className="todo-tile-head">
                    <span>{meta.label}</span>
                    <span className="todo-tile-count">{todosQuery.isLoading ? '…' : count}</span>
                  </div>
                  <div className="todo-tile-hint">{meta.hint}</div>
                </div>
              </Col>
            );
          })}
        </Row>
      )}
    </Card>
  );
}

/** 近 8 周投递/入职趋势（双系列折线，列命中区 Tooltip） */
function TrendCard() {
  const trendQuery = useQuery({ queryKey: ['trend'], queryFn: analyticsApi.trend });
  const points = trendQuery.data?.points ?? [];
  return (
    <Card className="trend-card u-mt-16" size="small" loading={trendQuery.isLoading}>
      <div className="section-header">
        <div className="section-title">
          <LineChartOutlined className="section-icon" />
          <span>近 8 周投递与入职趋势</span>
        </div>
      </div>
      <TrendChart
        data={points.map((p) => ({ x: p.week, values: { applied: p.applied, hired: p.hired } }))}
        series={[
          { key: 'applied', label: '新增投递', color: SERIES.blue },
          { key: 'hired', label: '入职闭环', color: SERIES.aqua },
        ]}
      />
    </Card>
  );
}

export function DashboardPage() {
  const { message } = App.useApp();
  const user = useAuthStore((s) => s.user);
  const [jobId, setJobId] = useState<string>();
  const [insight, setInsight] = useState<{ text: string; provider: string } | null>(null);

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

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '早上好';
    if (hour < 18) return '下午好';
    return '晚上好';
  };

  return (
    <div className="dashboard-page">
      {/* 欢迎头部 */}
      <div className="dashboard-welcome">
        <div className="welcome-content">
          <h1 className="welcome-title">
            {greeting()}，{user?.name || '用户'} 👋
          </h1>
          <p className="welcome-subtitle">
            今天是 {dayjs().format('YYYY年MM月DD日 dddd')}，祝你招聘顺利
          </p>
        </div>
        <div className="welcome-decoration">
          <div className="welcome-glow welcome-glow--1"></div>
          <div className="welcome-glow welcome-glow--2"></div>
        </div>
      </div>

      {/* 待办中心 */}
      <TodoCenter />

      {/* 趋势图 */}
      <TrendCard />

      <Row gutter={[16, 16]} className="u-mt-16">
        <Col span={14}>
          <Card className="funnel-card" classNames={{ body: 'card-body-chart' }}>
            <div className="section-header">
              <div className="section-title">
                <FunnelPlotOutlined className="section-icon" />
                <span>招聘漏斗</span>
              </div>
              <Select
                className="w-240"
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
            </div>
            {funnelQuery.isLoading ? (
              <div className="loading-center">
                <Spin />
              </div>
            ) : funnelQuery.data ? (
              <>
                {funnelQuery.data.stages.map((stage) => (
                  <FunnelBar key={stage.id} stage={stage} max={maxReached} />
                ))}
                <Typography.Paragraph type="secondary" className="chart-note">
                  条长 = 累计到达人数（快照口径）· 右列 = 相对上一阶段转化率 · 悬停查看明细
                </Typography.Paragraph>
              </>
            ) : (
              <EmptyBlock minHeight={220} description="暂无职位数据，创建职位后这里将展示招聘漏斗" />
            )}
          </Card>
        </Col>
        <Col span={10}>
          <Card className="ai-insight-card" classNames={{ body: 'card-body-chart' }}>
            <div className="section-header">
              <div className="section-title">
                <RobotOutlined className="section-icon" />
                <span>AI 招聘健康度诊断</span>
              </div>
              <Button
                size="small"
                type="primary"
                icon={<RobotOutlined />}
                loading={insightMutation.isPending}
                disabled={!jobId}
                onClick={() => insightMutation.mutate()}
              >
                生成诊断
              </Button>
            </div>
            {insight ? (
              <div className="ai-insight-content">
                <div className="ai-insight-text">{insight.text}</div>
                <Typography.Text type="secondary" className="u-meta ai-insight-meta">
                  来源：{insight.provider}
                  {insight.provider === 'mock' && '（规则引擎，配置 ANTHROPIC_API_KEY 启用大模型诊断）'}
                </Typography.Text>
              </div>
            ) : (
              <EmptyBlock
                minHeight={220}
                description="选择职位后点击「生成诊断」，AI 将基于漏斗数据输出瓶颈分析与建议"
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
