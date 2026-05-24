import { RobotOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_SCORECARD_TEMPLATE,
  EVALUATION_CONCLUSION_LABEL,
  EvaluationConclusion,
} from '@hireflow/shared';
import { App, Button, Form, Input, Modal, Radio, Rate, Typography } from 'antd';
import { useState } from 'react';
import { interviewsApi } from '../api';
import { extractErrorMessage } from '../api/client';

const DEFAULT_DIMENSIONS = DEFAULT_SCORECARD_TEMPLATE.map((t) => t.dimension);

interface Props {
  interviewId: string | null;
  /** 岗位评分卡模板维度；缺省用全局默认 */
  dimensions?: string[];
  onClose: () => void;
}

/** 结构化评分卡面评：AI 生成草稿 → 面试官修改确认 */
export function EvaluationModal({ interviewId, dimensions, onClose }: Props) {
  const dims = dimensions?.length ? dimensions : DEFAULT_DIMENSIONS;
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [notes, setNotes] = useState('');

  const draftMutation = useMutation({
    mutationFn: () => interviewsApi.draftEvaluation(interviewId!, notes),
    onSuccess: (draft) => {
      const scores: Record<string, number> = {};
      draft.scorecard.forEach((s) => {
        scores[s.dimension] = s.score;
      });
      form.setFieldsValue({ scores, conclusion: draft.conclusion, comments: draft.comments });
      message.success(
        draft.aiMeta.provider === 'mock'
          ? '草稿已生成（规则引擎，配置 ANTHROPIC_API_KEY 启用大模型）——请务必核对修改'
          : 'AI 草稿已生成，请核对修改后提交',
      );
    },
    onError: (error) => message.error(extractErrorMessage(error, '草稿生成失败')),
  });

  const submitMutation = useMutation({
    mutationFn: (values: {
      scores: Record<string, number>;
      conclusion: string;
      comments?: string;
    }) =>
      interviewsApi.submitEvaluation(interviewId!, {
        scorecard: dims.map((dimension) => ({
          dimension,
          score: values.scores[dimension],
        })),
        conclusion: values.conclusion,
        comments: values.comments,
      }),
    onSuccess: () => {
      message.success('面评已提交');
      form.resetFields();
      setNotes('');
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
      classNames={{ body: 'modal-body-scroll' }}
      onOk={() => form.submit()}
      confirmLoading={submitMutation.isPending}
      destroyOnHidden
    >
      <div className="copilot-box">
        <Typography.Text strong>
          <RobotOutlined /> 面试 Copilot
        </Typography.Text>
        <Typography.Paragraph type="secondary" className="copilot-desc">
          粘贴面试记录/要点，AI 生成评分卡草稿（最终以你修改确认的为准；三期接入实时转写）
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="如：候选人对高并发场景方案设计清晰，Redis 经验扎实，但分布式事务理解较浅…"
        />
        <Button
          size="small"
          icon={<RobotOutlined />}
          className="u-mt-8"
          loading={draftMutation.isPending}
          disabled={notes.trim().length < 10}
          onClick={() => draftMutation.mutate()}
        >
          生成草稿
        </Button>
      </div>

      <Form form={form} layout="vertical" onFinish={(values) => submitMutation.mutate(values)}>
        {dims.map((dimension) => (
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
          <Input.TextArea rows={4} placeholder="优缺点、技术亮点、风险提示…" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
