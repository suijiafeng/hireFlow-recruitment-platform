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
import { CardTitle, StatCard } from '../../components/ui';

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
    <>
      {/* 第一排：规模总览（自数据大盘迁入） */}
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <StatCard
            title="招聘中职位"
            value={overview?.openJobs ?? '-'}
            icon={<ProfileOutlined />}
            loading={overviewQuery.isLoading}
            extra={overview?.pausedJobs ? `另有 ${overview.pausedJobs} 个职位满编暂停` : undefined}
          />
        </Col>
        <Col span={6}>
          <StatCard
            title="候选人总数"
            value={overview?.candidates ?? '-'}
            icon={<TeamOutlined />}
            loading={overviewQuery.isLoading}
          />
        </Col>
        <Col span={6}>
          <StatCard
            title="待进行面试"
            value={overview?.upcomingInterviews ?? '-'}
            icon={<ScheduleOutlined />}
            loading={overviewQuery.isLoading}
          />
        </Col>
        <Col span={6}>
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
        <Col span={6}>
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
        <Col span={6}>
          <StatCard
            icon={<LikeOutlined />}
            loading={loading}
            title={<Tooltip title="接受数 ÷ 发出数">Offer 接受率</Tooltip>}
            value={data?.offer.acceptRate ?? '-'}
            suffix={data?.offer.sent ? `% · ${data.offer.accepted}/${data.offer.sent}` : undefined}
          />
        </Col>
        <Col span={6}>
          <StatCard
            icon={<WarningOutlined />}
            loading={loading}
            title={<Tooltip title="接受 Offer 后入职前退出 ÷ 接受数">毁约率</Tooltip>}
            value={data?.offer.renegeRate ?? 0}
            suffix={`% · ${data?.offer.renegeCount ?? 0} 人`}
          />
        </Col>
        <Col span={6}>
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
        <Col span={12}>
          <Card
            title={
              <CardTitle icon={<ShareAltOutlined />}>
                渠道效能
              </CardTitle>
            }
            size="small"
            loading={loading}
            classNames={{ body: 'card-body-chart' }}
          >
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
                      { color: '#86b6ef', value: c.applied, label: '投递' },
                      {
                        color: '#5598e7',
                        value: c.interviewed,
                        label: `进面${c.interviewRate != null ? `（${c.interviewRate}%）` : ''}`,
                      },
                      { color: '#2a78d6', value: c.offered, label: `Offer（接受 ${c.accepted}）` },
                      {
                        color: '#184f95',
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
        <Col span={12}>
          <Card
            title={
              <CardTitle icon={<TeamOutlined />}>
                面试官效能（通过率 / 及时率）
              </CardTitle>
            }
            size="small"
            loading={loading}
            classNames={{ body: 'card-body-chart' }}
          >
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
        <Col span={12}>
          <Card
            title={
              <Tooltip title="基于 ActivityLog 阶段变更回放计算（精确口径，非快照）">
                <span>
                  <CardTitle icon={<HourglassOutlined />}>
                    阶段停留时长（P50 → P90）
                  </CardTitle>
                </span>
              </Tooltip>
            }
            size="small"
            loading={loading}
            classNames={{ body: 'card-body-chart' }}
          >
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
                      { color: '#6da7ec', value: `${s.p50Days} 天`, label: 'P50 中位停留' },
                      { color: '#184f95', value: `${s.p90Days} 天`, label: 'P90 长尾停留' },
                      { value: s.samples, label: '样本数' },
                    ]}
                  />
                ),
              }))}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card
            title={
              <CardTitle icon={<SolutionOutlined />}>
                TTH 按职位（中位天数）
              </CardTitle>
            }
            size="small"
            loading={loading}
            classNames={{ body: 'card-body-chart' }}
          >
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
    </>
  );
}
