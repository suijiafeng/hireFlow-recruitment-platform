import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EVALUATION_CONCLUSION_LABEL, EvaluationConclusion } from '@hireflow/shared';
import { App, Form, Input, Modal, Radio, Rate } from 'antd';
import { interviewsApi } from '../api';
import { extractErrorMessage } from '../api/client';

const DEFAULT_DIMENSIONS = ['技术能力', '工程素养', '沟通协作'];

interface Props {
  interviewId: string | null;
  onClose: () => void;
}

/** 结构化评分卡面评：多面试官口径一致、可横向对比 */
export function EvaluationModal({ interviewId, onClose }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  const submitMutation = useMutation({
    mutationFn: (values: {
      scores: Record<string, number>;
      conclusion: string;
      comments?: string;
    }) =>
      interviewsApi.submitEvaluation(interviewId!, {
        scorecard: DEFAULT_DIMENSIONS.map((dimension) => ({
          dimension,
          score: values.scores[dimension],
        })),
        conclusion: values.conclusion,
        comments: values.comments,
      }),
    onSuccess: () => {
      message.success('面评已提交');
      form.resetFields();
      onClose();
      void queryClient.invalidateQueries({ queryKey: ['candidate-detail'] });
      void queryClient.invalidateQueries({ queryKey: ['interviews'] });
    },
    onError: (error) => message.error(extractErrorMessage(error, '提交失败')),
  });

  return (
    <Modal
      title="提交面试评价"
      open={Boolean(interviewId)}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitMutation.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(values) => submitMutation.mutate(values)}>
        {DEFAULT_DIMENSIONS.map((dimension) => (
          <Form.Item
            key={dimension}
            name={['scores', dimension]}
            label={dimension}
            rules={[{ required: true, message: `请为「${dimension}」打分` }]}
          >
            <Rate allowClear={false} />
          </Form.Item>
        ))}
        <Form.Item name="conclusion" label="结论" rules={[{ required: true, message: '请选择结论' }]}>
          <Radio.Group
            options={Object.values(EvaluationConclusion).map((value) => ({
              value,
              label: EVALUATION_CONCLUSION_LABEL[value],
            }))}
          />
        </Form.Item>
        <Form.Item name="comments" label="评语">
          <Input.TextArea rows={4} placeholder="优缺点、技术亮点、风险提示…（二期支持 AI 生成草稿）" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
