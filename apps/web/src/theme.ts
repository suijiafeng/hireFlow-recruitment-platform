import type { ThemeConfig } from 'antd';

/**
 * 全站设计 token 唯一来源：
 * - 品牌色板（主蓝 + 功能色 + 强调色），行内样式与图表统一引用
 * - 文字色阶（对齐 antd colorText 梯度），禁止再手写 #999/#666 等散数
 * - 字号阶梯：最小 12px，偶数递增（12/14/16/20/24）
 */
export const BRAND = {
  primary: '#2a78d6',
  success: '#1baf7a',
  warning: '#eda100',
  error: '#e34948',
  purple: '#4a3aa7',
  cyan: '#0e9db5',
  magenta: '#c2418f',
  navy: '#0d1b3e',
  logoGradient: 'linear-gradient(135deg, #2a78d6 0%, #6db3ff 100%)',
} as const;

export const INK = {
  primary: 'rgba(0, 0, 0, 0.88)',
  secondary: 'rgba(0, 0, 0, 0.65)',
  muted: 'rgba(0, 0, 0, 0.45)',
  faint: 'rgba(0, 0, 0, 0.25)',
} as const;

/** 文字字号阶梯：12 辅助 / 14 正文 / 16 常规标题 / 18 大标题（num 为数字展示专用，不用于文字） */
export const FONT = { meta: 12, body: 14, title: 16, heading: 18, num: 20 } as const;

/** 卡片/分隔线的统一浅边框色 */
export const LINE = '#e6e9f0';

export function buildTheme(disableMotion: boolean): ThemeConfig {
  return {
    token: {
      colorPrimary: BRAND.primary,
      colorInfo: BRAND.primary,
      colorLink: BRAND.primary,
      colorSuccess: BRAND.success,
      colorWarning: BRAND.warning,
      colorError: BRAND.error,
      // fontSize=14 派生 SM=12 / LG=16；标题阶梯显式收敛：h4=18（大标题）、h5=16（常规标题），页面只用 h4/h5
      fontSize: 14,
      fontSizeHeading4: 18,
      fontSizeHeading5: 16,
      borderRadius: 8,
      borderRadiusLG: 12,
      borderRadiusSM: 6,
      colorBgLayout: '#eef1f6',
      colorBorderSecondary: LINE,
      motion: !disableMotion,
    },
    components: {
      // 卡片统一：标题 16px；内边距一律 16（antd 默认卡 24 太松、小卡 12 太挤，混排时边距参差）
      Card: {
        headerFontSize: 16,
        headerFontSizeSM: 16,
        bodyPadding: 16,
        bodyPaddingSM: 16,
        headerPadding: 16,
        headerPaddingSM: 16,
      },
      Layout: { headerBg: '#ffffff', siderBg: BRAND.navy },
      Menu: {
        darkItemBg: BRAND.navy,
        darkSubMenuItemBg: '#0a1633',
        itemBorderRadius: 8,
        darkItemSelectedBg: BRAND.primary,
      },
      Table: { headerColor: INK.secondary },
      Statistic: { titleFontSize: 14, contentFontSize: 24 },
    },
  };
}
