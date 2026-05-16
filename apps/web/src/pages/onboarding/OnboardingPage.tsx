import { FileProtectOutlined, IdcardOutlined, LinkOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CONTRACT_SIGN_STATUS_LABEL,
  DOCUMENT_TYPE_META,
  ONBOARDING_STATUS_LABEL,
  PERMISSIONS,
  type ContractSignStatus,
  type OnboardingStatus,
} from '@hireflow/shared';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Progress,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { onboardingApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import { QueryErrorResult } from '../../components/QueryErrorResult';
import type { ChecklistItem, Onboarding } from '../../api/types';
import { CardTitle } from '../../components/ui';
import { useAuthStore } from '../../stores/auth';

const OWNER_LABEL: Record<ChecklistItem['owner'], string> = {
  HR: 'HR 待办',
  IT: 'IT / 行政待办',
  NEW_HIRE: '新员工待办',
};

const SIGN_STEP: Record<string, number> = { DRAFT: 1, SENT: 2, SIGNED: 3, ARCHIVED: 3 };

function ChecklistGroup({
  onboarding,
  owner,
  canToggle,
  onToggle,
}: {
  onboarding: Onboarding;
  owner: ChecklistItem['owner'];
  canToggle: boolean;
  onToggle: (key: string, done: boolean) => void;
}) {
  const items = onboarding.checklist.filter((i) => i.owner === owner);
  return (
    <Card size="small" title={OWNER_LABEL[owner]} className="u-mb-12">
      <Space orientation="vertical" size={6} className="u-w-full">
        {items.map((item) => (
          <div key={item.key} className="check-row">
            <Checkbox checked={item.done} disabled={!canToggle} onChange={(e) => onToggle(item.key, e.target.checked)}>
              <span className={item.done ? 'check-done' : undefined}>
                {item.label}
              </span>
            </Checkbox>
            {item.doneAt && (
              <span className="u-meta u-faint">{dayjs(item.doneAt).format('MM-DD HH:mm')}</span>
            )}
          </div>
        ))}
      </Space>
    </Card>
  );
}

function OnboardingDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const [docOpen, setDocOpen] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docForm] = Form.useForm();

  const canManage = hasPermission(PERMISSIONS.ONBOARDING_MANAGE);
  /** 与服务端一致的勾选范围：MANAGE 全量；IT 勾 IT 项；新员工勾自己项 */
  const canToggleOwner = (owner: ChecklistItem['owner']) =>
    canManage ||
    (owner === 'IT' && roles.includes('IT_SUPPORT')) ||
    (owner === 'NEW_HIRE' && roles.includes('NEW_HIRE'));

  /** 生成/复制新员工免登录资料填报链接（H5） */
  const copyPortalLink = async (onboardingId: string) => {
    try {
      const { token } = await onboardingApi.portalLink(onboardingId);
      const url = `${window.location.origin}/portal/onboarding/${token}`;
      try {
        await navigator.clipboard.writeText(url);
        message.success('新员工链接已复制，请通过邮件/IM 发送');
      } catch {
        modal.info({
          title: '新员工资料填报链接',
          content: (
            <Typography.Text copyable className="u-break-all">
              {url}
            </Typography.Text>
          ),
        });
      }
    } catch (error) {
      message.error(extractErrorMessage(error, '获取链接失败'));
    }
  };

  const detailQuery = useQuery({
    queryKey: ['onboarding', id],
    queryFn: () => onboardingApi.get(id!),
    enabled: Boolean(id),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['onboarding', id] });
    void queryClient.invalidateQueries({ queryKey: ['onboardings'] });
    void queryClient.invalidateQueries({ queryKey: ['board'] });
  };

  const run = (fn: () => Promise<unknown>, success: string) => {
    fn()
      .then(() => {
        message.success(success);
        invalidate();
      })
      .catch((error) => message.error(extractErrorMessage(error, '操作失败')));
  };

  const addDocMutation = useMutation({
    mutationFn: (values: { type: string; rawText?: string }) =>
      docFile
        ? onboardingApi.addDocumentFile(id!, { ...values, file: docFile })
        : onboardingApi.addDocument(id!, values as { type: string; rawText: string }),
    onSuccess: (_data, values) => {
      if (docFile && !values.rawText) {
        message.warning('图片已留档；未提供文字层，材料标记「待人工核对」，请核对后手动勾选待办');
      } else {
        message.success('材料已入档，OCR 字段已抽取，对应待办自动勾选');
      }
      setDocOpen(false);
      setDocFile(null);
      docForm.resetFields();
      invalidate();
    },
    onError: (error) => message.error(extractErrorMessage(error, '入档失败')),
  });

  const detail = detailQuery.data;
  const contract = detail?.contract ?? null;

  return (
    <Drawer
      title={
        detail ? (
          <Space>
            {detail.application.candidate.name} · 入职流程
            <Tag color={detail.status === 'COMPLETED' ? 'green' : 'blue'}>
              {ONBOARDING_STATUS_LABEL[detail.status as OnboardingStatus] ?? detail.status}
            </Tag>
          </Space>
        ) : (
          '入职详情'
        )
      }
      size={720}
      open={Boolean(id)}
      onClose={onClose}
      destroyOnHidden
    >
      {!detail ? null : (
        <>
          {detail.status === 'COMPLETED' && (
            <Alert
              type="success"
              showIcon
              title="入职闭环完成"
              description="清单全部完成且合同已签署，候选人已标记为已入职（HIRED）。"
              className="u-mb-16"
            />
          )}
          {canManage && (
            <Button
              size="small"
              icon={<LinkOutlined />}
              className="u-mb-12"
              onClick={() => void copyPortalLink(detail.id)}
            >
              复制新员工资料填报链接（免登录 H5）
            </Button>
          )}
          <Descriptions size="small" column={2} className="u-mb-16">
            <Descriptions.Item label="职位">
              {detail.application.job.title}（{detail.application.job.department.name}）
            </Descriptions.Item>
            <Descriptions.Item label="进度">
              <Progress
                percent={Math.round((detail.progress.done / detail.progress.total) * 100)}
                size="small"
                className="w-140"
              />
            </Descriptions.Item>
            <Descriptions.Item label="邮箱">{detail.application.candidate.email ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="电话">{detail.application.candidate.phone ?? '-'}</Descriptions.Item>
          </Descriptions>

          <Typography.Title level={5} className="u-mt-0">
            三方待办清单
          </Typography.Title>
          {(['HR', 'IT', 'NEW_HIRE'] as const).map((owner) => (
            <ChecklistGroup
              key={owner}
              onboarding={detail}
              owner={owner}
              canToggle={canToggleOwner(owner)}
              onToggle={(key, done) =>
                run(() => onboardingApi.toggle(detail.id, key, done), done ? '已完成' : '已取消勾选')
              }
            />
          ))}

          <Typography.Title level={5}>
            入职材料{' '}
            {hasPermission(PERMISSIONS.ONBOARDING_UPLOAD) && (
              <Button size="small" icon={<PlusOutlined />} onClick={() => setDocOpen(true)}>
                提交材料
              </Button>
            )}
          </Typography.Title>
          {!detail.documents?.length ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无材料（提交后 OCR 自动抽取字段）" />
          ) : (
            detail.documents.map((doc) => (
              <Card
                size="small"
                key={doc.type}
                className="u-mb-8"
                title={
                  <Space size={8}>
                    {doc.label}
                    {doc.needsReview && <Tag color="gold">待人工核对</Tag>}
                  </Space>
                }
                extra={
                  doc.fileUrl ? (
                    <Button size="small" type="link" onClick={() => window.open(doc.fileUrl!, '_blank')}>
                      查看原件
                    </Button>
                  ) : null
                }
              >
                {Object.keys(doc.fields).length > 0 ? (
                  <Descriptions size="small" column={2}>
                    {Object.entries(doc.fields).map(([k, v]) => (
                      <Descriptions.Item key={k} label={k}>
                        {v}
                      </Descriptions.Item>
                    ))}
                  </Descriptions>
                ) : (
                  <Typography.Text type="warning" className="u-meta">
                    仅上传了图片、未识别出字段（低置信度阻断）：请打开原件人工核对，确认无误后手动勾选对应待办
                  </Typography.Text>
                )}
                <div className="doc-meta">
                  识别引擎：{doc.ocrProvider} · {dayjs(doc.addedAt).format('YYYY-MM-DD HH:mm')}
                  {doc.fileName ? ` · ${doc.fileName}` : ''}
                </div>
              </Card>
            ))
          )}

          <Typography.Title level={5}>
            <FileProtectOutlined /> 劳动合同（电子签）
          </Typography.Title>
          <Card size="small">
            <Steps
              size="small"
              current={contract ? SIGN_STEP[contract.signStatus] : 0}
              items={[{ title: '生成合同' }, { title: '发送签署' }, { title: '完成签署' }, { title: '存证归档' }]}
              className="u-mb-16"
            />
            {!contract ? (
              canManage ? (
                <Button type="primary" onClick={() => run(() => onboardingApi.createContract(detail.id), '合同已生成（模板变量自动填充）')}>
                  生成劳动合同
                </Button>
              ) : (
                <Typography.Text type="secondary">等待 HR 生成合同</Typography.Text>
              )
            ) : (
              <>
                <Descriptions size="small" column={2} className="u-mb-12">
                  <Descriptions.Item label="模板">{contract.templateName}</Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color={contract.signStatus === 'SIGNED' ? 'green' : 'blue'}>
                      {CONTRACT_SIGN_STATUS_LABEL[contract.signStatus as ContractSignStatus] ?? contract.signStatus}
                    </Tag>
                  </Descriptions.Item>
                  {Boolean(contract.variables?.candidateName) && (
                    <Descriptions.Item label="签署人">{String(contract.variables?.candidateName)}</Descriptions.Item>
                  )}
                  {contract.evidenceNo && (
                    <Descriptions.Item label="存证号">
                      <Typography.Text code copyable className="u-meta">
                        {contract.evidenceNo}
                      </Typography.Text>
                    </Descriptions.Item>
                  )}
                </Descriptions>
                <Space>
                  {contract.signStatus === 'DRAFT' && canManage && (
                    <Button type="primary" onClick={() => run(() => onboardingApi.sendContract(contract.id), '已发送至电子签服务商（新员工可在 H5 链接中签署）')}>
                      发送签署
                    </Button>
                  )}
                  {contract.signStatus === 'SENT' && canManage && (
                    <Button
                      type="primary"
                      onClick={() =>
                        run(() => onboardingApi.signContract(contract.id), '签署完成：已存证、通知 IT 开账号')
                      }
                    >
                      完成签署（代签/模拟回调）
                    </Button>
                  )}
                  {contract.signStatus === 'SIGNED' && (
                    <Typography.Text type="secondary" className="u-meta">
                      签署完成后已自动 Webhook 通知 IT 配置设备与账号（见候选人时间轴）
                    </Typography.Text>
                  )}
                </Space>
              </>
            )}
          </Card>

          <Modal
            title="提交入职材料"
            open={docOpen}
            onCancel={() => {
              setDocOpen(false);
              setDocFile(null);
            }}
            onOk={() => docForm.submit()}
            confirmLoading={addDocMutation.isPending}
            destroyOnHidden
          >
            <Form form={docForm} layout="vertical" onFinish={(values) => addDocMutation.mutate(values)}>
              <Form.Item name="type" label="材料类型" rules={[{ required: true, message: '请选择类型' }]}>
                <Select
                  placeholder="选择材料类型"
                  options={Object.entries(DOCUMENT_TYPE_META).map(([value, meta]) => ({
                    value,
                    label: meta.label,
                  }))}
                />
              </Form.Item>
              <Form.Item label="证件照片（可选）" extra="原件入对象存储留档；接入云 OCR 前图片不识图，纯图片将标记「待人工核对」">
                <Upload
                  accept="image/*,.pdf"
                  maxCount={1}
                  beforeUpload={(file) => {
                    setDocFile(file as unknown as File);
                    return false;
                  }}
                  onRemove={() => setDocFile(null)}
                >
                  <Button icon={<UploadOutlined />}>选择图片/PDF（≤10MB）</Button>
                </Upload>
              </Form.Item>
              <Form.Item
                name="rawText"
                label="材料文字内容"
                rules={docFile ? [{ min: 6, message: '材料内容过短' }] : [{ required: true, min: 6, message: '请输入材料文本' }]}
                extra="粘贴证件上的文字，OCR 引擎自动抽取关键字段并勾选待办；只传图片可留空"
              >
                <Input.TextArea rows={4} placeholder="如：姓名：杨帆 公民身份号码 110105199305124533 住址：…" />
              </Form.Item>
            </Form>
          </Modal>
        </>
      )}
    </Drawer>
  );
}

