import { CommentOutlined, SendOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Button, Card, Col, Input, Row, Space, Spin, Tag, Typography } from 'antd';
import { useRef, useState } from 'react';
import { helpdeskApi } from '../../api';
import { extractErrorMessage } from '../../api/client';

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  sources?: Array<{ id: string; title: string }>;
  provider?: string;
}

const QUICK_QUESTIONS = ['WiFi 密码是什么？', '公积金比例是多少？', '年假有几天，怎么申请？', '报销什么时候打款？'];

export function HelpdeskPage() {
  const { message } = App.useApp();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'bot',
      text: '你好！我是入职问答助手，基于公司制度文档回答问题。可以问我 WiFi、公积金、休假、报销、考勤等高频问题。',
    },
  ]);
  const listRef = useRef<HTMLDivElement>(null);

  const askMutation = useMutation({
    mutationFn: helpdeskApi.ask,
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { role: 'bot', text: data.answer, sources: data.sources, provider: data.aiMeta.provider },
      ]);
      setTimeout(() => listRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50);
    },
    onError: (error) => message.error(extractErrorMessage(error, '回答失败')),
  });

  const docsQuery = useQuery({ queryKey: ['helpdesk-docs'], queryFn: helpdeskApi.docs });

  const ask = (question: string) => {
    const q = question.trim();
    if (q.length < 2 || askMutation.isPending) return;
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setInput('');
    askMutation.mutate(q);
    setTimeout(() => listRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50);
  };

  return (
    <Row gutter={16}>
      <Col span={16}>
        <Card
          title={
            <Space>
              <CommentOutlined /> 入职问答机器人
            </Space>
          }
          styles={{ body: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)' } }}
        >
          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    maxWidth: '78%',
                    padding: '10px 14px',
                    borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: m.role === 'user' ? '#2a78d6' : '#f2f4f8',
                    color: m.role === 'user' ? '#fff' : 'rgba(0,0,0,0.88)',
                    fontSize: 13,
                    lineHeight: 1.7,
                  }}
                >
                  {m.text}
                  {m.sources && m.sources.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #d9d9d9' }}>
                      <span style={{ fontSize: 11, color: '#888' }}>出处：</span>
                      {m.sources.map((s) => (
                        <Tag key={s.id} style={{ fontSize: 11 }}>
                          {s.title}
                        </Tag>
                      ))}
                    </div>
                  )}
                  {m.provider === 'mock' && (
                    <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                      规则引擎作答 · 配置 ANTHROPIC_API_KEY 后由大模型综合回答
                    </div>
                  )}
                </div>
              </div>
            ))}
            {askMutation.isPending && (
              <div style={{ padding: '4px 8px' }}>
                <Spin size="small" />
              </div>
            )}
          </div>
          <Space.Compact style={{ width: '100%', marginTop: 12 }}>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPressEnter={() => ask(input)}
              placeholder="输入问题，如：试用期多久可以转正？"
              disabled={askMutation.isPending}
            />
            <Button type="primary" icon={<SendOutlined />} onClick={() => ask(input)} loading={askMutation.isPending}>
              发送
            </Button>
          </Space.Compact>
        </Card>
      </Col>
      <Col span={8}>
        <Card title="快捷提问" size="small" style={{ marginBottom: 16 }}>
          <Space orientation="vertical" size={8} style={{ width: '100%' }}>
            {QUICK_QUESTIONS.map((q) => (
              <Button key={q} size="small" style={{ width: '100%', textAlign: 'left' }} onClick={() => ask(q)}>
                {q}
              </Button>
            ))}
          </Space>
        </Card>
        <Card title="知识库文档" size="small">
          {docsQuery.data?.map((doc) => (
            <div key={doc.id} style={{ marginBottom: 10 }}>
              <Typography.Text style={{ fontSize: 13 }}>{doc.title}</Typography.Text>
              <div>
                {doc.tags.map((t) => (
                  <Tag key={t} style={{ fontSize: 11, marginTop: 4 }}>
                    {t}
                  </Tag>
                ))}
              </div>
            </div>
          ))}
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            知识库由 HR 维护，机器人仅依据文档作答
          </Typography.Text>
        </Card>
      </Col>
    </Row>
  );
}
