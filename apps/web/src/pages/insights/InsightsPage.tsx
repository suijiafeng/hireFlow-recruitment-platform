import {
  CheckCircleOutlined,
  FieldTimeOutlined,
  HourglassOutlined,
  LikeOutlined,
  ProfileOutlined,
  ScheduleOutlined,
  ShareAltOutlined,
  SolutionOutlined,
  TeamOutlined,
  UserAddOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Tooltip, Typography } from 'antd';
import { analyticsApi } from '../../api';
import {
  ChartTip,
  DumbbellChart,
  GroupedBarChart,
  LollipopChart,
  NestedBarChart,
  SERIES,
} from '../../components/charts';
import { StatCard } from '../../components/ui';

const CHANNEL_STAGES = ['投递', '进面', 'Offer', '入职'];

/**
 * 数据洞察：与大盘快照漏斗互补，
 * 全部指标基于 Application 状态机事件与 ActivityLog 回放计算；
 * 趋势/对比类数据以图表呈现，精确数值在悬停 Tooltip 与直接标签中。
 */
export function InsightsPage() {
  const query = useQuery({ queryKey: ['insights'], queryFn: analyticsApi.insights });
  const overviewQuery = useQuery({ queryKey: ['analytics-overview'], queryFn: analyticsApi.overview });
  const data = query.data;
  const loading = query.isLoading;
  const overview = overviewQuery.data;

  return (
    <div className="insights-page">
      {/* 页面头部 */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">数据洞察</h1>
          <p className="page-header-subtitle">基于招聘全流程数据的多维度分析，辅助招聘决策</p>
        </div>
      </div>

      {/* 第一排：规模总览 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={8} xl={6}>
          <StatCard
            title="招聘中职位"
            value={overview?.openJobs ?? '-'}
            icon={<ProfileOutlined />}
            loading={overviewQuery.isLoading}
            extra={overview?.pausedJobs ? `另有 ${overview.pausedJobs} 个职位满编暂停` : undefined}
          />
        </Col>
        <Col xs={12} lg={8} xl={6}>
          <StatCard
            title="候选人总数"
            value={overview?.candidates ?? '-'}
            icon={<TeamOutlined />}
            loading={overviewQuery.isLoading}
          />
        </Col>
        <Col xs={12} lg={8} xl={6}>
          <StatCard
            title="待进行面试"
            value={overview?.upcomingInterviews ?? '-'}
            icon={<ScheduleOutlined />}
            loading={overviewQuery.isLoading}
          />
        </Col>
        <Col xs={12} lg={8} xl={6}>
          <StatCard
            title="已入职"
            value={overview?.hired ?? '-'}
            icon={<UserAddOutlined />}
            loading={overviewQuery.isLoading}
          />
        </Col>
      </Row>

      {/* 第二排：效率与质量指标 */}
      <Row gutter={[16, 16]} className="u-mt-16">
        <Col xs={12} lg={8} xl={6}>
          <StatCard
            icon={<FieldTimeOutlined />}
            loading={loading}
            title={
              <Tooltip title="Application 创建 → 入职闭环的自然日中位数（中位数抗极值）">
                招聘周期 TTH（天）
              </Tooltip>
            }
            value={data?.tth.medianDays ?? '-'}
            suffix={data?.tth.hiredCount ? `· ${data.tth.hiredCount} 人样本` : undefined}
          />
        </Col>
        <Col xs={12} lg={8} xl={6}>
          <StatCard
            icon={<LikeOutlined />}
            loading={loading}
            title={<Tooltip title="接受数 ÷ 发出数">Offer 接受率</Tooltip>}
            value={data?.offer.acceptRate ?? '-'}
            suffix={data?.offer.sent ? `% · ${data.offer.accepted}/${data.offer.sent}` : undefined}
          />
        </Col>
        <Col xs={12} lg={8} xl={6}>
          <StatCard
            icon={<WarningOutlined />}
            loading={loading}
            title={<Tooltip title="接受 Offer 后入职前退出 ÷ 接受数">毁约率</Tooltip>}
            value={data?.offer.renegeRate ?? 0}
            suffix={`% · ${data?.offer.renegeCount ?? 0} 人`}
          />
        </Col>
        <Col xs={12} lg={8} xl={6}>
          <StatCard
            icon={<CheckCircleOutlined />}
            loading={loading}
            title={<Tooltip title="全部已提交面评中「推荐/强烈推荐」占比">面评整体通过率</Tooltip>}
            value={data?.overallPassRate ?? '-'}
            suffix="%"
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="u-mt-16">
        <Col xs={24} xl={12}>
          <Card className="chart-card" size="small" loading={loading} classNames={{ body: 'card-body-chart' }}>
            <div className="section-header">
              <div className="section-title">
                <ShareAltOutlined className="section-icon" />
                <span>渠道效能</span>
              </div>
            </div>
            <NestedBarChart
              stages={CHANNEL_STAGES}
              emptyText="暂无投递数据，录入候选人后自动统计"
              data={(data?.channels ?? []).map((c) => ({
                label: c.source,
                values: [c.applied, c.interviewed, c.offered, c.hired],
                meta: c.hireRate != null ? `入职 ${c.hireRate}%` : undefined,
                tip: (
                  <ChartTip
                    title={c.source}
                    rows={[
                      { color: '#60A5FA', value: c.applied, label: '投递' },
                      {
                        color: '#3B82F6',
                        value: c.interviewed,
                        label: `进面${c.interviewRate != null ? `（${c.interviewRate}%）` : ''}`,
                      },
                      { color: '#2563EB', value: c.offered, label: `Offer（接受 ${c.accepted}）` },
                      {
                        color: '#1E40AF',
                        value: c.hired,
                        label: `入职${c.hireRate != null ? `（${c.hireRate}%）` : ''}`,
                      },
                    ]}
                  />
                ),
              }))}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card className="chart-card" size="small" loading={loading} classNames={{ body: 'card-body-chart' }}>
            <div className="section-header">
              <div className="section-title">
                <TeamOutlined className="section-icon" />
                <span>面试官效能（通过率 / 及时率）</span>
              </div>
            </div>
            <GroupedBarChart
              unit="%"
              max={100}
              refValue={data?.overallPassRate}
              refLabel="全局通过率"
              emptyText="暂无已提交的面评"
              series={[
                { key: 'passRate', label: '通过率', color: SERIES.blue },
                { key: 'onTimeRate', label: '24h 及时率', color: SERIES.aqua },
              ]}
              data={(data?.interviewers ?? []).map((i) => ({
                label: i.name,
                values: { passRate: i.passRate, onTimeRate: i.onTimeRate },
                tip: (
                  <ChartTip
                    title={i.name}
                    rows={[
                      { value: i.evaluations, label: '面评数' },
                      { color: SERIES.blue, value: i.passRate != null ? `${i.passRate}%` : '-', label: '通过率' },
                      { color: SERIES.aqua, value: i.onTimeRate != null ? `${i.onTimeRate}%` : '-', label: '24h 及时率' },
                      {
                        value:
                          i.passRateDeviation != null
                            ? `${i.passRateDeviation > 0 ? '+' : ''}${i.passRateDeviation}%`
                            : '-',
                        label: '相对全局通过率偏离',
                      },
                    ]}
                  />
                ),
              }))}
            />
            <Typography.Paragraph type="secondary" className="chart-note">
              竖刻度 = 全局通过率基线；通过率明显偏离基线提示评估标准需校准
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="u-mt-16">
        <Col xs={24} xl={12}>
          <Card className="chart-card" size="small" loading={loading} classNames={{ body: 'card-body-chart' }}>
            <div className="section-header">
              <Tooltip title="基于 ActivityLog 阶段变更回放计算（精确口径，非快照）">
                <div className="section-title">
                  <HourglassOutlined className="section-icon" />
                  <span>阶段停留时长（P50 → P90）</span>
                </div>
              </Tooltip>
            </div>
            <DumbbellChart
              unit=" 天"
              rangeLabels={['P50 中位', 'P90 长尾']}
              emptyText="暂无阶段流转记录"
              data={(data?.stageStay ?? []).map((s) => ({
                label: s.stage,
                low: s.p50Days,
                high: s.p90Days,
                tip: (
                  <ChartTip
                    title={s.stage}
                    rows={[
                      { color: '#60A5FA', value: `${s.p50Days} 天`, label: 'P50 中位停留' },
                      { color: '#1E40AF', value: `${s.p90Days} 天`, label: 'P90 长尾停留' },
                      { value: s.samples, label: '样本数' },
                    ]}
                  />
                ),
              }))}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card className="chart-card" size="small" loading={loading} classNames={{ body: 'card-body-chart' }}>
            <div className="section-header">
              <div className="section-title">
                <SolutionOutlined className="section-icon" />
                <span>TTH 按职位（中位天数）</span>
              </div>
            </div>
            <LollipopChart
              unit=" 天"
              emptyText="暂无入职闭环样本"
              data={(data?.tth.byJob ?? []).map((j) => ({
                label: j.jobTitle,
                value: j.medianDays,
                meta: `${j.hired} 人样本`,
                tip: (
                  <ChartTip
                    title={j.jobTitle}
                    rows={[
                      { value: `${j.medianDays} 天`, label: '中位招聘周期' },
                      { value: j.hired, label: '入职人数样本' },
                    ]}
                  />
                ),
              }))}
            />
            <Typography.Paragraph type="secondary" className="chart-note">
              口径：Application 创建 → 入职闭环（onboarding.completed 留痕时间）
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
