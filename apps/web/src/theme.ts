import type { ThemeConfig } from 'antd';

/**
 * 全站设计 token 唯一来源 —— 规范：「用规则换省心，用克制换舒服」
 * - 8px 网格：间距/尺寸只用 4/8/16/24/32，控件高 32/40/48
 * - 配色：1 主色 + 语义色（成功/警告/错误：700 深阶做文字过 WCAG AA，50 浅阶只做底色）
 *   + 中性 5 色（#fff / #f5f5f5 / #e0e0e0 / #333 / #1a1a1a），全实色无渐变
 * - 字号偶数阶梯（12/14/16/20/24/28），圆角只用 4/8
 * - 行高 ≈ 字号×1.5 且落 4px 网格：12→20 14→20 16→24 20→28 24→32 28→36
 */
export const BRAND = {
  primary: '#2563EB',
  primaryDark: '#1E40AF', // 主色深阶：hover/active
  primary50: '#EFF6FF', // 主色浅底：选中态/强调底，不占色相位

  success: '#059669',
  success50: '#ECFDF5',
  warning: '#B45309',
  warning50: '#FFFBEB',
  error: '#DC2626',
  error50: '#FEF2F2',
} as const;

/** 中性文字色阶：单一墨色 #1a1a1a 按透明度分层（secondary 白底实测对比 5.7:1 过 AA） */
export const INK = {
  primary: '#1a1a1a',
  secondary: 'rgba(26, 26, 26, 0.65)',
  muted: 'rgba(26, 26, 26, 0.45)',
  faint: 'rgba(26, 26, 26, 0.25)',
  light: 'rgba(26, 26, 26, 0.12)',
} as const;

/** 文字字号阶梯（偶数）：14 辅助 / 16 正文 / 16 卡标题（靠字重区分）/ 20 大标题 / 24 数据大字 / 28 展示 */
export const FONT = { meta: 14, body: 16, title: 16, heading: 20, num: 24, display: 28 } as const;

/** 边框：比背景深 1-2 度；default 走 #e0e0e0，浅分隔用 #f5f5f5 */
export const LINE = {
  default: '#e0e0e0',
  light: '#f5f5f5',
  heavy: '#e0e0e0',
} as const;

/** 阴影：中性黑 alpha，克制层级，无彩色投影 */
export const SHADOW = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 8px -2px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
  lg: '0 8px 16px -4px rgba(0, 0, 0, 0.08), 0 4px 8px -4px rgba(0, 0, 0, 0.05)',
  xl: '0 16px 24px -4px rgba(0, 0, 0, 0.08), 0 8px 8px -6px rgba(0, 0, 0, 0.05)',
  card: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  cardHover: '0 8px 16px -4px rgba(0, 0, 0, 0.1), 0 4px 8px -4px rgba(0, 0, 0, 0.06)',
} as const;

