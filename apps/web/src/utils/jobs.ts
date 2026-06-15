import type { Job } from '../api/types';

/**
 * 大盘/看板打开时默认选哪个职位。
 *
 * 职位列表按 createdAt 倒序，直接取 items[0] 会选中「最新创建的那个」——
 * 而最新创建的往往是刚建好、一个候选人都没有的岗位（甚至是随手建的测试岗），
 * 于是漏斗全 0、看板一片空白，看起来像整个系统没数据。
 * 这里优先挑「在招且已经有人在流程里」的职位，实在没有再退回第一个。
 */
export function pickDefaultJobId(items: Job[] | undefined): string | undefined {
  if (!items?.length) return undefined;
  const hasCandidates = (j: Job) => (j._count?.applications ?? 0) > 0;
  return (
    items.find((j) => j.status === 'OPEN' && hasCandidates(j))?.id ??
    items.find(hasCandidates)?.id ??
    items.find((j) => j.status === 'OPEN')?.id ??
    items[0].id
  );
}
