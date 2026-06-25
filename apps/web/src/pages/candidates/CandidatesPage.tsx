import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS } from '@hireflow/shared';
import { App, Button, Form, Input, Modal, Select, Spin } from 'antd';
import dayjs from 'dayjs';
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { candidatesApi } from '../../api';
import { extractErrorMessage } from '../../api/client';
import type { Candidate } from '../../api/types';
import { CandidateDetailDrawer } from '../../components/CandidateDetailDrawer';
import { useAuthStore } from '../../stores/auth';

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;

const PAGE_SIZE = 20;

/** 匹配分色带：≥85 正向 / ≥70 主色 / 其余预警。与看板卡片、漏斗同一套规则 */
function scoreColor(score: number) {
  if (score >= 85) return '#059669';
  if (score >= 70) return '#2563EB';
  return '#B45309';
}

/** 阶段 Tag 用有序蓝阶，越靠后越深；终态走中性/正向 */
function stageTagClass(stage: string) {
  if (stage.includes('Offer')) return 'hf-tag hf-tag--ok';
  if (stage.includes('终面')) return 'hf-tag hf-tag--deep';
  if (stage.includes('面试') || stage.includes('沟通')) return 'hf-tag hf-tag--on';
  return 'hf-tag';
}

export function CandidatesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const candidatesQuery = useQuery({
    queryKey: ['candidates', page, keyword],
    queryFn: () => candidatesApi.list({ page, pageSize: PAGE_SIZE, keyword: keyword || undefined }),
  });

  const createMutation = useMutation({
    mutationFn: candidatesApi.create,
    onSuccess: (candidate) => {
      message.success(`候选人「${candidate.name}」已录入`);
      setCreateOpen(false);
      form.resetFields();
      void queryClient.invalidateQueries({ queryKey: ['candidates'] });
    },
    onError: (error) => message.error(extractErrorMessage(error, '录入失败')),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; values: Parameters<typeof candidatesApi.update>[1] }) =>
      candidatesApi.update(vars.id, vars.values),
    onSuccess: (candidate) => {
      message.success(`候选人「${candidate.name}」资料已更新`);
      setEditing(null);
      form.resetFields();
      void queryClient.invalidateQueries({ queryKey: ['candidates'] });
    },
    onError: (error) => message.error(extractErrorMessage(error, '更新失败')),
  });

  const openEdit = (candidate: Candidate) => {
    setEditing(candidate);
    form.setFieldsValue({
      name: candidate.name,
      email: candidate.email ?? undefined,
      phone: candidate.phone ?? undefined,
      source: candidate.source ?? undefined,
      tags: candidate.tags,
    });
  };

  const items = candidatesQuery.data?.items ?? [];
  const total = candidatesQuery.data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const maxPage = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="hf-page">
      {/* 控制栏：搜索 + 总数 + 操作。页标题由面包屑承担，不再有三段式页头与独立筛选卡 */}
      <div className="hf-bar">
        <div className="hf-bar-left">
          <Input.Search
            className="w-260"
            placeholder="搜索姓名、邮箱、电话、技能"
            allowClear
            onSearch={(value) => {
              setPage(1);
              setKeyword(value.trim());
            }}
          />
          <span className="hf-muted">
            共 <b className="hf-td--num">{total}</b> 人
          </span>
        </div>
        <div className="hf-bar-right">
          {hasPermission(PERMISSIONS.CANDIDATE_CREATE) && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新增候选人
            </Button>
          )}
        </div>
      </div>

      <div className="hf-body">
        {candidatesQuery.isLoading ? (
          <div className="hf-state-block">
            <Spin />
          </div>
        ) : items.length === 0 ? (
          <div className="hf-state-block">
            <div className="hf-state-icon">
              <TeamOutlined />
            </div>
            <div>
              <div className="hf-state-title">{keyword ? '没有匹配的候选人' : '候选人库还是空的'}</div>
              <div className="hf-state-desc">
                {keyword ? '换个关键词，或清空搜索查看全部。' : '导入简历或从人才库唤醒历史候选人后，这里会列出全部候选人。'}
              </div>
            </div>
            {keyword ? (
              <div className="hf-state-actions">
                <Button
                  onClick={() => {
                    setKeyword('');
                    setPage(1);
                  }}
                >
                  清空搜索
                </Button>
              </div>
            ) : (
              hasPermission(PERMISSIONS.CANDIDATE_CREATE) && (
                <div className="hf-state-actions">
                  <Button type="primary" onClick={() => setCreateOpen(true)}>
                    新增候选人
                  </Button>
                </div>
              )
            )}
          </div>
        ) : (
          /* 表格直接铺满，不再包 Card；表头 40、行高 48 */
          <div className="hf-table">
            <div className="hf-thead">
              <span className="hf-td w-150">姓名</span>
              <span className="hf-td w-96">匹配分</span>
              <span className="hf-td w-230">联系方式</span>
              <span className="hf-td w-110">来源</span>
              <span className="hf-td--grow">技能</span>
              <span className="hf-td--grow">应聘进展</span>
              <span className="hf-td hf-td--right w-96">录入</span>
              <span className="hf-td hf-td--right w-76">操作</span>
            </div>
            <div className="hf-tbody">
              {items.map((c) => {
                const app = c.applications?.[0];
                const score = (c as Candidate & { matchScore?: number | null }).matchScore ?? app?.matchScore ?? null;
                return (
                  <div key={c.id} className="hf-tr" onClick={() => setDetailId(c.id)}>
                    <span className="hf-td w-150 u-flex-gap-8">
                      <span className="hf-avatar">{c.name.charAt(0)}</span>
                      <span className="hf-primary hf-ellipsis">{c.name}</span>
                    </span>
                    {/* 匹配分：色点 + 数字 + 细条，与看板同一套色带 */}
                    <span className="hf-td w-96 u-flex-gap-6">
                      {score == null ? (
                        <span className="hf-muted">—</span>
                      ) : (
                        <>
                          <span className="hf-dot" style={cssVars({ background: scoreColor(score) })} />
                          <span className="hf-progress-num">{score}</span>
                          <span className="hf-bar-track hf-bar-track--thin">
                            <span
                              className="hf-bar-fill"
                              style={cssVars({ '--w': `${score}%`, '--c': scoreColor(score) })}
                            />
                          </span>
                        </>
                      )}
                    </span>
                    {/* 联系方式两行：邮箱在上、电话弱化在下 */}
                    <span className="hf-td w-230 contact-stack">
                      <span className="hf-secondary hf-ellipsis">{c.email ?? '-'}</span>
                      <span className="hf-faint hf-td--num">{c.phone ?? '-'}</span>
                    </span>
                    <span className="hf-td w-110 hf-secondary">{c.source ?? '-'}</span>
                    {/* 技能：一行点分文本，取代 4 个彩色 Tag */}
                    <span className="hf-td--grow hf-secondary hf-ellipsis" title={c.tags.join(' · ')}>
                      {c.tags.length ? c.tags.join(' · ') : '—'}
                    </span>
                    {/* 应聘进展：职位为文本，只有阶段用 Tag */}
                    <span className="hf-td--grow u-flex-gap-6">
                      {app ? (
                        <>
                          <span className="hf-secondary hf-ellipsis">{app.job.title}</span>
                          <span className={stageTagClass(app.stage.name)}>{app.stage.name}</span>
                          {(c.applications?.length ?? 0) > 1 && (
                            <span className="hf-faint">+{(c.applications?.length ?? 1) - 1}</span>
                          )}
                        </>
                      ) : (
                        <span className="hf-faint">未投递</span>
                      )}
                    </span>
                    <span className="hf-td hf-td--right hf-muted hf-td--num w-96">
                      {dayjs(c.createdAt).format('MM-DD')}
                    </span>
                    <span className="hf-td hf-td--right w-76">
                      {hasPermission(PERMISSIONS.CANDIDATE_UPDATE) ? (
                        <span
                          className="hf-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(c);
                          }}
                        >
                          编辑
                        </span>
                      ) : (
                        <span className="hf-link">详情</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="hf-panel-foot">
              <span>
                第 {from}–{to} 条 / 共 {total} 条
              </span>
              <span className="u-flex-gap-8">
                <Button size="small" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  上一页
                </Button>
                <span className="hf-td--num">
                  {page} / {maxPage}
                </span>
                <Button size="small" disabled={page >= maxPage} onClick={() => setPage(page + 1)}>
                  下一页
                </Button>
              </span>
            </div>
          </div>
        )}
      </div>

      <CandidateDetailDrawer candidateId={detailId} onClose={() => setDetailId(null)} />

      <Modal
        className="hf-modal"
        title={
          <>
            {editing ? '编辑候选人' : '新增候选人'}
            {editing && <div className="hf-modal-sub">{editing.name}</div>}
          </>
        }
        open={createOpen || editing != null}
        onCancel={() => {
          setCreateOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText={editing ? '保存' : '录入'}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) =>
            editing ? updateMutation.mutate({ id: editing.id, values }) : createMutation.mutate(values)
          }
        >
          <Form.Item name="name" label="姓名" rules={[{ required: true, min: 1 }]}>
            <Input placeholder="候选人姓名" />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
            <Input placeholder="name@example.com" />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input placeholder="手机号" />
          </Form.Item>
          <Form.Item name="source" label="来源渠道">
            <Select
              allowClear
              placeholder="选择来源"
              options={['BOSS直聘', '猎聘', '拉勾', '内推', '猎头推荐', '官网投递', '人才库唤醒'].map((s) => ({
                value: s,
                label: s,
              }))}
            />
          </Form.Item>
          <Form.Item name="tags" label="技能标签" extra="输入后回车，可多个；导入简历后由 AI 自动打标">
            <Select mode="tags" placeholder="如：React、TypeScript" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
