import { BellOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Empty, List, Popover, Typography } from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router';
import { notificationsApi } from '../api';
import type { NotificationItem } from '../api/types';

/** 站内通知铃铛（站内信渠道），30s 轮询未读 */
export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
    refetchInterval: 30_000,
  });

  const readMutation = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: (data) => queryClient.setQueryData(['notifications'], data),
  });
  const readAllMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: (data) => queryClient.setQueryData(['notifications'], data),
  });

  const handleClick = (item: NotificationItem) => {
    if (!item.read) readMutation.mutate(item.id);
    if (item.link) navigate(item.link);
  };

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>通知</span>
          {(query.data?.unread ?? 0) > 0 && (
            <Button type="link" size="small" onClick={() => readAllMutation.mutate()}>
              全部已读
            </Button>
          )}
        </div>
      }
      content={
        <div style={{ width: 340, maxHeight: 420, overflowY: 'auto' }}>
          {!query.data?.items.length ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无通知" />
          ) : (
            <List
              size="small"
              dataSource={query.data.items}
              renderItem={(item) => (
                <List.Item
                  style={{ cursor: 'pointer', padding: '8px 4px', opacity: item.read ? 0.55 : 1 }}
                  onClick={() => handleClick(item)}
                >
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <Typography.Text strong={!item.read} style={{ fontSize: 13 }}>
                        {!item.read && <Badge status="processing" style={{ marginRight: 6 }} />}
                        {item.title}
                      </Typography.Text>
                      <span style={{ fontSize: 11, color: '#999', flexShrink: 0 }}>
                        {dayjs(item.createdAt).format('MM-DD HH:mm')}
                      </span>
                    </div>
                    {item.body && (
                      <div style={{ fontSize: 12, color: '#777', marginTop: 2 }}>{item.body}</div>
                    )}
                  </div>
                </List.Item>
              )}
            />
          )}
        </div>
      }
    >
      <Badge count={query.data?.unread ?? 0} size="small">
        <Button type="text" icon={<BellOutlined style={{ fontSize: 17 }} />} />
      </Badge>
    </Popover>
  );
}
