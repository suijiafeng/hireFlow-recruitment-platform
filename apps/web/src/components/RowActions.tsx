import { Dropdown } from 'antd';

export type RowAction = {
  key: string;
  label: string;
  onClick: () => void;
  /** 危险操作，文字标红 */
  danger?: boolean;
  /** 无权限或状态不允许：置灰且不可点 */
  disabled?: boolean;
};

type Props = {
  actions: Array<RowAction | null | false | undefined>;
  /** 最多平铺几个，超出的收进「···」。默认 3 */
  max?: number;
};

/**
 * 表格行操作列。
 *
 * 统一约定：行本身不再挂 onClick（onRow），所有可点动作集中在这一列——行级点击是隐形入口，
 * 用户看不出哪些行可点、点了会发生什么，而且会和列内的链接抢事件。
 *
 * 平铺上限 max 个；条目多于 max 时只平铺 max-1 个，剩下的收进「···」，
 * 避免操作列宽度随权限/状态忽宽忽窄导致各行右端参差。
 */
export function RowActions({ actions, max = 3 }: Props) {
  const list = actions.filter(Boolean) as RowAction[];
  if (list.length === 0) return <span className="hf-faint">—</span>;

  const inline = list.length <= max ? list : list.slice(0, max - 1);
  const overflow = list.length <= max ? [] : list.slice(max - 1);

  return (
    <span className="u-flex-end u-flex-gap-12">
      {inline.map((a) => (
        <span
          key={a.key}
          className={a.disabled ? 'hf-link hf-link--off' : a.danger ? 'hf-link hf-link--danger' : 'hf-link'}
          onClick={(e) => {
            // 列里还有别的可点元素，且外层可能有 Dropdown/Drawer，统一拦掉冒泡
            e.stopPropagation();
            if (!a.disabled) a.onClick();
          }}
        >
          {a.label}
        </span>
      ))}
      {overflow.length > 0 && (
        <Dropdown
          trigger={['click']}
          menu={{
            items: overflow.map((a) => ({
              key: a.key,
              label: a.label,
              danger: a.danger,
              disabled: a.disabled,
            })),
            onClick: ({ key, domEvent }) => {
              domEvent.stopPropagation();
              overflow.find((a) => a.key === key)?.onClick();
            },
          }}
        >
          <span className="hf-more" onClick={(e) => e.stopPropagation()}>
            ···
          </span>
        </Dropdown>
      )}
    </span>
  );
}
