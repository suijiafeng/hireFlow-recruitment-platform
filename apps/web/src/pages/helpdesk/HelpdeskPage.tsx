import {
  BookOutlined,
  CommentOutlined,
  CopyOutlined,
  FileTextOutlined,
  QuestionCircleOutlined,
  RobotOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Button, Card, Col, Input, Popconfirm, Row, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { helpdeskApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import { EmptyBlock } from '../../components/ui';

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  /** ISO 时间戳（悬停消息行显示 HH:mm） */
  at: string;
  sources?: Array<{ id: string; title: string }>;
  provider?: string;
}

/** 快捷问题与种子知识库文档一一对应（网络/五险一金/休假/报销/试用期/考勤） */
const QUICK_QUESTIONS = [
  'WiFi 密码是什么？',
  '公积金比例是多少？',
  '年假有几天，怎么申请？',
  '报销什么时候打款？',
  '试用期多久，怎么转正？',
  '加班怎么调休？',
];

/** 会话持久化：刷新/切页不丢（v1 为存储结构版本号） */
const STORAGE_KEY = 'arthr:helpdesk-chat:v1';
const MAX_MESSAGES = 200;

function loadMessages(): ChatMessage[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function ChatRow({ msg, onCopy }: { msg: ChatMessage; onCopy: (text: string) => void }) {
  const isUser = msg.role === 'user';
  const showFooter = (msg.sources?.length ?? 0) > 0 || msg.provider === 'mock';
  return (
    <div className={isUser ? 'chat-row chat-row--user' : 'chat-row'}>
      <span className={isUser ? 'chat-avatar chat-avatar--user' : 'chat-avatar chat-avatar--bot'}>
        {isUser ? <UserOutlined /> : <RobotOutlined />}
      </span>
      <div className="chat-bubble">
        {msg.text}
        {!isUser && (
          <Tooltip title="复制回答">
            <Button
              className="chat-copy"
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => onCopy(msg.text)}
            />
          </Tooltip>
        )}
        {showFooter && (
          <div className="chat-src">
            {(msg.sources?.length ?? 0) > 0 && (
              <>
                <span className="u-meta u-muted">出处：</span>
                {msg.sources!.map((s) => (
                  <Tag key={s.id} className="tag-meta u-mr-0">
                    {s.title}
                  </Tag>
                ))}
              </>
            )}
            {msg.provider === 'mock' && (
              <Tooltip title="当前由规则引擎按关键词检索作答；配置 ANTHROPIC_API_KEY 后由大模型综合回答">
                <span className="chat-provider">规则引擎</span>
              </Tooltip>
            )}
          </div>
        )}
      </div>
      <span className="chat-time">{dayjs(msg.at).format('HH:mm')}</span>
    </div>
  );
}

export function HelpdeskPage() {
  const { message } = App.useApp();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  /** 最近一次失败的问题：在消息流里给内联重试入口 */
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** 中文输入法组词中回车不应发送 */
  const composingRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  const scrollToBottom = () =>
    setTimeout(() => listRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50);

  const askMutation = useMutation({
    mutationFn: helpdeskApi.ask,
    onSuccess: (data) => {
      setFailedQuestion(null);
      setMessages((prev) =>
        [
          ...prev,
          {
            role: 'bot' as const,
            text: data.answer,
            at: new Date().toISOString(),
            sources: data.sources,
            provider: data.aiMeta.provider,
          },
        ].slice(-MAX_MESSAGES),
      );
      scrollToBottom();
    },
    onError: (error, question) => {
      setFailedQuestion(question);
      message.error(extractErrorMessage(error, '回答失败'));
      scrollToBottom();
    },
  });

  const docsQuery = useQuery({ queryKey: ['helpdesk-docs'], queryFn: helpdeskApi.docs });

  const ask = (question: string) => {
    const q = question.trim();
    if (q.length < 2 || askMutation.isPending) return;
    setFailedQuestion(null);
    setMessages((prev) =>
      [...prev, { role: 'user' as const, text: q, at: new Date().toISOString() }].slice(-MAX_MESSAGES),
    );
    setInput('');
    askMutation.mutate(q);
    scrollToBottom();
  };

  /** 重试：用户消息已在流中，只重发请求 */
  const retry = () => {
    if (!failedQuestion || askMutation.isPending) return;
    askMutation.mutate(failedQuestion);
  };

  const clearChat = () => {
    setMessages([]);
    setFailedQuestion(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const copyAnswer = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('回答已复制');
    } catch {
      message.warning('复制失败，请手动选择文本复制');
    }
  };

  return (
    <div className="helpdesk-page">
      {/* 页面头部 */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">入职问答</h1>
          <p className="page-header-subtitle">AI 入职助手，基于公司制度文档回答新员工问题</p>
        </div>
      </div>

      <Row gutter={16}>
        <Col span={17}>
          <Card className="chat-card" classNames={{ body: 'chat-card-body' }}>
            <div className="section-header">
              <div className="section-title">
                <CommentOutlined className="section-icon" />
                <span>入职问答助手</span>
              </div>
              {messages.length > 0 && (
                <Popconfirm title="清空当前对话记录？" okText="清空" onConfirm={clearChat}>
                  <Button type="link" size="small" className="u-p0">
                    清空对话
                  </Button>
                </Popconfirm>
              )}
            </div>
            {messages.length === 0 ? (
              <div className="chat-welcome">
                <span className="chat-welcome-icon">
                  <RobotOutlined />
                </span>
                <div className="chat-welcome-title">有入职问题，直接问我</div>
                <p className="chat-welcome-desc">
                  回答基于公司制度文档并附出处，覆盖 WiFi、五险一金、休假、报销、考勤、试用期等主题。
                </p>
                <div className="chat-welcome-qs">
                  {QUICK_QUESTIONS.map((q) => (
                    <Button key={q} shape="round" onClick={() => ask(q)}>
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div ref={listRef} className="chat-list">
                {messages.map((m, i) => (
                  <ChatRow key={`${m.at}-${i}`} msg={m} onCopy={copyAnswer} />
                ))}
                {askMutation.isPending && (
                  <div className="chat-row">
                    <span className="chat-avatar chat-avatar--bot">
                      <RobotOutlined />
                    </span>
                    <div className="chat-bubble chat-bubble--typing">
                      <Spin size="small" />
                      正在检索制度文档…
                    </div>
                  </div>
                )}
                {failedQuestion && !askMutation.isPending && (
                  <div className="chat-row">
                    <span className="chat-avatar chat-avatar--bot">
                      <RobotOutlined />
                    </span>
                    <div className="chat-bubble chat-bubble--error">
                      这条没有回答成功，可能是网络或服务波动。
                      <Button type="link" size="small" onClick={retry}>
                        重试
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="chat-composer">
              <Input.TextArea
                value={input}
                variant="borderless"
                autoSize={{ minRows: 3, maxRows: 8 }}
                onChange={(e) => setInput(e.target.value)}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={() => {
                  composingRef.current = false;
                }}
                onPressEnter={(e) => {
                  if (e.shiftKey || composingRef.current) return;
                  e.preventDefault();
                  ask(input);
                }}
                placeholder="输入问题，如：试用期多久可以转正？"
              />
              <div className="chat-composer-foot">
                <span className="chat-input-hint">
                  Enter 发送，Shift + Enter 换行 · 回答仅供参考，重要事项请与 HR 确认
                </span>
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={() => ask(input)}
                  loading={askMutation.isPending}
                  disabled={!input.trim()}
                >
                  发送
                </Button>
              </div>
            </div>
          </Card>
        </Col>
        <Col span={7}>
          <Card className="faq-card u-mb-16" size="small">
            <div className="section-header">
              <div className="section-title">
                <QuestionCircleOutlined className="section-icon" />
                <span>常见问题</span>
              </div>
            </div>
            {QUICK_QUESTIONS.map((q) => (
              <div key={q} className="faq-item" onClick={() => ask(q)}>
                <QuestionCircleOutlined />
                <span>{q}</span>
              </div>
            ))}
          </Card>
          <Card className="docs-card" size="small">
            <div className="section-header">
              <div className="section-title">
                <BookOutlined className="section-icon" />
                <span>知识库范围</span>
              </div>
            </div>
            {docsQuery.isLoading ? (
              <div className="loading-center">
                <Spin size="small" />
              </div>
            ) : !docsQuery.data?.length ? (
              <EmptyBlock minHeight={120} description="暂无知识库文档，由 HR 在后台维护" />
            ) : (
              <div className="docs-scroll">
                {docsQuery.data.map((doc) => (
                  <div key={doc.id} className="doc-item">
                    <Space size={6}>
                      <FileTextOutlined className="u-muted" />
                      <Typography.Text>{doc.title}</Typography.Text>
                    </Space>
                    <div>
                      {doc.tags.map((t) => (
                        <Tag key={t} className="tag-meta u-mt-4">
                          {t}
                        </Tag>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Typography.Text type="secondary" className="u-meta">
              机器人仅依据以上文档作答，答案附出处
            </Typography.Text>
            <div className="helpdesk-escalation">
              没找到答案或拿不准？联系 HR：hr@arthr.local（工作日 10:00 - 18:00）
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
