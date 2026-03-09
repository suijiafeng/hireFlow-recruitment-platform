import { RobotOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Button, Card, Col, Empty, Row, Select, Spin, Statistic, Tooltip, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { analyticsApi, jobsApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { FunnelStage } from '../../api/types';

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
          <Card>
            <Statistic title="招聘中职位" value={overviewQuery.data?.openJobs ?? '-'} loading={overviewQuery.isLoading} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="候选人总数" value={overviewQuery.data?.candidates ?? '-'} loading={overviewQuery.isLoading} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="待进行面试" value={overviewQuery.data?.upcomingInterviews ?? '-'} loading={overviewQuery.isLoading} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="已入职" value={overviewQuery.data?.hired ?? '-'} loading={overviewQuery.isLoading} />
          </Card>
        </Col>
      </Row>

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
