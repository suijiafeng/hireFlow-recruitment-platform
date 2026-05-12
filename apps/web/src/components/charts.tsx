import { Tooltip } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { EmptyBlock } from './ui';

/**
 * 图表组件库（dataviz 规范实现，样式见 styles/charts.css）：
 * - 颜色全部来自 validate_palette.js 校验通过的色板（禁止目测新增）
 * - 悬停层默认内建：条/点悬停提示，折线为列命中区 + 十字准线
 * - 空数据 → EmptyBlock 占位；条目过多 → 固定高度内滚 + 总数说明
 */

/** 分类系列色（categorical slot 1/2，白底校验 PASS；aqua 2.82:1 需直接标签补偿） */
export const SERIES = { blue: '#2a78d6', aqua: '#1baf7a' } as const;
/** 有序四级阶梯（浅→深，--ordinal 校验 PASS）：投递 → 进面 → Offer → 入职 */
export const ORDINAL_BLUE_4 = ['#86b6ef', '#5598e7', '#2a78d6', '#184f95'] as const;
/** 哑铃两档（同色系两级，--ordinal 校验 PASS） */
export const DUMBBELL = { p50: '#6da7ec', p90: '#184f95' } as const;
/** 基线刻度用墨色（参考标记不占用系列色） */
const REF_INK = 'rgba(0, 0, 0, 0.45)';

/** 数据驱动的值仅以 CSS 变量传入（静态样式一律走 class） */
const cssVars = (v: Record<string, string | number>) => v as CSSProperties;

const TIP_TRIGGER: Array<'hover' | 'focus'> = ['hover', 'focus'];

