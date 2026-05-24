import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Form, Input, InputNumber, Radio, Result, Spin, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useParams } from 'react-router';
import { portalApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import { PortalShell } from './OfferPortalPage';

/** AI 预筛（V2 1.2）：邀约前核实硬性条件三问；不符项仅提示 HR，绝不自动淘汰 */
export function PrescreenPortalPage() {
  const { token = '' } = useParams();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{
    expectedSalary: number;
    availableDate: Dayjs;
    travelOk: boolean;
    note?: string;
  }>();

  const viewQuery = useQuery({
    queryKey: ['portal-prescreen', token],
    queryFn: () => portalApi.prescreenView(token),
    enabled: Boolean(token),
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: (values: { expectedSalary: number; availableDate: Dayjs; travelOk: boolean; note?: string }) =>
      portalApi.prescreenSubmit(token, {
        expectedSalary: values.expectedSalary,
        availableDate: values.availableDate.format('YYYY-MM-DD'),
        travelOk: values.travelOk,
        note: values.note,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['portal-prescreen', token], data);
      message.success('已提交，感谢您的配合！');
    },
    onError: (error) => message.error(extractErrorMessage(error, '提交失败，请稍后重试')),
  });

  const view = viewQuery.data;

  return (
    <PortalShell>
      <div className="portal-head">
        <Typography.Title level={4}>
          {view?.company ?? 'ART 科技有限公司'}
        </Typography.Title>
        <Typography.Text className="portal-head-sub">
          应聘意向确认
        </Typography.Text>
      </div>
      <Card>
        {viewQuery.isLoading ? (
          <div className="loading-center loading-center--lg">
            <Spin />
          </div>
        ) : viewQuery.isError || !view ? (
          <Result
            status="warning"
            title="链接无效或已失效"
            subTitle={extractErrorMessage(viewQuery.error, '请联系 HR 获取最新链接')}
          />
        ) : view.prescreen ? (
          <Result
            status="success"
            title="信息已提交"
            subTitle={`提交时间：${dayjs(view.prescreen.submittedAt).format(
              'YYYY-MM-DD HH:mm',
            )}。HR 会尽快与您联系安排后续环节。`}
          />
        ) : (
          <>
            <Typography.Title level={5} className="u-mt-0">
              {view.candidateName}，您好！
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              感谢您应聘「{view.jobTitle}」。为高效安排后续面试，请确认以下信息（约 1 分钟）：
            </Typography.Paragraph>
            <Form form={form} layout="vertical" onFinish={(v) => submitMutation.mutate(v)}>
              <Form.Item
                name="expectedSalary"
                label="期望月薪（税前，元）"
                rules={[{ required: true, message: '请填写期望月薪' }]}
              >
                <InputNumber
                  min={1000}
                  max={1_000_000}
                  step={1000}
                  className="u-w-full"
                  placeholder="如 30000"
                />
              </Form.Item>
              <Form.Item
                name="availableDate"
                label="最早可到岗日期"
                rules={[{ required: true, message: '请选择日期' }]}
              >
                <DatePicker className="u-w-full" minDate={dayjs()} />
              </Form.Item>
              <Form.Item
                name="travelOk"
                label="能否接受不定期出差"
                rules={[{ required: true, message: '请选择' }]}
              >
                <Radio.Group
                  options={[
                    { value: true, label: '可以接受' },
                    { value: false, label: '不方便出差' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="note" label="其他想提前说明的情况（可选）">
                <Input.TextArea rows={2} maxLength={300} placeholder="如：目前在职需一个月交接" />
              </Form.Item>
              <Button type="primary" block size="large" loading={submitMutation.isPending} htmlType="submit">
                提交
              </Button>
            </Form>
          </>
        )}
      </Card>
      <Typography.Paragraph type="secondary" className="portal-foot">
        本页面为免登录安全链接，信息仅用于招聘流程
      </Typography.Paragraph>
    </PortalShell>
  );
}
