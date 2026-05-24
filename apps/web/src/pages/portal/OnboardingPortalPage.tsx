import {
  CameraOutlined,
  CheckCircleFilled,
  EditOutlined,
  FileProtectOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DOCUMENT_TYPE_META, CONTRACT_SIGN_STATUS_LABEL, type ContractSignStatus } from '@hireflow/shared';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Progress,
  Result,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useParams } from 'react-router';
import { portalApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { ChecklistItem } from '../../api/types';
import { PortalShell } from './OfferPortalPage';

const OWNER_LABEL: Record<ChecklistItem['owner'], string> = {
  HR: 'HR 为您准备',
  IT: 'IT 为您准备',
  NEW_HIRE: '需要您完成',
};

export function OnboardingPortalPage() {
  const { token = '' } = useParams();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [docOpen, setDocOpen] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docForm] = Form.useForm<{ type: string; rawText?: string }>();

  const viewQuery = useQuery({
    queryKey: ['portal-onboarding', token],
    queryFn: () => portalApi.onboardingView(token),
    enabled: Boolean(token),
    retry: false,
  });

  const addDocMutation = useMutation({
    mutationFn: (values: { type: string; rawText?: string }) =>
      docFile
        ? portalApi.onboardingAddDocumentFile(token, { ...values, file: docFile })
        : portalApi.onboardingAddDocument(token, values as { type: string; rawText: string }),
    onSuccess: (data, values) => {
      queryClient.setQueryData(['portal-onboarding', token], data);
      setDocOpen(false);
      setDocFile(null);
      docForm.resetFields();
      if (docFile && !values.rawText) {
        message.success('照片已提交，HR 将人工核对后确认');
      } else {
        message.success('材料已提交，系统已自动识别关键信息');
      }
    },
    onError: (error) => message.error(extractErrorMessage(error, '提交失败，请检查内容后重试')),
  });

  const signMutation = useMutation({
    mutationFn: () => portalApi.onboardingSignContract(token),
    onSuccess: (data) => {
      queryClient.setQueryData(['portal-onboarding', token], data);
      message.success('合同签署完成！');
    },
    onError: (error) => message.error(extractErrorMessage(error, '签署失败，请稍后重试')),
  });

  const view = viewQuery.data;
  const myItems = view?.checklist.filter((i) => i.owner === 'NEW_HIRE') ?? [];
  const companyItems = view?.checklist.filter((i) => i.owner !== 'NEW_HIRE') ?? [];
  const submittedTypes = new Set(view?.documents.map((d) => d.type));

  return (
    <PortalShell>
      <div className="portal-head">
        <Typography.Title level={4}>
          {view?.company ?? 'ART 科技有限公司'}
        </Typography.Title>
        <Typography.Text className="portal-head-sub">
          入职资料填报
        </Typography.Text>
      </div>

      {viewQuery.isLoading ? (
        <Card>
          <div className="loading-center loading-center--lg">
            <Spin />
          </div>
        </Card>
      ) : viewQuery.isError || !view ? (
        <Card>
          <Result
            status="warning"
            title="链接无效或已失效"
            subTitle={extractErrorMessage(viewQuery.error, '请联系 HR 获取最新链接')}
          />
        </Card>
      ) : (
        <>
          <Card className="u-mb-16">
            <Typography.Title level={5} className="u-mt-0">
              {view.candidateName}，欢迎加入！
            </Typography.Title>
            <Typography.Paragraph type="secondary" className="u-mb-8">
              您入职的职位：{view.jobTitle}（{view.department}）
            </Typography.Paragraph>
            <Progress
              percent={Math.round((view.progress.done / view.progress.total) * 100)}
              size="small"
              status={view.status === 'COMPLETED' ? 'success' : 'active'}
            />
            {view.status === 'COMPLETED' && (
              <Alert type="success" showIcon title="入职流程已全部完成，期待您的到来！" className="u-mt-16" />
            )}
          </Card>

          <Card size="small" title="需要您完成的事项" className="u-mb-16">
            {myItems.map((item) => (
              <div key={item.key} className="portal-check-row">
                <CheckCircleFilled className={item.done ? 'check-ico check-ico--done' : 'check-ico'} />
                <span className={item.done ? 'portal-check-label portal-check-label--done' : 'portal-check-label'}>
                  {item.label}
                </span>
                {item.doneAt && (
                  <span className="u-meta u-faint">{dayjs(item.doneAt).format('MM-DD HH:mm')}</span>
                )}
              </div>
            ))}
            <Button
              type="primary"
              block
              icon={<PlusOutlined />}
              className="u-mt-8"
              onClick={() => setDocOpen(true)}
              disabled={view.status === 'COMPLETED'}
            >
              提交证件材料
            </Button>
          </Card>

          {view.documents.length > 0 && (
            <Card size="small" title="已提交的材料" className="u-mb-16">
              {view.documents.map((doc) => (
                <Card
                  size="small"
                  key={doc.type}
                  className="u-mb-8"
                  type="inner"
                  title={
                    <Space size={6}>
                      {doc.label}
                      {doc.needsReview && <Tag color="warning">已收到，人工核对中</Tag>}
                    </Space>
                  }
                >
                  {doc.fileUrl && (
                    <img src={doc.fileUrl} alt={`${doc.label}照片`} className="portal-doc-img" />
                  )}
                  {Object.keys(doc.fields).length > 0 ? (
                    <>
                      <Descriptions size="small" column={1}>
                        {Object.entries(doc.fields).map(([k, v]) => (
                          <Descriptions.Item key={k} label={k}>
                            {v}
                          </Descriptions.Item>
                        ))}
                      </Descriptions>
                      <Typography.Text type="secondary" className="u-meta">
                        请核对识别结果，如有误请重新提交同类型材料覆盖
                      </Typography.Text>
                    </>
                  ) : (
                    <Typography.Text type="secondary" className="u-meta">
                      照片已成功上传，HR 核对后会为您勾选对应事项，无需重复提交
                    </Typography.Text>
                  )}
                </Card>
              ))}
            </Card>
          )}

          <Card
            size="small"
            title={
              <>
                <FileProtectOutlined /> 劳动合同
              </>
            }
            className="u-mb-16"
          >
            {!view.contract ? (
              <Typography.Text type="secondary">
                合同尚未生成，请先完成材料提交，HR 确认后会发起签署。
              </Typography.Text>
            ) : (
              <>
                <Descriptions size="small" column={1} className="u-mb-8">
                  <Descriptions.Item label="模板">{view.contract.templateName}</Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color={view.contract.signStatus === 'SIGNED' ? 'success' : 'processing'}>
                      {CONTRACT_SIGN_STATUS_LABEL[view.contract.signStatus as ContractSignStatus] ??
                        view.contract.signStatus}
                    </Tag>
                  </Descriptions.Item>
                  {Boolean(view.contract.variables?.salaryBase) && (
                    <Descriptions.Item label="月薪">
                      ¥{Number(view.contract.variables?.salaryBase).toLocaleString()}
                    </Descriptions.Item>
                  )}
                  {view.contract.evidenceNo && (
                    <Descriptions.Item label="存证号">
                      <Typography.Text code className="u-meta">
                        {view.contract.evidenceNo}
                      </Typography.Text>
                    </Descriptions.Item>
                  )}
                </Descriptions>
                {view.contract.signStatus === 'SENT' && (
                  <Button
                    type="primary"
                    block
                    icon={<EditOutlined />}
                    loading={signMutation.isPending}
                    onClick={() =>
                      modal.confirm({
                        title: '确认签署劳动合同？',
                        content: '请确认已阅读合同条款，签署后具有法律效力（当前为演示电子签）。',
                        okText: '确认签署',
                        onOk: () => signMutation.mutateAsync(),
                      })
                    }
                  >
                    签署合同
                  </Button>
                )}
              </>
            )}
          </Card>

          <Card size="small" title="公司同步为您准备中">
            {companyItems.map((item) => (
              <div key={item.key} className="portal-check-row">
                <CheckCircleFilled className={item.done ? 'check-ico check-ico--done' : 'check-ico'} />
                <span className="portal-company-item">{item.label}</span>
                <Tag className="tag-meta">{OWNER_LABEL[item.owner]}</Tag>
              </div>
            ))}
          </Card>

          <Modal
            title="提交证件材料"
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
                    label: submittedTypes.has(value) ? `${meta.label}（已提交，可覆盖）` : meta.label,
                  }))}
                />
              </Form.Item>
              <Form.Item label="拍照/选择图片" extra="照片将安全存档；如未填写下方文字，HR 将人工核对照片内容">
                <Upload
                  accept="image/*"
                  maxCount={1}
                  beforeUpload={(file) => {
                    setDocFile(file as unknown as File);
                    return false;
                  }}
                  onRemove={() => setDocFile(null)}
                >
                  <Button icon={<CameraOutlined />} block>
                    拍照或从相册选择
                  </Button>
                </Upload>
              </Form.Item>
              <Form.Item
                name="rawText"
                label="证件文字内容"
                rules={docFile ? [{ min: 6, message: '内容过短' }] : [{ required: true, min: 6, message: '请输入材料文本' }]}
                extra="粘贴证件上的文字可立即自动识别；只传照片则由 HR 人工核对"
              >
                <Input.TextArea rows={4} placeholder="如：姓名：杨帆 公民身份号码 110105199305124533 住址：…" />
              </Form.Item>
            </Form>
          </Modal>
        </>
      )}
      <Typography.Paragraph type="secondary" className="portal-foot">
        本页面为免登录安全链接，请勿转发给他人
      </Typography.Paragraph>
    </PortalShell>
  );
}
