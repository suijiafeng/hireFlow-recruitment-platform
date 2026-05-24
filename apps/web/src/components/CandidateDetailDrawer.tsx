import {
  AuditOutlined,
  CalendarOutlined,
  FileTextOutlined,
  InboxOutlined,
  PaperClipOutlined,
  PlusOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  APPLICATION_STATUS_LABEL,
  EVALUATION_CONCLUSION_LABEL,
  INTERVIEW_STATUS_LABEL,
  PERMISSIONS,
  REJECT_REASONS,
  type ApplicationStatus,
  type EvaluationConclusion,
  type InterviewStatus,
} from '@hireflow/shared';
import {
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popover,
  Rate,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Timeline,
  Typography,
  Upload,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { applicationsApi, boardApi, candidatesApi, jobsApi, offersApi, resumesApi } from '../api';
import { extractErrorMessage } from '../api/client';
import type { CandidateDetail, DetailApplication, Interview, MatchReport } from '../api/types';
import { useAuthStore } from '../stores/auth';
import { EvaluationModal } from './EvaluationModal';
import { ScheduleInterviewModal } from './ScheduleInterviewModal';

const ACTION_LABEL: Record<string, string> = {
  'job.created': '创建职位',
  'job.updated': '更新职位',
  'job.stages_updated': '调整招聘流程',
  'candidate.created': '录入候选人',
  'candidate.updated': '更新候选人',
  'resume.added': '导入简历',
  'resume.parsed': 'AI 解析简历',
  'application.created': '加入职位流程',
  'application.stage_changed': '阶段变更',
  'application.scored': 'AI 匹配评分',
  'interview.scheduled': '安排面试',
  'evaluation.submitted': '提交面评',
  'offer.initiated': '发起 Offer',
  'offer.approved': 'Offer 审批通过',
  'offer.rejected': 'Offer 审批驳回',
  'offer.sent': 'Offer 已发送',
  'offer.responded': '候选人答复 Offer',
  'onboarding.created': '创建入职单',
  'onboarding.item_done': '入职待办更新',
  'onboarding.completed': '入职闭环完成',
  'onboarding.document_added': '提交入职材料',
  'contract.created': '生成劳动合同',
  'contract.sent': '合同发送签署',
  'contract.signed': '合同签署完成',
  'webhook.fired': '自动化通知（Webhook）',
};

const CONCLUSION_COLOR: Record<string, string> = {
  STRONG_YES: 'success',
  YES: 'success',
  NO: 'warning',
  STRONG_NO: 'error',
};

/** 可解释的匹配度报告（AI 输出必须给出打分依据） */
function MatchReportView({ report }: { report: MatchReport }) {
  return (
    <div className="match-report">
      <Typography.Paragraph className="match-report-line">
        <strong>亮点：</strong>
        {report.highlights}
      </Typography.Paragraph>
      <Typography.Paragraph className="match-report-line">
        <strong>风险：</strong>
        {report.risks}
      </Typography.Paragraph>
      {report.hits.length > 0 && (
        <div className="u-mb-4">
          <span className="u-meta u-secondary">命中要求：</span>
          {report.hits.map((h) => (
            <Tag key={h} color="success" className="u-meta">
              {h}
            </Tag>
          ))}
        </div>
      )}
      {report.misses.length > 0 && (
        <div className="u-mb-4">
          <span className="u-meta u-secondary">缺失要求：</span>
          {report.misses.map((m) => (
            <Tag key={m} color="warning" className="u-meta">
              {m}
            </Tag>
          ))}
        </div>
      )}
      {report.aiMeta && (
        <div className="u-meta u-muted">
          来源：{report.aiMeta.provider}
          {report.aiMeta.provider === 'mock' && '（规则引擎，配置 ANTHROPIC_API_KEY 启用大模型）'}
        </div>
      )}
    </div>
  );
}

function InterviewBlock({
  interview,
  onEvaluate,
  canEvaluate,
}: {
  interview: Interview;
  onEvaluate: (id: string) => void;
  canEvaluate: boolean;
}) {
  return (
    <div className="iv-block">
      <Space className="space-between">
        <Space size={8}>
          <Tag>第 {interview.round} 轮</Tag>
          <span className="u-meta">
            {interview.scheduledAt
              ? dayjs(interview.scheduledAt).format('MM-DD HH:mm')
              : '待定时间'}
          </span>
          <Tag>{INTERVIEW_STATUS_LABEL[interview.status as InterviewStatus] ?? interview.status}</Tag>
          <span className="u-meta u-secondary">
            面试官：{interview.interviewers.map((i) => i.user.name).join('、') || '-'}
          </span>
        </Space>
        {canEvaluate && (
          <Button size="small" onClick={() => onEvaluate(interview.id)}>
            提交面评
          </Button>
        )}
      </Space>
      {interview.evaluations.map((ev) => (
        <div key={ev.id} className="iv-eval">
          <Space size={8} wrap>
            <Typography.Text strong className="u-meta">
              {ev.interviewer.name}
            </Typography.Text>
            {ev.conclusion && (
              <Tag color={CONCLUSION_COLOR[ev.conclusion]}>
                {EVALUATION_CONCLUSION_LABEL[ev.conclusion as EvaluationConclusion] ?? ev.conclusion}
              </Tag>
            )}
            {ev.scorecard?.map((s) => (
              <span key={s.dimension} className="u-meta">
                {s.dimension} <Rate disabled value={s.score} className="u-meta" />
              </span>
            ))}
          </Space>
          {ev.comments && (
            <Typography.Paragraph className="iv-eval-comment">
              {ev.comments}
            </Typography.Paragraph>
          )}
        </div>
      ))}
    </div>
  );
}

function ApplicationCard({
  application,
  onSchedule,
  onEvaluate,
  onScore,
  onOffer,
  onReject,
  scoring,
}: {
  application: DetailApplication;
  onSchedule: (id: string, rounds: number) => void;
  onEvaluate: (id: string) => void;
  onScore: (id: string) => void;
  onOffer: (id: string) => void;
  onReject: (id: string) => void;
  scoring: boolean;
}) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const scoreTag =
    application.matchScore != null ? (
      <Tag color={application.matchScore >= 85 ? 'success' : application.matchScore >= 70 ? 'processing' : 'default'}>
        匹配 {application.matchScore}
      </Tag>
    ) : null;
  return (
    <Card
      size="small"
      className="u-mb-16"
      title={
        <Space>
          {application.job.title}
          <Tag>{application.stage.name}</Tag>
          <Tag>{APPLICATION_STATUS_LABEL[application.status as ApplicationStatus]}</Tag>
          {application.matchReport ? (
            <Popover title="AI 匹配报告" content={<MatchReportView report={application.matchReport} />}>
              <span className="u-pointer">{scoreTag}</span>
            </Popover>
          ) : (
            scoreTag
          )}
        </Space>
      }
      extra={
        <Space size={4}>
          {hasPermission(PERMISSIONS.APPLICATION_MOVE) && (
            <Button
              size="small"
              icon={<RobotOutlined />}
              loading={scoring}
              onClick={() => onScore(application.id)}
            >
              AI 评分
            </Button>
          )}
          {hasPermission(PERMISSIONS.INTERVIEW_SCHEDULE) && (
            <Button
              size="small"
              icon={<CalendarOutlined />}
              onClick={() => onSchedule(application.id, application.interviews.length)}
            >
              安排面试
            </Button>
          )}
          {hasPermission(PERMISSIONS.OFFER_INITIATE) && application.status === 'ACTIVE' && (
            <Button size="small" icon={<AuditOutlined />} onClick={() => onOffer(application.id)}>
              发起 Offer
            </Button>
          )}
          {hasPermission(PERMISSIONS.APPLICATION_MOVE) && application.status === 'ACTIVE' && (
            <Button size="small" danger onClick={() => onReject(application.id)}>
              淘汰
            </Button>
          )}
        </Space>
      }
    >
      {application.interviews.length === 0 ? (
        <Typography.Text type="secondary" className="u-meta">
          暂无面试安排
        </Typography.Text>
      ) : (
        application.interviews.map((interview) => (
          <InterviewBlock
            key={interview.id}
            interview={interview}
            onEvaluate={onEvaluate}
            canEvaluate={hasPermission(PERMISSIONS.EVALUATION_SUBMIT)}
          />
        ))
      )}
    </Card>
  );
}

