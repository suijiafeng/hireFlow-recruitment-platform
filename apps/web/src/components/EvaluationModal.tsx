import { RobotOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_SCORECARD_TEMPLATE, EVALUATION_CONCLUSION_LABEL, EvaluationConclusion } from '@hireflow/shared';
import { App, Button, Form, Input, Modal } from 'antd';
import { useState } from 'react';
import { interviewsApi } from '../api';
import { extractErrorMessage } from '../api/client';

const DEFAULT_DIMENSIONS = DEFAULT_SCORECARD_TEMPLATE.map((t) => t.dimension);
const SCORES = [1, 2, 3, 4, 5];

interface Props {
  interviewId: string | null;
  /** 岗位评分卡模板维度；缺省用全局默认 */
  dimensions?: string[];
  /** 弹窗副标题的上下文（候选人 · 职位 · 轮次），可选 */
  subtitle?: string;
  onClose: () => void;
}

/** 1-5 分段打分：取代 Rate 星级——星级占地方、难比较、也不便键盘输入 */
function ScoreSegments({ value, onChange }: { value?: number; onChange?: (v: number) => void }) {
  return (
    <div className="hf-score">
      {SCORES.map((n) => (
        <span
          key={n}
          className={value === n ? 'is-on' : value != null && n < value ? 'is-below' : undefined}
          onClick={() => onChange?.(n)}
        >
          {n}
        </span>
      ))}
    </div>
  );
}

/** 结论分段：推荐档走正向色，不推荐档走预警/错误色 */
function ConclusionSegments({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  const items = Object.values(EvaluationConclusion);
  return (
    <div className="hf-conclusion">
      {items.map((v) => {
        const good = v === 'STRONG_YES' || v === 'YES';
        const cls = value === v ? (good ? 'is-on is-ok' : 'is-on is-warn') : undefined;
        return (
          <span key={v} className={cls} onClick={() => onChange?.(v)}>
            {EVALUATION_CONCLUSION_LABEL[v]}
          </span>
        );
      })}
    </div>
  );
}

/** 结构化评分卡面评：AI 生成草稿 → 面试官修改确认 */
export function EvaluationModal({ interviewId, dimensions, subtitle, onClose }: Props) {
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
        draft.aiMeta.provider === 'mock' ? '草稿已生成（规则引擎）——请务必核对修改' : 'AI 草稿已生成，请核对修改后提交',
      );
    },
    onError: (error) => message.error(extractErrorMessage(error, '草稿生成失败')),
  });

  const submitMutation = useMutation({
    mutationFn: (values: { scores: Record<string, number>; conclusion: string; comments?: string }) =>
      interviewsApi.submitEvaluation(interviewId!, {
        scorecard: dims.map((dimension) => ({ dimension, score: values.scores[dimension] })),
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
      className="hf-modal"
      width={560}
      title={
        <>
          提交面试评价
          {subtitle && <div className="hf-modal-sub">{subtitle}</div>}
        </>
      }
      open={Boolean(interviewId)}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="提交面评"
      confirmLoading={submitMutation.isPending}
      footer={(_, { OkBtn, CancelBtn }) => (
        <>
          <span className="hf-modal-hint">提交后面评不可修改，仅可追加补充说明</span>
          <CancelBtn />
          <OkBtn />
        </>
      )}
      destroyOnHidden
    >
      {/* AI 辅助区：中性灰底，不用蓝底 Alert */}
      <div className="hf-ai-box u-mb-16">
        <div className="hf-ai-head">
          <RobotOutlined /> 面试 Copilot
          <span className="hf-faint">规则引擎</span>
        </div>
        <div className="hf-ai-desc">粘贴面试记录，AI 生成评分卡草稿；最终以你修改确认的为准。</div>
        <Input.TextArea
          className="u-mt-8"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="如：候选人对高并发场景方案设计清晰，Redis 经验扎实，但分布式事务理解较浅…"
        />
        <div className="u-flex-between u-mt-8">
          <span className="hf-faint">至少 10 字后可生成</span>
          <Button
            size="small"
            icon={<RobotOutlined />}
            loading={draftMutation.isPending}
            disabled={notes.trim().length < 10}
            onClick={() => draftMutation.mutate()}
          >
            生成草稿
          </Button>
        </div>
      </div>

      <Form form={form} layout="vertical" onFinish={(values) => submitMutation.mutate(values)}>
        <div className="hf-caption u-mb-8">评分卡 · 岗位模板 {dims.length} 维</div>
        {dims.map((dimension) => (
          <Form.Item
            key={dimension}
            name={['scores', dimension]}
            label={dimension}
            rules={[{ required: true, message: `请为「${dimension}」打分` }]}
          >
            <ScoreSegments />
          </Form.Item>
        ))}

        <Form.Item name="conclusion" label="结论" rules={[{ required: true, message: '请选择结论' }]}>
          <ConclusionSegments />
        </Form.Item>

        <Form.Item name="comments" label="评语">
          <Input.TextArea rows={4} placeholder="优缺点、技术亮点、风险提示…" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
