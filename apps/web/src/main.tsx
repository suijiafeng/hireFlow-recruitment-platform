import { App as AntApp, Card, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

dayjs.locale('zh-cn');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <Card style={{ margin: 24 }}>智能招聘平台建设中</Card>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
