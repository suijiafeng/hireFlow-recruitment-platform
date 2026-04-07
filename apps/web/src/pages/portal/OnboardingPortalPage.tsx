import { CheckCircleFilled, EditOutlined, FileProtectOutlined, PlusOutlined } from '@ant-design/icons';
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
  Spin,
  Tag,
  Typography,
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
  const [docForm] = Form.useForm<{ type: string; rawText: string }>();

  const viewQuery = useQuery({
    queryKey: ['portal-onboarding', token],
    queryFn: () => portalApi.onboardingView(token),
    enabled: Boolean(token),
    retry: false,
  });

  const addDocMutation = useMutation({
    mutationFn: (values: { type: string; rawText: string }) => portalApi.onboardingAddDocument(token, values),
    onSuccess: (data) => {
      queryClient.setQueryData(['portal-onboarding', token], data);
      setDocOpen(false);
      docForm.resetFields();
      message.success('材料已提交，系统已自动识别关键信息');
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
      <div style={{ color: '#fff', marginBottom: 16, textAlign: 'center' }}>
        <Typography.Title level={4} style={{ color: '#fff', marginBottom: 4 }}>
          {view?.company ?? 'ART 科技有限公司'}
        </Typography.Title>
        <Typography.Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
          入职资料填报
        </Typography.Text>
      </div>

      {viewQuery.isLoading ? (
        <Card>
          <div style={{ textAlign: 'center', padding: 48 }}>
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
          <Card style={{ marginBottom: 12 }}>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              {view.candidateName}，欢迎加入！
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 8 }}>
              您入职的职位：{view.jobTitle}（{view.department}）
            </Typography.Paragraph>
            <Progress
              percent={Math.round((view.progress.done / view.progress.total) * 100)}
              size="small"
              status={view.status === 'COMPLETED' ? 'success' : 'active'}
            />
            {view.status === 'COMPLETED' && (
              <Alert type="success" showIcon title="入职流程已全部完成，期待您的到来！" style={{ marginTop: 12 }} />
            )}
          </Card>

          <Card size="small" title="需要您完成的事项" style={{ marginBottom: 12 }}>
            {myItems.map((item) => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                <CheckCircleFilled style={{ color: item.done ? '#52c41a' : '#d9d9d9' }} />
                <span style={{ flex: 1, color: item.done ? '#999' : undefined, textDecoration: item.done ? 'line-through' : 'none' }}>
                  {item.label}
                </span>
                {item.doneAt && (
                  <span style={{ fontSize: 11, color: '#bbb' }}>{dayjs(item.doneAt).format('MM-DD HH:mm')}</span>
                )}
              </div>
            ))}
            <Button
              type="primary"
              block
              icon={<PlusOutlined />}
              style={{ marginTop: 8 }}
              onClick={() => setDocOpen(true)}
              disabled={view.status === 'COMPLETED'}
            >
              提交证件材料
            </Button>
          </Card>

          {view.documents.length > 0 && (
            <Card size="small" title="已提交的材料" style={{ marginBottom: 12 }}>
              {view.documents.map((doc) => (
                <Card size="small" key={doc.type} style={{ marginBottom: 8 }} title={doc.label} type="inner">
                  <Descriptions size="small" column={1}>
                    {Object.entries(doc.fields).map(([k, v]) => (
                      <Descriptions.Item key={k} label={k}>
                        {v}
                      </Descriptions.Item>
                    ))}
                  </Descriptions>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    请核对识别结果，如有误请重新提交同类型材料覆盖
                  </Typography.Text>
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
            style={{ marginBottom: 12 }}
          >
            {!view.contract ? (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                合同尚未生成，请先完成材料提交，HR 确认后会发起签署。
              </Typography.Text>
            ) : (
              <>
                <Descriptions size="small" column={1} style={{ marginBottom: 8 }}>
                  <Descriptions.Item label="模板">{view.contract.templateName}</Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color={view.contract.signStatus === 'SIGNED' ? 'green' : 'blue'}>
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
                      <Typography.Text code style={{ fontSize: 12 }}>
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
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <CheckCircleFilled style={{ color: item.done ? '#52c41a' : '#d9d9d9' }} />
                <span style={{ flex: 1, fontSize: 13, color: '#666' }}>{item.label}</span>
                <Tag style={{ fontSize: 11 }}>{OWNER_LABEL[item.owner]}</Tag>
              </div>
            ))}
          </Card>

          <Modal
            title="提交证件材料"
            open={docOpen}
            onCancel={() => setDocOpen(false)}
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
              <Form.Item
                name="rawText"
                label="材料内容"
                rules={[{ required: true, min: 6, message: '请输入材料文本' }]}
                extra="当前为演示：粘贴证件上的文字，系统自动识别关键字段；正式环境为拍照上传"
              >
                <Input.TextArea rows={4} placeholder="如：姓名：杨帆 公民身份号码 110105199305124533 住址：…" />
              </Form.Item>
            </Form>
          </Modal>
        </>
      )}
      <Typography.Paragraph type="secondary" style={{ textAlign: 'center', fontSize: 12, marginTop: 12 }}>
        本页面为免登录安全链接，请勿转发给他人
      </Typography.Paragraph>
    </PortalShell>
  );
}
