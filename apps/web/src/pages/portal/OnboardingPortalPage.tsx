import {
  CameraOutlined,
  CheckOutlined,
  EditOutlined,
  FileProtectOutlined,
  PlusOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CONTRACT_SIGN_STATUS_LABEL, DOCUMENT_TYPE_META, type ContractSignStatus } from '@hireflow/shared';
import { App, Button, Form, Input, Modal, Result, Select, Spin, Upload } from 'antd';
import dayjs from 'dayjs';
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { portalApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { ChecklistItem } from '../../api/types';
import { PortalShell } from './InterviewPortalPage';

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;

const OWNER_LABEL: Record<ChecklistItem['owner'], string> = {
  HR: 'HR 准备',
  IT: 'IT 准备',
  NEW_HIRE: '需要您完成',
};

/** 清单项状态：待办 / 已完成 / HR 核对中 */
function ItemRow({ label, done, review, at }: { label: string; done: boolean; review?: boolean; at?: string | null }) {
  return (
    <div className="hf-check-row">
      <span className={done ? 'hf-check hf-check--on' : review ? 'hf-check hf-check--review' : 'hf-check'}>
        {done ? <CheckOutlined /> : null}
      </span>
      <span className={done ? 'hf-check-label hf-check-label--done' : 'hf-check-label'}>{label}</span>
      {review ? (
        <span className="hf-state--warn hf-review-note">HR 核对中</span>
      ) : done ? (
        at && <span className="hf-check-at">{dayjs(at).format('MM-DD HH:mm')}</span>
      ) : (
        <span className="hf-link">待填写</span>
      )}
    </div>
  );
}

/** 新员工资料填报（免登录 H5）：进度前置 + 分组清单 + 材料识别结果核对 */
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
      message.success(docFile && !values.rawText ? '照片已提交，HR 将人工核对后确认' : '材料已提交，系统已自动识别关键信息');
    },
    onError: (error) => message.error(extractErrorMessage(error, '提交失败，请稍后重试')),
  });

  const signMutation = useMutation({
    mutationFn: () => portalApi.onboardingSignContract(token),
    onSuccess: (data) => {
      queryClient.setQueryData(['portal-onboarding', token], data);
      message.success('合同已签署，感谢配合！');
    },
    onError: (error) => message.error(extractErrorMessage(error, '签署失败，请稍后重试')),
  });

  const view = viewQuery.data;

  if (viewQuery.isLoading)
    return (
      <PortalShell title="正在加载…">
        <div className="u-flex-center hf-min-200">
          <Spin />
        </div>
      </PortalShell>
    );

  if (viewQuery.isError || !view)
    return (
      <PortalShell title="链接无效或已失效">
        <Result
          status="warning"
          title="无法打开该链接"
          subTitle={extractErrorMessage(viewQuery.error, '请联系 HR 获取最新链接')}
        />
      </PortalShell>
    );

  const myItems = view.checklist.filter((i) => i.owner === 'NEW_HIRE');
  const companyItems = view.checklist.filter((i) => i.owner !== 'NEW_HIRE');
  const submittedTypes = new Set(view.documents.map((d) => d.type));
  const pct = Math.round((view.progress.done / view.progress.total) * 100);
  const nextTodo = myItems.find((i) => !i.done);
  const contract = view.contract;
  const reviewing = view.documents.filter((d) => d.needsReview).length;
  const done = view.status === 'COMPLETED';

  return (
    <PortalShell
      title={done ? '入职流程已全部完成' : '入职资料填报'}
      desc={`${view.candidateName} · ${view.jobTitle}（${view.department}）`}
      company={view.company}
      footer={
        done ? (
          <div className="hf-portal-legal">期待您的到来 · 免登录安全链接，请勿转发他人</div>
        ) : (
          <>
            {contract?.signStatus === 'SENT' ? (
              <Button
                type="primary"
                block
                icon={<EditOutlined />}
                loading={signMutation.isPending}
                onClick={() =>
                  modal.confirm({
                    title: '确认签署劳动合同？',
                    content: '请确认已阅读合同条款，签署后具有法律效力。',
                    okText: '确认签署',
                    onOk: () => signMutation.mutateAsync(),
                  })
                }
              >
                签署劳动合同
              </Button>
            ) : (
              <Button type="primary" block icon={<PlusOutlined />} onClick={() => setDocOpen(true)}>
                {nextTodo ? `继续：${nextTodo.label}` : '提交证件材料'}
              </Button>
            )}
            <div className="hf-portal-legal">进度自动保存，可随时关闭后再回来</div>
          </>
        )
      }
    >
      {/* 进度前置：一眼看到还差几项 */}
      <div className="hf-portal-progress">
        <div className="u-flex-between u-mb-4">
          <span className="hf-muted">完成进度</span>
          <span className="hf-progress-num">
            {view.progress.done} / {view.progress.total}
          </span>
        </div>
        <div className="hf-bar-track">
          <span
            className="hf-bar-fill"
            style={cssVars({ '--w': `${Math.max(pct, 2)}%`, '--c': done ? '#059669' : '#2563EB' })}
          />
        </div>
      </div>

      {reviewing > 0 && (
        <div className="hf-notice hf-notice--warn u-mb-16">
          <WarningOutlined />
          <span>{reviewing} 项材料已收到，HR 正在人工核对，无需重复提交。</span>
        </div>
      )}

      {/* 需要您完成 */}
      <div className="hf-caption u-mb-4">需要您完成</div>
      {myItems.map((item) => (
        <ItemRow key={item.key} label={item.label} done={item.done} at={item.doneAt} />
      ))}

      {/* 已提交材料：识别结果供核对 */}
      {view.documents.length > 0 && (
        <>
          <div className="hf-caption u-mt-16 u-mb-4">已提交的材料</div>
          {view.documents.map((doc) => (
            <div className="hf-portal-doc" key={doc.type}>
              <div className="u-flex-between">
                <span className="hf-secondary hf-strong">{doc.label}</span>
                {doc.needsReview ? (
                  <span className="hf-tag hf-tag--warn">人工核对中</span>
                ) : (
                  <span className="hf-tag hf-tag--ok">已识别</span>
                )}
              </div>
              {doc.fileUrl && <img src={doc.fileUrl} alt={`${doc.label}照片`} className="hf-portal-doc-img" />}
              {Object.keys(doc.fields).length > 0 ? (
                <>
                  {Object.entries(doc.fields).map(([k, v]) => (
                    <div className="hf-check-row hf-check-row--static" key={k}>
                      <span className="hf-muted hf-field-key hf-field-key--sm">{k}</span>
                      <span className="hf-check-label">{v}</span>
                    </div>
                  ))}
                  <div className="hf-faint u-mt-4">请核对识别结果，如有误可重新提交同类型材料覆盖</div>
                </>
              ) : (
                <div className="hf-faint u-mt-4">照片已上传，HR 核对后会为您勾选对应事项，无需重复提交</div>
              )}
            </div>
          ))}
        </>
      )}

      {/* 劳动合同 */}
      <div className="hf-caption u-mt-16 u-mb-4">
        <FileProtectOutlined /> 劳动合同
      </div>
      {!contract ? (
        <div className="hf-notice hf-notice--flat">
          <span>合同尚未生成，请先完成材料提交，HR 确认后会发起签署。</span>
        </div>
      ) : (
        <>
          <div className="hf-check-row hf-check-row--static">
            <span className="hf-muted hf-field-key hf-field-key--sm">模板</span>
            <span className="hf-check-label">{contract.templateName}</span>
          </div>
          <div className="hf-check-row hf-check-row--static">
            <span className="hf-muted hf-field-key hf-field-key--sm">状态</span>
            <span className="hf-check-label">
              <span
                className={contract.signStatus === 'SIGNED' || contract.signStatus === 'ARCHIVED' ? 'hf-state--ok' : ''}
              >
                {CONTRACT_SIGN_STATUS_LABEL[contract.signStatus as ContractSignStatus] ?? contract.signStatus}
              </span>
            </span>
          </div>
          {Boolean(contract.variables?.salaryBase) && (
            <div className="hf-check-row hf-check-row--static">
              <span className="hf-muted hf-field-key hf-field-key--sm">月薪</span>
              <span className="hf-check-label hf-td--num">
                ¥{Number(contract.variables?.salaryBase).toLocaleString()}
              </span>
            </div>
          )}
          {contract.evidenceNo && (
            <div className="hf-check-row hf-check-row--static">
              <span className="hf-muted hf-field-key hf-field-key--sm">存证号</span>
              <span className="hf-check-label hf-mono hf-td--num">{contract.evidenceNo}</span>
            </div>
          )}
        </>
      )}

      {/* 公司同步准备中 */}
      <div className="hf-caption u-mt-16 u-mb-4">公司同步为您准备</div>
      {companyItems.map((item) => (
        <div className="hf-check-row hf-check-row--static" key={item.key}>
          <span className={item.done ? 'hf-check hf-check--on' : 'hf-check'}>{item.done ? <CheckOutlined /> : null}</span>
          <span className={item.done ? 'hf-check-label hf-check-label--done' : 'hf-check-label'}>{item.label}</span>
          <span className="hf-faint">{OWNER_LABEL[item.owner]}</span>
        </div>
      ))}

      <Modal
        className="hf-modal"
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
          <Form.Item label="拍照 / 选择图片" extra="照片将安全存档；未填写下方文字时由 HR 人工核对">
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
            extra="粘贴证件文字可立即自动识别；只传照片则由 HR 人工核对"
          >
            <Input.TextArea rows={4} placeholder="如：姓名：杨帆 公民身份号码 110105199305124533 住址：…" />
          </Form.Item>
        </Form>
      </Modal>
    </PortalShell>
  );
}