interface Props {
  candidateId: string | null;
  onClose: () => void;
}

/** 360° 候选人详情：结构化信息 + 应聘/面评 + 简历 + 沟通时间轴 */
export function CandidateDetailDrawer({ candidateId, onClose }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [scheduleFor, setScheduleFor] = useState<{ id: string; rounds: number } | null>(null);
  const [evaluateFor, setEvaluateFor] = useState<string | null>(null);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [offerFor, setOfferFor] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [resumeForm] = Form.useForm();
  const [applyForm] = Form.useForm();
  const [offerForm] = Form.useForm();
  const [rejectForm] = Form.useForm();

  const detailQuery = useQuery({
    queryKey: ['candidate-detail', candidateId],
    queryFn: () => candidatesApi.get(candidateId!),
    enabled: Boolean(candidateId),
  });

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'options'],
    queryFn: () => jobsApi.list({ page: 1, pageSize: 100 }),
    enabled: applyOpen,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['candidate-detail', candidateId] });
    void queryClient.invalidateQueries({ queryKey: ['candidates'] });
    void queryClient.invalidateQueries({ queryKey: ['board'] });
  };

  const addResumeMutation = useMutation({
    mutationFn: (values: { rawText: string }) => candidatesApi.addResume(candidateId!, values),
    onSuccess: () => {
      message.success('简历已导入，可点击「AI 解析」提取结构化信息');
      setResumeOpen(false);
      resumeForm.resetFields();
      invalidate();
    },
    onError: (error) => message.error(extractErrorMessage(error, '导入失败')),
  });

  const uploadResumeMutation = useMutation({
    mutationFn: (file: File) => candidatesApi.addResumeFile(candidateId!, file),
    onSuccess: (resume) => {
      setResumeOpen(false);
      setResumeFile(null);
      resumeForm.resetFields();
      invalidate();
      if (resume.textExtracted) {
        message.success('原件已留档，文字抽取成功，正在自动进行 AI 解析…');
        parseMutation.mutate(resume.id);
      } else {
        message.warning('原件已留档，但未能抽取文字（扫描件/图片），请补充粘贴文本后再解析');
      }
    },
    onError: (error) => message.error(extractErrorMessage(error, '上传失败')),
  });

  const applyMutation = useMutation({
    mutationFn: (values: { jobId: string }) =>
      applicationsApi.create({ candidateId: candidateId!, jobId: values.jobId }),
    onSuccess: () => {
      message.success('已加入职位流程');
      setApplyOpen(false);
      applyForm.resetFields();
      invalidate();
    },
    onError: (error) => message.error(extractErrorMessage(error, '操作失败')),
  });

  const parseMutation = useMutation({
    mutationFn: resumesApi.parse,
    onSuccess: (resume) => {
      message.success(
        `简历解析完成，提取 ${resume.skills.length} 个技能标签` +
          ((resume as { aiMeta?: { provider: string } }).aiMeta?.provider === 'mock'
            ? '（规则引擎，配置 ANTHROPIC_API_KEY 启用大模型语义解析）'
            : ''),
      );
      invalidate();
    },
    onError: (error) => message.error(extractErrorMessage(error, '解析失败')),
  });

  const scoreMutation = useMutation({
    mutationFn: applicationsApi.score,
    onSuccess: () => {
      message.success('AI 匹配评分完成，点击分数标签查看依据');
      invalidate();
    },
    onError: (error) => message.error(extractErrorMessage(error, '评分失败')),
  });

  const rejectMutation = useMutation({
    mutationFn: (values: { reason: string; note?: string }) => boardApi.reject(rejectFor!, values),
    onSuccess: () => {
      message.success('已淘汰并留痕（原因码已记录，感谢信通道接入后将延迟发送）');
      setRejectFor(null);
      rejectForm.resetFields();
      invalidate();
    },
    onError: (error) => message.error(extractErrorMessage(error, '操作失败')),
  });

  const offerMutation = useMutation({
    mutationFn: (values: { salaryBase: number; bonusMonths?: number; grade?: string; note?: string }) =>
      offersApi.create({ applicationId: offerFor!, ...values }),
    onSuccess: () => {
      message.success('Offer 已发起，等待用人经理审批（见「录用管理」）');
      setOfferFor(null);
      offerForm.resetFields();
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['offers'] });
    },
    onError: (error) => message.error(extractErrorMessage(error, '发起失败')),
  });

  const detail: CandidateDetail | undefined = detailQuery.data;

  return (
    <Drawer
      title={
        detail ? (
          <Space>
            {detail.name}
            {detail.tags.map((t) => (
              <Tag key={t}>
                {t}
              </Tag>
            ))}
          </Space>
        ) : (
          '候选人详情'
        )
      }
      size={760}
      open={Boolean(candidateId)}
      onClose={onClose}
      destroyOnHidden
    >
      {detailQuery.isLoading || !detail ? (
        <div className="loading-center loading-center--lg">
          <Spin />
        </div>
      ) : (
        <>
          <Descriptions size="small" column={2} className="u-mb-16">
            <Descriptions.Item label="邮箱">{detail.email ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="电话">{detail.phone ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="来源">{detail.source ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="录入时间">
              {dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
          </Descriptions>

          <Tabs
            defaultActiveKey="applications"
            items={[
              {
                key: 'applications',
                label: `应聘记录 (${detail.applications.length})`,
                children: (
                  <>
                    {hasPermission(PERMISSIONS.APPLICATION_CREATE) && (
                      <Button
                        size="small"
                        icon={<PlusOutlined />}
                        className="u-mb-16"
                        onClick={() => setApplyOpen(true)}
                      >
                        加入职位流程
                      </Button>
                    )}
                    {detail.applications.length === 0 ? (
                      <Empty description="尚未应聘任何职位" />
                    ) : (
                      detail.applications.map((application) => (
                        <ApplicationCard
                          key={application.id}
                          application={application}
                          onSchedule={(id, rounds) => setScheduleFor({ id, rounds })}
                          onEvaluate={setEvaluateFor}
                          onScore={(id) => scoreMutation.mutate(id)}
                          onOffer={setOfferFor}
                          onReject={setRejectFor}
                          scoring={scoreMutation.isPending}
                        />
                      ))
                    )}
                  </>
                ),
              },
              {
                key: 'resumes',
                label: `简历 (${detail.resumes.length})`,
                children: (
                  <>
                    {hasPermission(PERMISSIONS.CANDIDATE_UPDATE) && (
                      <Button
                        size="small"
                        icon={<FileTextOutlined />}
                        className="u-mb-16"
                        onClick={() => setResumeOpen(true)}
                      >
                        导入简历文本
                      </Button>
                    )}
                    {detail.resumes.length === 0 ? (
                      <Empty description="暂无简历" />
                    ) : (
                      detail.resumes.map((resume) => (
                        <Card size="small" key={resume.id} className="u-mb-16">
                          <Space className="space-between">
                            <Space>
                              <FileTextOutlined />
                              {resume.fileName ?? '未命名简历'}
                              <Tag
                                color={
                                  resume.parseStatus === 'DONE'
                                    ? 'success'
                                    : resume.parseStatus === 'FAILED'
                                      ? 'error'
                                      : 'default'
                                }
                              >
                                {resume.parseStatus === 'DONE'
                                  ? '已解析'
                                  : resume.parseStatus === 'FAILED'
                                    ? '解析失败'
                                    : '待解析'}
                              </Tag>
                            </Space>
                            <Space size={8}>
                              {resume.fileKey && (
                                <Button
                                  size="small"
                                  icon={<PaperClipOutlined />}
                                  onClick={() =>
                                    resumesApi
                                      .fileUrl(resume.id)
                                      .then(({ url }) => window.open(url, '_blank'))
                                      .catch((error) =>
                                        message.error(extractErrorMessage(error, '获取原件链接失败')),
                                      )
                                  }
                                >
                                  原件
                                </Button>
                              )}
                              {resume.rawText && hasPermission(PERMISSIONS.CANDIDATE_UPDATE) && (
                                <Button
                                  size="small"
                                  icon={<RobotOutlined />}
                                  loading={parseMutation.isPending}
                                  onClick={() => parseMutation.mutate(resume.id)}
                                >
                                  {resume.parseStatus === 'DONE' ? '重新解析' : 'AI 解析'}
                                </Button>
                              )}
                              <span className="u-meta u-muted">
                                {dayjs(resume.createdAt).format('YYYY-MM-DD')}
                              </span>
                            </Space>
                          </Space>
                          {resume.skills.length > 0 && (
                            <div className="u-mt-8">
                              {resume.skills.map((s) => (
                                <Tag key={s}>{s}</Tag>
                              ))}
                            </div>
                          )}
                          {resume.parsed?.summary && (
                            <Typography.Paragraph className="resume-summary">
                              {resume.parsed.summary}
                            </Typography.Paragraph>
                          )}
                          {resume.rawText && (
                            <Typography.Paragraph
                              type="secondary"
                              className="resume-summary"
                              ellipsis={{ rows: 3, expandable: true, symbol: '展开全文' }}
                            >
                              {resume.rawText}
                            </Typography.Paragraph>
                          )}
                        </Card>
                      ))
                    )}
                  </>
                ),
              },
              {
                key: 'timeline',
                label: `时间轴 (${detail.timeline.length})`,
                children:
                  detail.timeline.length === 0 ? (
                    <Empty description="暂无操作记录" />
                  ) : (
                    <Timeline
                      items={detail.timeline.map((item) => ({
                        children: (
                          <div>
                            <Space size={8}>
                              <Typography.Text strong>
                                {ACTION_LABEL[item.action] ?? item.action}
                              </Typography.Text>
                              <span className="u-meta u-muted">
                                {item.actor?.name ?? item.actorName ?? '系统'} ·{' '}
                                {dayjs(item.createdAt).format('MM-DD HH:mm')}
                              </span>
                            </Space>
                            {item.action === 'application.stage_changed' && item.payload && (
                              <div className="u-meta u-secondary">
                                {String(item.payload.from)} → {String(item.payload.to)}
                              </div>
                            )}
                          </div>
                        ),
                      }))}
                    />
                  ),
              },
            ]}
          />

          <Modal
            title="导入简历"
            open={resumeOpen}
            classNames={{ body: 'modal-body-scroll' }}
            onCancel={() => {
              setResumeOpen(false);
              setResumeFile(null);
            }}
            onOk={() => {
              if (resumeFile) uploadResumeMutation.mutate(resumeFile);
              else resumeForm.submit();
            }}
            okText={resumeFile ? '上传原件' : '导入文本'}
            confirmLoading={addResumeMutation.isPending || uploadResumeMutation.isPending}
            destroyOnHidden
          >
            <Upload.Dragger
              accept=".pdf,.txt,.md"
              maxCount={1}
              beforeUpload={(file) => {
                setResumeFile(file as unknown as File);
                return false; // 不自动上传，点确定统一提交
              }}
              onRemove={() => setResumeFile(null)}
              className="u-mb-16"
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖入简历原件（PDF / 文本，≤10MB）</p>
              <p className="ant-upload-hint u-meta">
                原件入对象存储留档；PDF 自动抽取文字并进入 AI 解析
              </p>
            </Upload.Dragger>
            <Form
              form={resumeForm}
              layout="vertical"
              onFinish={(values) => addResumeMutation.mutate(values)}
              className="u-mt-16"
            >
              <Form.Item
                name="rawText"
                label="或直接粘贴简历全文"
                rules={
                  resumeFile ? [] : [{ required: true, min: 20, message: '请粘贴完整简历文本（至少 20 字）' }]
                }
              >
                <Input.TextArea rows={6} placeholder="粘贴候选人简历全文（与文件上传二选一）" disabled={Boolean(resumeFile)} />
              </Form.Item>
            </Form>
          </Modal>

          <Modal
            title="加入职位流程"
            open={applyOpen}
            onCancel={() => setApplyOpen(false)}
            onOk={() => applyForm.submit()}
            confirmLoading={applyMutation.isPending}
            destroyOnHidden
          >
            <Form form={applyForm} layout="vertical" onFinish={(values) => applyMutation.mutate(values)}>
              <Form.Item name="jobId" label="目标职位" rules={[{ required: true, message: '请选择职位' }]}>
                <Select
                  placeholder="选择职位"
                  loading={jobsQuery.isLoading}
                  options={jobsQuery.data?.items.map((j) => ({
                    value: j.id,
                    label: `${j.title}（${j.department.name}）`,
                  }))}
                />
              </Form.Item>
            </Form>
          </Modal>

          <Modal
            title={`发起 Offer · ${detail.name}`}
            open={Boolean(offerFor)}
            classNames={{ body: 'modal-body-scroll' }}
            onCancel={() => setOfferFor(null)}
            onOk={() => offerForm.submit()}
            confirmLoading={offerMutation.isPending}
            destroyOnHidden
          >
            <Form
              form={offerForm}
              layout="vertical"
              initialValues={{ bonusMonths: 3 }}
              onFinish={(values) => offerMutation.mutate(values)}
            >
              <Form.Item
                name="salaryBase"
                label="月薪（base，元）"
                rules={[{ required: true, message: '请填写月薪' }]}
              >
                <InputNumber
                  min={1000}
                  max={1000000}
                  step={1000}
                  className="u-w-full"
                  placeholder="如 30000"
                />
              </Form.Item>
              <Form.Item name="bonusMonths" label="年终奖（月数）">
                <InputNumber min={0} max={12} className="u-w-full" />
              </Form.Item>
              <Form.Item name="grade" label="职级">
                <Input placeholder="如 P6" maxLength={20} />
              </Form.Item>
              <Form.Item name="note" label="备注（审批人可见）">
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>
            </Form>
          </Modal>

          <Modal
            title="淘汰候选人（原因码强制）"
            open={Boolean(rejectFor)}
            onCancel={() => setRejectFor(null)}
            onOk={() => rejectForm.submit()}
            okButtonProps={{ danger: true }}
            okText="确认淘汰"
            confirmLoading={rejectMutation.isPending}
            destroyOnHidden
          >
            <Typography.Paragraph type="secondary" className="u-meta">
              淘汰为终态、不可逆（误操作需「重新激活」生成新应聘记录）；原因码用于漏斗分析与人才库回流。
            </Typography.Paragraph>
            <Form form={rejectForm} layout="vertical" onFinish={(values) => rejectMutation.mutate(values)}>
              <Form.Item name="reason" label="原因码" rules={[{ required: true, message: '必须选择原因码' }]}>
                <Select
                  placeholder="选择淘汰原因"
                  options={REJECT_REASONS.map((r) => ({ value: r, label: r }))}
                />
              </Form.Item>
              <Form.Item name="note" label="补充说明（可选）">
                <Input.TextArea rows={2} maxLength={300} />
              </Form.Item>
            </Form>
          </Modal>

          <ScheduleInterviewModal
            applicationId={scheduleFor?.id ?? null}
            existingRounds={scheduleFor?.rounds}
            onClose={() => setScheduleFor(null)}
          />
          <EvaluationModal interviewId={evaluateFor} onClose={() => setEvaluateFor(null)} />
        </>
      )}
    </Drawer>
  );
}
