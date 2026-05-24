import { LockOutlined, MailOutlined, RocketOutlined, ThunderboltOutlined, TeamOutlined, BarChartOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { App, Button, Card, Form, Input } from 'antd';
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
    <div className="login-bg">
      {/* 左侧品牌展示区 */}
      <div className="login-brand-side">
        <div className="login-brand-content">
          <div className="login-brand-logo">
            <div className="login-brand-logo-mark">
              <RocketOutlined />
            </div>
            <div className="login-brand-logo-text">
              <h1>HireFlow</h1>
              <p>AI Recruiting Platform</p>
            </div>
          </div>
          
          <div className="login-brand-hero">
            <h2>
              让招聘更智能<br />
              <span className="accent-text">让人才更精准</span>
            </h2>
            <p>
              基于 AI 的新一代智能招聘平台，从简历解析到面试评估，
              全流程自动化赋能，助力 HR 团队高效完成招聘目标。
            </p>
          </div>

          <div className="login-brand-features">
            <div className="login-brand-feature">
              <div className="login-brand-feature-icon">
                <ThunderboltOutlined />
              </div>
              <div className="login-brand-feature-text">
                <h3>AI 智能解析</h3>
                <p>自动提取简历关键信息，智能生成候选人画像</p>
              </div>
            </div>
            <div className="login-brand-feature">
              <div className="login-brand-feature-icon">
                <BarChartOutlined />
              </div>
              <div className="login-brand-feature-text">
                <h3>数据驱动决策</h3>
                <p>多维度招聘漏斗分析，AI 健康度诊断与优化建议</p>
              </div>
            </div>
            <div className="login-brand-feature">
              <div className="login-brand-feature-icon">
                <TeamOutlined />
              </div>
              <div className="login-brand-feature-text">
                <h3>协同招聘流程</h3>
                <p>看板式流程管理，面试官协作，面试评估一体化</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="login-brand-footer">
          © 2024 HireFlow. AI-Powered Recruitment Platform
        </div>
      </div>

      {/* 右侧登录表单区 */}
      <div className="login-form-side">
        <Card className="login-card" variant="borderless">
          <div className="login-welcome">
            <div className="login-logo">
              <div className="login-logo-mark">
                <RocketOutlined />
              </div>
            </div>
            <h2>欢迎回来</h2>
            <p>登录您的账户继续使用</p>
          </div>
          
          <Form
            layout="vertical"
            onFinish={(values: { email: string; password: string }) => loginMutation.mutate(values)}
            initialValues={{ email: 'admin@arthr.local', password: 'Admin@123456' }}
          >
            <Form.Item
              name="email"
              label="邮箱地址"
              rules={[{ required: true, type: 'email', message: '请输入正确的邮箱' }]}
            >
              <Input prefix={<MailOutlined />} placeholder="you@company.com" size="large" />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loginMutation.isPending}>
              登 录
            </Button>
          </Form>
          
          <div className="login-tip">
            <div className="login-tip-title">
              💡 开发环境测试账号
            </div>
            <div className="login-tip-content">
              admin / hr / manager / interviewer @arthr.local<br />
              统一密码：Admin@123456
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
