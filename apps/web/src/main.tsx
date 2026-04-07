import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { router } from './router';

dayjs.locale('zh-cn');

/**
 * 关闭 antd 动画的三种场景：
 * 1. webdriver 自动化（rc-motion 离场动画事件不触发，Modal 会卡在 leave-start）
 * 2. 系统「减少动态效果」偏好（无障碍）
 * 3. 开发用手动开关 localStorage['arthr:no-motion']='1'（内嵌浏览器面板 rAF 节流时用）
 */
const disableMotion =
  navigator.webdriver ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
  localStorage.getItem('arthr:no-motion') === '1';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          borderRadius: 8,
          colorBgLayout: '#eef1f6',
          motion: !disableMotion,
        },
        components: {
          Layout: { headerBg: '#ffffff', siderBg: '#0d1b3e' },
          Menu: { darkItemBg: '#0d1b3e', darkSubMenuItemBg: '#0a1633' },
        },
      }}
    >
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