/** Tooltip 内容：数值为主、系列名为辅，短色条作系列键 */
export function ChartTip({
  title,
  rows,
}: {
  title: ReactNode;
  rows: Array<{ color?: string; value: ReactNode; label: ReactNode }>;
}) {
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="chart-tip-row">
          {r.color && <span className="chart-tip-key" style={cssVars({ '--c': r.color })} />}
          <span className="chart-tip-value">{r.value}</span>
          <span className="chart-tip-label">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ items, mark }: { items: Array<{ label: string; color: string }>; mark: 'rect' | 'line' | 'dot' }) {
  const markClass = { rect: 'chart-swatch', line: 'chart-linekey', dot: 'chart-dotkey' }[mark];
  return (
    <div className="chart-legend">
      {items.map((it) => (
        <span key={it.label} className="chart-legend-item">
          <span className={markClass} style={cssVars({ '--c': it.color })} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function RowsWrap({ count, maxVisible, children }: { count: number; maxVisible: number; children: ReactNode }) {
  const scroll = count > maxVisible;
  return (
    <>
      <div className={scroll ? 'chart-rows chart-rows--scroll' : 'chart-rows'}>{children}</div>
      {scroll && <div className="chart-caption">共 {count} 项 · 滚动查看全部</div>}
    </>
  );
}

/** 棒棒糖图（名义类目比较：针杆 + 端点圆点，零值/小数值依然可见） */
export function LollipopChart({
  data,
  unit = '',
  color = SERIES.blue,
  maxVisible = 8,
  emptyText = '暂无数据',
}: {
  data: Array<{ label: string; value: number | null; meta?: string; tip?: ReactNode }>;
  unit?: string;
  color?: string;
  maxVisible?: number;
  emptyText?: string;
}) {
  const rows = data.filter((d) => d.value != null);
  if (rows.length === 0) return <EmptyBlock minHeight={200} description={emptyText} />;
  const max = Math.max(...rows.map((r) => r.value ?? 0), 1) * 1.08;
  return (
    <div className="chart">
      <RowsWrap count={rows.length} maxVisible={maxVisible}>
        {rows.map((r) => (
          <Tooltip key={r.label} title={r.tip} trigger={TIP_TRIGGER}>
            <div className="chart-row" tabIndex={0}>
              <span className="chart-row-label">{r.label}</span>
              <div className="chart-row-plot">
                <div className="chart-lolli" style={cssVars({ '--x': `${((r.value ?? 0) / max) * 100}%`, '--c': color })}>
                  <span className="chart-lolli-track" />
                  <span className="chart-lolli-stem" />
                  <span className="chart-lolli-dot" />
                </div>
                <span className="chart-row-value">
                  {r.value}
                  {unit}
                </span>
                {r.meta && <span className="chart-row-meta">{r.meta}</span>}
              </div>
            </div>
          </Tooltip>
        ))}
      </RowsWrap>
    </div>
  );
}

/** 嵌套条形图（有序阶段子集：外层最浅、逐层收窄加深，2px 表面环分隔） */
export function NestedBarChart({
  data,
  stages,
  colors = ORDINAL_BLUE_4,
  maxVisible = 6,
  emptyText = '暂无数据',
}: {
  data: Array<{ label: string; values: number[]; meta?: string; tip?: ReactNode }>;
  stages: string[];
  colors?: readonly string[];
  maxVisible?: number;
  emptyText?: string;
}) {
  if (data.length === 0) return <EmptyBlock minHeight={200} description={emptyText} />;
  const max = Math.max(...data.map((d) => d.values[0] ?? 0), 1);
  return (
    <div className="chart">
      <Legend items={stages.map((s, i) => ({ label: s, color: colors[i] }))} mark="rect" />
      <RowsWrap count={data.length} maxVisible={maxVisible}>
        {data.map((d) => (
          <Tooltip key={d.label} title={d.tip} trigger={TIP_TRIGGER}>
            <div className="chart-row" tabIndex={0}>
              <span className="chart-row-label">{d.label}</span>
              <div className="chart-row-plot">
                <div className="chart-nest">
                  {d.values.map((v, i) => (
                    <div
                      key={i}
                      className="chart-nest-bar"
                      style={cssVars({ '--w': `${(v / max) * 100}%`, '--c': colors[i] })}
                    />
                  ))}
                </div>
                <span className="chart-row-value">{d.values[0]}</span>
                {d.meta && <span className="chart-row-meta">{d.meta}</span>}
              </div>
            </div>
          </Tooltip>
        ))}
      </RowsWrap>
    </div>
  );
}

/** 分组条形图（每行多系列同轴对比 + 可选基线刻度，如通过率/及时率 vs 全局基线） */
export function GroupedBarChart({
  data,
  series,
  unit = '',
  max: fixedMax,
  refValue,
  refLabel,
  maxVisible = 5,
  emptyText = '暂无数据',
}: {
  data: Array<{ label: string; values: Record<string, number | null>; tip?: ReactNode }>;
  series: Array<{ key: string; label: string; color: string }>;
  unit?: string;
  /** 固定坐标上限（比率类图传 100），缺省按数据自适应 */
  max?: number;
  /** 基线刻度（如全局均值），墨色竖刻度贯穿每行 */
  refValue?: number | null;
  refLabel?: string;
  maxVisible?: number;
  emptyText?: string;
}) {
  if (data.length === 0) return <EmptyBlock minHeight={200} description={emptyText} />;
  const max =
    fixedMax ??
    Math.max(...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)), refValue ?? 0, 1);
  const X = (v: number | null) => `${(Math.max(v ?? 0, 0) / max) * 100}%`;
  return (
    <div className="chart">
      <Legend
        items={[
          ...series.map((s) => ({ label: s.label, color: s.color })),
          ...(refValue != null && refLabel ? [{ label: `${refLabel} ${refValue}${unit}`, color: REF_INK }] : []),
        ]}
        mark="rect"
      />
      <RowsWrap count={data.length} maxVisible={maxVisible}>
        {data.map((d) => (
          <Tooltip key={d.label} title={d.tip} trigger={TIP_TRIGGER}>
            <div className="chart-row chart-row--group" tabIndex={0}>
              <span className="chart-row-label">{d.label}</span>
              <div className="chart-group-track">
                {series.map((s) => (
                  <div
                    key={s.key}
                    className="chart-gbar"
                    style={cssVars({ '--w': X(d.values[s.key]), '--c': s.color })}
                  />
                ))}
                {refValue != null && <span className="chart-ref-tick" style={cssVars({ '--x': X(refValue) })} />}
              </div>
              <div className="chart-group-vals">
                {series.map((s) => (
                  <span key={s.key}>
                    {d.values[s.key] ?? '-'}
                    {d.values[s.key] != null ? unit : ''}
                  </span>
                ))}
              </div>
            </div>
          </Tooltip>
        ))}
      </RowsWrap>
    </div>
  );
}

/** 哑铃图（每项的区间两档：P50 浅点 → P90 深点，同色系两级） */
export function DumbbellChart({
  data,
  unit = '',
  rangeLabels = ['P50', 'P90'],
  maxVisible = 6,
  emptyText = '暂无数据',
}: {
  data: Array<{ label: string; low: number | null; high: number | null; tip?: ReactNode }>;
  unit?: string;
  rangeLabels?: [string, string];
  maxVisible?: number;
  emptyText?: string;
}) {
  const rows = data.filter((d) => d.low != null && d.high != null);
  if (rows.length === 0) return <EmptyBlock minHeight={200} description={emptyText} />;
  const max = Math.max(...rows.map((r) => r.high ?? 0), 1) * 1.08;
  return (
    <div className="chart">
      <Legend
        items={[
          { label: rangeLabels[0], color: DUMBBELL.p50 },
          { label: rangeLabels[1], color: DUMBBELL.p90 },
        ]}
        mark="dot"
      />
      <RowsWrap count={rows.length} maxVisible={maxVisible}>
        {rows.map((r) => {
          const x1 = `${((r.low ?? 0) / max) * 100}%`;
          const x2 = `${((r.high ?? 0) / max) * 100}%`;
          return (
            <Tooltip key={r.label} title={r.tip} trigger={TIP_TRIGGER}>
              <div className="chart-row" tabIndex={0}>
                <span className="chart-row-label">{r.label}</span>
                <div className="chart-row-plot">
                  <div className="chart-dumbbell" style={cssVars({ '--x1': x1, '--x2': x2 })}>
                    <span className="chart-dumbbell-track" />
                    <span className="chart-dumbbell-link" />
                    <span className="chart-dumbbell-dot chart-dumbbell-dot--p50" />
                    <span className="chart-dumbbell-dot chart-dumbbell-dot--p90" />
                  </div>
                  <span className="chart-row-value">
                    {r.low} / {r.high}
                    {unit}
                  </span>
                </div>
              </div>
            </Tooltip>
          );
        })}
      </RowsWrap>
    </div>
  );
}

const niceCeil = (v: number) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
};

const trimNum = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** 趋势折线图（多系列同轴）：列命中区 + 十字准线 + 单 Tooltip 列出全部系列 */
export function TrendChart({
  data,
  series,
  emptyText = '暂无趋势数据',
}: {
  data: Array<{ x: string; values: Record<string, number> }>;
  series: Array<{ key: string; label: string; color: string }>;
  emptyText?: string;
}) {
  if (data.length === 0) return <EmptyBlock minHeight={200} description={emptyText} />;
  const rawMax = Math.max(...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)));
  const max = niceCeil(rawMax);
  const X = (i: number) => (data.length === 1 ? 50 : (i / (data.length - 1)) * 100);
  const Y = (v: number) => 100 - (v / max) * 100;
  const last = data[data.length - 1];
  // 端点直标（相对色弱系列的补偿通道）；两系列终点太近会互相叠字 → 退回图例+Tooltip
  const endYs = series.map((s) => Y(last.values[s.key] ?? 0));
  const endLabelsCollide = endYs.length > 1 && Math.abs(endYs[0] - endYs[1]) < 12;
  const colWidth = 100 / data.length;

  return (
    <div className="chart">
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} mark="line" />
      <div className="trend-grid">
        <div className="trend-y">
          <span>{trimNum(max)}</span>
          <span>{trimNum(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="trend-plot">
          <svg className="trend-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {[0, 50, 100].map((y) => (
              <line key={y} className="trend-gridline" x1="0" x2="100" y1={y} y2={y} />
            ))}
            {series.map((s) => (
              <polyline
                key={s.key}
                className="trend-line"
                style={cssVars({ '--c': s.color })}
                points={data.map((d, i) => `${X(i)},${Y(d.values[s.key] ?? 0)}`).join(' ')}
              />
            ))}
          </svg>
          {data.map((d, i) => (
            <Tooltip
              key={d.x}
              trigger={TIP_TRIGGER}
              title={
                <ChartTip
                  title={`${d.x} 周`}
                  rows={series.map((s) => ({
                    color: s.color,
                    value: d.values[s.key] ?? 0,
                    label: s.label,
                  }))}
                />
              }
            >
              <div
                className="trend-col"
                tabIndex={0}
                style={cssVars({ '--l': `${X(i) - colWidth / 2}%`, '--wd': `${colWidth}%` })}
              >
                {series.map((s) => (
                  <span
                    key={s.key}
                    className="trend-dot"
                    style={cssVars({ '--c': s.color, '--y': `${Y(d.values[s.key] ?? 0)}%` })}
                  />
                ))}
              </div>
            </Tooltip>
          ))}
          {!endLabelsCollide &&
            series.map((s, si) => (
              <span key={s.key} className="trend-endlabel" style={cssVars({ '--y': `${endYs[si]}%` })}>
                {last.values[s.key] ?? 0}
              </span>
            ))}
        </div>
        <div className="trend-x">
          {data.map((d) => (
            <span key={d.x}>{d.x}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