export function buildTheme(disableMotion: boolean): ThemeConfig {
  return {
    token: {
      colorPrimary: BRAND.primary,
      colorInfo: BRAND.primary,
      colorLink: BRAND.primary,
      colorSuccess: BRAND.success,
      colorWarning: BRAND.warning,
      colorError: BRAND.error,

      // 字号阶梯（level 1-3 禁用，页标题 level4=20、卡标题 level5=16）
      fontSize: 16,
      fontSizeSM: 14,
      fontSizeLG: 16,
      fontSizeHeading1: 28,
      fontSizeHeading2: 24,
      fontSizeHeading3: 20,
      fontSizeHeading4: 20,
      fontSizeHeading5: 16,

      // 行高：×1.5 落 4px 网格
      lineHeight: 1.5, // 16 → 24
      lineHeightSM: 1.4286, // 14 → 20
      lineHeightLG: 1.5, // 16 → 24
      lineHeightHeading1: 1.2858, // 28 → 36
      lineHeightHeading2: 1.3334, // 24 → 32
      lineHeightHeading3: 1.4, // 20 → 28
      lineHeightHeading4: 1.4, // 20 → 28
      lineHeightHeading5: 1.5, // 16 → 24

      // 圆角只用 4/8
      borderRadius: 8,
      borderRadiusLG: 8,
      borderRadiusSM: 4,
      borderRadiusXS: 4,

      // 背景（中性色表内）
      colorBgLayout: '#f5f5f5',
      colorBgContainer: '#ffffff',
      colorBgElevated: '#ffffff',

      // 边框
      colorBorder: LINE.default,
      colorBorderSecondary: LINE.light,

      // 文字色
      colorText: INK.primary,
      colorTextSecondary: INK.secondary,
      colorTextTertiary: INK.muted,
      colorTextQuaternary: INK.faint,

      // 动效
      motion: !disableMotion,
      motionDurationMid: '0.2s',
      motionEaseInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',

      // 间距阶梯 4/8/16/24/32
      marginXS: 4,
      marginSM: 8,
      margin: 16,
      marginMD: 16,
      marginLG: 24,
      marginXL: 32,

      paddingXS: 4,
      paddingSM: 8,
      padding: 16,
      paddingMD: 16,
      paddingLG: 24,
      paddingXL: 32,
    },
    components: {
      // 卡片：内边距统一 16（定稿），标题 16
      Card: {
        headerFontSize: 16,
        headerFontSizeSM: 16,
        bodyPadding: 16,
        bodyPaddingSM: 16,
        headerPadding: 16,
        headerPaddingSM: 16,
        borderRadiusLG: 8,
      },
      Layout: {
        headerBg: '#ffffff',
        siderBg: '#1a1a1a',
        bodyBg: '#f5f5f5',
      },
      // 侧边栏菜单：深底 #1a1a1a 上白字 alpha 分层，选中主色
      Menu: {
        darkItemBg: 'transparent',
        darkSubMenuItemBg: 'rgba(255, 255, 255, 0.04)',
        itemBorderRadius: 8,
        darkItemSelectedBg: BRAND.primary,
        darkItemColor: 'rgba(255, 255, 255, 0.75)',
        darkItemHoverColor: '#ffffff',
        darkItemSelectedColor: '#ffffff',
        darkGroupTitleColor: 'rgba(255, 255, 255, 0.45)',
        iconSize: 16,
        itemHeight: 40,
        itemPaddingInline: 16,
      },
      Table: {
        headerColor: INK.secondary,
        headerBg: BRAND.primary50,
        rowHoverBg: '#f5f5f5',
        borderRadiusLG: 8,
      },
      Statistic: {
        titleFontSize: 14,
        contentFontSize: 24,
      },
      Button: {
        borderRadius: 8,
        controlHeight: 40,
        controlHeightSM: 32,
        controlHeightLG: 48,
        primaryShadow: 'none',
      },
      Input: {
        borderRadius: 8,
        controlHeight: 40,
        controlHeightSM: 32,
        controlHeightLG: 48,
        activeBorderColor: BRAND.primary,
        hoverBorderColor: BRAND.primary,
      },
      // 非警示 Tag 默认灰（装饰性颜色零容忍）
      Tag: {
        borderRadius: 4,
        defaultBg: '#f5f5f5',
        defaultColor: 'rgba(26, 26, 26, 0.65)',
      },
      Modal: {
        borderRadiusLG: 8,
        titleFontSize: 20,
        headerBg: 'transparent',
      },
      Drawer: {
        borderRadiusLG: 8,
      },
      Dropdown: {
        borderRadius: 8,
        controlItemBgHover: '#f5f5f5',
      },
      Select: {
        borderRadius: 8,
        controlHeight: 40,
        controlHeightSM: 32,
        controlHeightLG: 48,
      },
      DatePicker: {
        borderRadius: 8,
        controlHeight: 40,
      },
    },
  };
}
