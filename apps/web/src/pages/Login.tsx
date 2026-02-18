import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { Alert, App, Button, Card, Form, Input, Typography } from 'antd';
import { Navigate, useNavigate } from 'react-router';
import { authApi } from '../api';
import { extractErrorMessage } from '../api/client';
import { useAuthStore } from '../stores/auth';

export function LoginPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { token, setAuth } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user);
      message.success(`欢迎回来，${data.user.name}`);
      navigate('/', { replace: true });
    },
    onError: (error) => message.error(extractErrorMessage(error, '登录失败')),
  });

  if (token) return <Navigate to="/" replace />;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1f3c88 0%, #2d6cdf 100%)',
      }}
    >
      <Card style={{ width: 380 }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 4 }}>
          智能招聘平台
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
          AI-Powered Recruiting & Onboarding
        </Typography.Paragraph>
        <Form
          layout="vertical"
          onFinish={(values: { email: string; password: string }) => loginMutation.mutate(values)}
          initialValues={{ email: 'admin@arthr.local', password: 'Admin@123456' }}
        >
          <Form.Item
            name="email"
            label="邮箱"
            rules={[{ required: true, type: 'email', message: '请输入正确的邮箱' }]}
          >
            <Input prefix={<MailOutlined />} placeholder="you@company.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="••••••••" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loginMutation.isPending}>
            登 录
          </Button>
        </Form>
        <Alert
          style={{ marginTop: 16 }}
          type="info"
          showIcon
          message="开发环境测试账号"
          description={
            <div style={{ fontSize: 12 }}>
              admin / hr / manager / interviewer @arthr.local
              <br />
              统一密码：Admin@123456
            </div>
          }
        />
      </Card>
    </div>
  );
}
