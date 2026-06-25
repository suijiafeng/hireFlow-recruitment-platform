import { EyeInvisibleOutlined, EyeTwoTone, LockOutlined, MailOutlined, RocketOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { App, Button, Card, Form, Input } from 'antd';
import { Navigate, useNavigate } from 'react-router';
import { authApi } from '../api';
import { extractErrorMessage } from '../api/client';
import { useAuthStore } from '../stores/auth';

/** 卖点：编号 + 发丝分隔行（不用彩色图标方块，色彩留给数据与状态） */
const FEATURES = [
  { no: '01', title: 'AI 智能解析', desc: '上传即结构化：技能标签、岗位匹配分与依据一并给出' },
  { no: '02', title: '数据驱动决策', desc: '漏斗瓶颈、渠道质量、面试官偏差，一屏可查' },
  { no: '03', title: '协同招聘流程', desc: '看板流转、面试协同、面评归档，全程留痕可追溯' },
];

/** 开发环境测试账号：点一行直接填入表单，替代原来的 emoji 提示块 */
const DEV_ACCOUNTS = [
  { email: 'admin@arthr.local', role: '系统管理员' },
  { email: 'hr@arthr.local', role: 'HR / 招聘专员' },
  { email: 'manager@arthr.local', role: '用人经理' },
  { email: 'interviewer@arthr.local', role: '面试官' },
];
const DEV_PASSWORD = 'Admin@123456';

export function LoginPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { token, setAuth } = useAuthStore();
  const [form] = Form.useForm<{ email: string; password: string }>();

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
      <div className="login-shell">
        {/* 品牌面板：logo / 主张 / 卖点 / 页脚，四段垂直分布 */}
        <div className="login-brand-side">
          <div className="login-brand-logo">
            <div className="login-brand-logo-mark">
              <RocketOutlined />
            </div>
            <div className="login-brand-logo-text">
              <h1>ART 智能招聘</h1>
              <p>AI Recruiting</p>
            </div>
          </div>

          <div className="login-brand-hero">
            <h2>
              让每一次筛选
              <br />
              都有据可依
            </h2>
            <p>从简历解析到面评归档，全流程留痕；AI 只给建议与依据，决定权始终在你手上。</p>

            <div className="login-brand-features">
              {FEATURES.map((f) => (
                <div className="login-brand-feature" key={f.no}>
                  <div className="login-brand-feature-icon">{f.no}</div>
                  <div className="login-brand-feature-text">
                    <h3>{f.title}</h3>
                    <p>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="login-brand-meta">
            <span>© 2026 ART 智能招聘</span>
            <span>50+ 招聘全流程能力</span>
            <span>操作全程留痕 · GDPR 友好</span>
          </div>
        </div>

        {/* 表单面板：不再重复 logo，标题左对齐 */}
        <Card className="login-card" variant="borderless">
          <div className="login-welcome">
            <h2>登录</h2>
            <p>使用公司邮箱登录，权限由管理员分配。</p>
          </div>

          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            onFinish={(values) => loginMutation.mutate(values)}
            initialValues={{ email: DEV_ACCOUNTS[0].email, password: DEV_PASSWORD }}
          >
            <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入正确的邮箱' }]}>
              <Input prefix={<MailOutlined />} placeholder="you@company.com" size="large" autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}>
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="请输入密码"
                size="large"
                autoComplete="current-password"
                iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loginMutation.isPending}>
              登录
            </Button>
          </Form>

          <div className="login-tip">
            <div className="login-tip-title">
              <span>开发环境测试账号</span>
              <span>密码 {DEV_PASSWORD}</span>
            </div>
            <div className="login-tip-content">
              {DEV_ACCOUNTS.map((a) => (
                <div
                  className="login-account-row"
                  key={a.email}
                  onClick={() => form.setFieldsValue({ email: a.email, password: DEV_PASSWORD })}
                >
                  <span>{a.email}</span>
                  <span className="role">{a.role}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