export function OnboardingPage() {
  const [detailId, setDetailId] = useState<string | null>(null);
  const listQuery = useQuery({ queryKey: ['onboardings'], queryFn: onboardingApi.list, retry: false });

  const pageTitle = (
    <CardTitle icon={<IdcardOutlined />}>
      入职管理
    </CardTitle>
  );

  if (listQuery.isError) {
    return (
      <Card title={pageTitle}>
        <QueryErrorResult error={listQuery.error} />
      </Card>
    );
  }

  return (
    <Card title={pageTitle}>
      <Typography.Paragraph type="secondary" className="u-meta u-mb-12">
        Offer 接受后自动生成入职单：三方清单（HR/IT/新员工）+ 材料收集（OCR）+ 电子签合同；全部完成即闭环为「已入职」
      </Typography.Paragraph>
      <Table<Onboarding>
        rowKey="id"
        loading={listQuery.isLoading}
        dataSource={listQuery.data}
        pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 张入职单` }}
        columns={[
          {
            title: '候选人',
            width: 120,
            render: (_, r) => (
              <Button type="link" size="small" className="u-p0" onClick={() => setDetailId(r.id)}>
                {r.application.candidate.name}
              </Button>
            ),
          },
          {
            title: '职位',
            render: (_, r) => `${r.application.job.title}（${r.application.job.department.name}）`,
          },
          {
            title: '清单进度',
            width: 180,
            render: (_, r) => (
              <Progress percent={Math.round((r.progress.done / r.progress.total) * 100)} size="small" />
            ),
          },
          {
            title: '合同',
            width: 100,
            render: (_, r) =>
              r.contract ? (
                <Tag color={r.contract.signStatus === 'SIGNED' ? 'green' : 'blue'}>
                  {CONTRACT_SIGN_STATUS_LABEL[r.contract.signStatus as ContractSignStatus]}
                </Tag>
              ) : (
                <span className="u-muted">未生成</span>
              ),
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 90,
            render: (v: string) => (
              <Tag color={v === 'COMPLETED' ? 'green' : 'processing'}>
                {ONBOARDING_STATUS_LABEL[v as OnboardingStatus] ?? v}
              </Tag>
            ),
          },
          {
            title: '创建时间',
            dataIndex: 'createdAt',
            width: 110,
            render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
          },
          {
            title: '操作',
            width: 80,
            render: (_, r) => (
              <Button type="link" size="small" onClick={() => setDetailId(r.id)}>
                详情
              </Button>
            ),
          },
        ]}
      />
      <OnboardingDetail id={detailId} onClose={() => setDetailId(null)} />
    </Card>
  );
}
