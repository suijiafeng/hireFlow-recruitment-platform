import { CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Descriptions, Form, Modal, Result, Select, Spin, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { portalApi } from '../../api';
import { extractErrorMessage } from '../../api/client';

/** 免登录 H5 外壳：移动端单列卡片 */
export function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #0d1b3e 0%, #1f3f8f 45%, #eef1f6 45.1%)',
        padding: '32px 16px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ width: '100%', maxWidth: 480 }}>{children}</div>
    </div>
  );
}

function PortalHeader({ company, subtitle }: { company: string; subtitle: string }) {
  return (
    <div style={{ color: '#fff', marginBottom: 16, textAlign: 'center' }}>
      <Typography.Title level={4} style={{ color: '#fff', marginBottom: 4 }}>
        {company}
      </Typography.Title>
      <Typography.Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>{subtitle}</Typography.Text>
    </div>
  );
}

function DeclineModal({
  open,
  reasons,
  loading,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  reasons: readonly string[];
  loading: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [form] = Form.useForm<{ reason: string }>();
  return (
    <Modal
      title="确认婉拒这份 Offer？"
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText="确认婉拒"
      okButtonProps={{ danger: true }}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(v) => onSubmit(v.reason)}>
        <Form.Item
          name="reason"
          label="请告诉我们原因（必选）"
          rules={[{ required: true, message: '请选择婉拒原因' }]}
          extra="您的反馈仅用于改进我们的招聘工作"
        >
          <Select placeholder="选择原因" options={reasons.map((r) => ({ value: r, label: r }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function OfferPortalPage() {
  const { token = '' } = useParams();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [declineOpen, setDeclineOpen] = useState(false);

  const viewQuery = useQuery({
    queryKey: ['portal-offer', token],
    queryFn: () => portalApi.offerView(token),
    enabled: Boolean(token),
    retry: false,
  });

  const respondMutation = useMutation({
    mutationFn: ({ decision, reason }: { decision: 'ACCEPTED' | 'DECLINED'; reason?: string }) =>
      portalApi.offerRespond(token, decision, reason),
    onSuccess: (data) => {
      queryClient.setQueryData(['portal-offer', token], data);
      setDeclineOpen(false);
      message.success(data.decision === 'ACCEPTED' ? '已确认接受，欢迎加入！' : '已提交答复');
    },
    onError: (error) => message.error(extractErrorMessage(error, '提交失败，请稍后重试')),
  });

  const view = viewQuery.data;

  return (
    <PortalShell>
      <PortalHeader company={view?.company ?? 'ART 科技有限公司'} subtitle="录用通知（Offer Letter）" />
      <Card>
        {viewQuery.isLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        ) : viewQuery.isError || !view ? (
          <Result
            status="warning"
            title="链接无效或已失效"
            subTitle={extractErrorMessage(viewQuery.error, '请联系 HR 获取最新链接')}
          />
        ) : view.preparing ? (
          <Result
            status="info"
            title="Offer 正在更新中"
            subTitle="我们正在为您调整录用方案，稍后将重新发送，请留意通知。"
          />
        ) : view.decision === 'ACCEPTED' ? (
          <Result
            status="success"
            title="您已接受这份 Offer"
            subTitle={`答复时间：${dayjs(view.respondedAt).format('YYYY-MM-DD HH:mm')}。期待与您共事！`}
            extra={
              view.onboardingPortalToken ? (
                <Link to={`/portal/onboarding/${view.onboardingPortalToken}`}>
                  <Button type="primary">进入入职资料填报 →</Button>
                </Link>
              ) : undefined
            }
          />
        ) : view.decision === 'DECLINED' ? (
          <Result
            status="info"
            title="您已婉拒这份 Offer"
            subTitle={`原因：${view.decisionReason ?? '-'} · ${dayjs(view.respondedAt).format('YYYY-MM-DD HH:mm')}。感谢您的坦诚，期待未来再会。`}
          />
        ) : view.status === 'EXPIRED' ? (
          <Result
            status="warning"
            icon={<ClockCircleOutlined />}
            title="该 Offer 已超过答复期"
            subTitle="如您仍有意向，请尽快联系 HR 续期后再答复。"
          />
        ) : (
          <>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              亲爱的 {view.candidateName}：
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
              我们诚挚地邀请您加入 {view.company}，以下是您的录用方案：
            </Typography.Paragraph>
            <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="职位">
                {view.jobTitle}（{view.department}）
              </Descriptions.Item>
              {view.grade && <Descriptions.Item label="职级">{view.grade}</Descriptions.Item>}
              {view.salary && (
                <Descriptions.Item label="薪资">
                  月薪 ¥{view.salary.base.toLocaleString()} × {12 + (view.salary.bonusMonths ?? 0)} 薪
                </Descriptions.Item>
              )}
              {view.salary?.note && <Descriptions.Item label="备注">{view.salary.note}</Descriptions.Item>}
              {view.expiresAt && (
                <Descriptions.Item label="答复截止">
                  <Tag color={dayjs(view.expiresAt).diff(dayjs(), 'day') <= 1 ? 'red' : 'blue'}>
                    {dayjs(view.expiresAt).format('YYYY-MM-DD')} 前（还剩 {Math.max(dayjs(view.expiresAt).diff(dayjs(), 'day'), 0)} 天）
                  </Tag>
                  {view.extendedOnce && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      已续期
                    </Typography.Text>
                  )}
                </Descriptions.Item>
              )}
            </Descriptions>
            <div style={{ display: 'flex', gap: 12 }}>
              <Button
                type="primary"
                size="large"
                block
                icon={<CheckCircleOutlined />}
                loading={respondMutation.isPending}
                onClick={() =>
                  modal.confirm({
                    title: '确认接受这份 Offer？',
                    content: '接受后我们将为您开启入职流程。',
                    okText: '确认接受',
                    onOk: () => respondMutation.mutateAsync({ decision: 'ACCEPTED' }),
                  })
                }
              >
                接受 Offer
              </Button>
              <Button size="large" block onClick={() => setDeclineOpen(true)}>
                婉拒
              </Button>
            </div>
            <DeclineModal
              open={declineOpen}
              reasons={view.declineReasons}
              loading={respondMutation.isPending}
              onCancel={() => setDeclineOpen(false)}
              onSubmit={(reason) => respondMutation.mutate({ decision: 'DECLINED', reason })}
            />
          </>
        )}
      </Card>
      <Typography.Paragraph type="secondary" style={{ textAlign: 'center', fontSize: 12, marginTop: 12 }}>
        本页面为免登录安全链接，请勿转发给他人
      </Typography.Paragraph>
    </PortalShell>
  );
}
