import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Spin, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import { analyticsApi } from '../../api';

/**
 * 数据洞察：与大盘快照漏斗互补，
 * 全部指标基于 Application 状态机事件与 ActivityLog 回放计算。
 */
export function InsightsPage() {
  const query = useQuery({ queryKey: ['insights'], queryFn: analyticsApi.insights });
  const data = query.data;

  if (query.isLoading || !data) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin tip="正在回放状态机事件计算指标…" />
        </div>
      </Card>
    );
  }

  return (
    <>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card>
            <Statistic
              title={
                <Tooltip title="Application 创建 → 入职闭环的自然日中位数（中位数抗极值）">
                  招聘周期 TTH（天）
                </Tooltip>
              }
              value={data.tth.medianDays ?? '-'}
              suffix={data.tth.hiredCount ? `· ${data.tth.hiredCount} 人样本` : undefined}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={<Tooltip title="接受数 ÷ 发出数">Offer 接受率</Tooltip>}
              value={data.offer.acceptRate ?? '-'}
              suffix={data.offer.sent ? `% · ${data.offer.accepted}/${data.offer.sent}` : undefined}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={<Tooltip title="接受 Offer 后入职前退出 ÷ 接受数">毁约率</Tooltip>}
              value={data.offer.renegeRate ?? 0}
              suffix={`% · ${data.offer.renegeCount} 人`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={<Tooltip title="全部已提交面评中「推荐/强烈推荐」占比">面评整体通过率</Tooltip>}
              value={data.overallPassRate ?? '-'}
              suffix="%"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="渠道效能" size="small">
            <Table
              size="small"
              rowKey="source"
              pagination={false}
              dataSource={data.channels}
              columns={[
                { title: '渠道', dataIndex: 'source' },
                { title: '投递', dataIndex: 'applied', width: 60 },
                { title: '进面', dataIndex: 'interviewed', width: 60 },
                { title: 'Offer', dataIndex: 'offered', width: 60 },
                { title: '入职', dataIndex: 'hired', width: 60 },
                {
                  title: '进面率',
                  dataIndex: 'interviewRate',
                  width: 80,
                  render: (v: number | null) => (v == null ? '-' : `${v}%`),
                },
                {
                  title: '入职率',
                  dataIndex: 'hireRate',
                  width: 80,
                  render: (v: number | null) => (v == null ? '-' : `${v}%`),
                },
              ]}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="面试官效能" size="small">
            <Table
              size="small"
              rowKey="name"
              pagination={false}
              dataSource={data.interviewers}
              columns={[
                { title: '面试官', dataIndex: 'name' },
                { title: '面评数', dataIndex: 'evaluations', width: 70 },
                {
                  title: (
                    <Tooltip title="面试后 24h 内提交面评的比例（SLA）">及时率</Tooltip>
                  ),
                  dataIndex: 'onTimeRate',
                  width: 80,
                  render: (v: number | null) => (v == null ? '-' : `${v}%`),
                },
                { title: '通过率', dataIndex: 'passRate', width: 80, render: (v: number | null) => `${v}%` },
                {
                  title: (
                    <Tooltip title="与全局通过率的差值：偏离过大提示评估标准需校准">偏离度</Tooltip>
                  ),
                  dataIndex: 'passRateDeviation',
                  width: 90,
                  render: (v: number | null) => {
                    if (v == null) return '-';
                    const abs = Math.abs(v);
                    const color = abs > 30 ? 'red' : abs > 15 ? 'gold' : 'default';
                    return <Tag color={color}>{v > 0 ? `+${v}` : v}%</Tag>;
                  },
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card
            title={
              <Tooltip title="基于 ActivityLog 阶段变更回放计算（精确口径，非快照）">
                阶段停留时长（P50 / P90）
              </Tooltip>
            }
            size="small"
          >
            <Table
              size="small"
              rowKey="stage"
              pagination={false}
              dataSource={data.stageStay}
              columns={[
                { title: '阶段', dataIndex: 'stage' },
                { title: '样本数', dataIndex: 'samples', width: 80 },
                {
                  title: 'P50（天）',
                  dataIndex: 'p50Days',
                  width: 100,
                  render: (v: number | null) => v ?? '-',
                },
                {
                  title: 'P90（天）',
                  dataIndex: 'p90Days',
                  width: 100,
                  render: (v: number | null) => v ?? '-',
                },
              ]}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="TTH 按职位" size="small">
            <Table
              size="small"
              rowKey="jobTitle"
              pagination={false}
              dataSource={data.tth.byJob}
              columns={[
                { title: '职位', dataIndex: 'jobTitle' },
                { title: '入职人数', dataIndex: 'hired', width: 90 },
                {
                  title: '中位周期（天）',
                  dataIndex: 'medianDays',
                  width: 120,
                  render: (v: number | null) => v ?? '-',
                },
              ]}
            />
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
              口径：Application 创建 → 入职闭环（onboarding.completed 留痕时间）。
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>
    </>
  );
}
