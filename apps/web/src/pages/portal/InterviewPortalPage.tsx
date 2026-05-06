import { CalendarOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Empty, Radio, Result, Space, Spin, Tag, Typography } from 'antd';
import type { AxiosError } from 'axios';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useParams } from 'react-router';
import { portalApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import { PortalShell } from './OfferPortalPage';

/** 候选人自助选时：从面试官共同空闲时段中选择，落定即同步双方 */
export function InterviewPortalPage() {
  const { token = '' } = useParams();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [slotId, setSlotId] = useState<string | null>(null);

  const viewQuery = useQuery({
    queryKey: ['portal-interview', token],
    queryFn: () => portalApi.interviewView(token),
    enabled: Boolean(token),
    retry: false,
  });

  const pickMutation = useMutation({
    mutationFn: (id: string) => portalApi.interviewPick(token, id),
    onSuccess: (data) => {
      queryClient.setQueryData(['portal-interview', token], data);
      message.success('面试时间已确认，请准时参加！');
    },
    onError: (error) => {
      // 并发抢占（409）：刷新剩余时段供重选（冲突给替代时段）
      if ((error as AxiosError)?.response?.status === 409) {
        message.warning('该时段刚被约走，已为您刷新剩余时段');
        setSlotId(null);
        void queryClient.invalidateQueries({ queryKey: ['portal-interview', token] });
      } else {
        message.error(extractErrorMessage(error, '确认失败，请稍后重试'));
      }
    },
  });

  const view = viewQuery.data;

  return (
    <PortalShell>
      <div style={{ color: '#fff', marginBottom: 16, textAlign: 'center' }}>
        <Typography.Title level={4} style={{ color: '#fff', marginBottom: 4 }}>
          {view?.company ?? 'ART 科技有限公司'}
        </Typography.Title>
        <Typography.Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
          面试时间确认
        </Typography.Text>
      </div>
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
        ) : view.scheduledAt ? (
          <Result
            status="success"
            icon={<CheckCircleOutlined />}
            title="面试时间已确认"
            subTitle={`${view.jobTitle} · 第 ${view.round} 轮 · ${dayjs(view.scheduledAt).format(
              'YYYY-MM-DD HH:mm',
            )}（约 ${view.durationMins} 分钟）。如需改期请联系 HR。`}
          />
        ) : (
          <>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              {view.candidateName}，您好！
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
              诚邀您参加「{view.jobTitle}」第 {view.round} 轮面试（约 {view.durationMins} 分钟）。
              请从以下时段中选择一个方便的时间：
            </Typography.Paragraph>
            {view.slots.length === 0 ? (
              <Empty description="暂无可选时段，HR 将尽快补充，请稍后再来或联系 HR" />
            ) : (
              <>
                <Radio.Group
                  value={slotId}
                  onChange={(e) => setSlotId(e.target.value)}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}
                >
                  {view.slots.map((s) => (
                    <Radio key={s.id} value={s.id} style={{ padding: '6px 0' }}>
                      <Space>
                        <CalendarOutlined />
                        {dayjs(s.startAt).format('MM-DD（ddd）HH:mm')} - {dayjs(s.endAt).format('HH:mm')}
                        {dayjs(s.startAt).diff(dayjs(), 'day') <= 1 && <Tag color="blue">最近</Tag>}
                      </Space>
                    </Radio>
                  ))}
                </Radio.Group>
                <Button
                  type="primary"
                  block
                  size="large"
                  disabled={!slotId}
                  loading={pickMutation.isPending}
                  onClick={() =>
                    modal.confirm({
                      title: '确认这个面试时间？',
                      content: '确认后将同步面试官日程；如需再改期请联系 HR。',
                      okText: '确认时间',
                      onOk: () => pickMutation.mutateAsync(slotId!),
                    })
                  }
                >
                  确认面试时间
                </Button>
              </>
            )}
          </>
        )}
      </Card>
      <Typography.Paragraph type="secondary" style={{ textAlign: 'center', fontSize: 12, marginTop: 12 }}>
        本页面为免登录安全链接，请勿转发给他人
      </Typography.Paragraph>
    </PortalShell>
  );
}
