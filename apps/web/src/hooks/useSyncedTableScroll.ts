import { useEffect, useRef } from 'react';

/**
 * 让容器内多张 antd Table 的横向滚动保持同步。
 *
 * 背景：分组列表是「每组一张 Table」。每张表都有自己的滚动容器（列固定 fixed:'right' 依赖它），
 * 于是各组各滚各的。若只在首组显示表头，任何一组横滚后列就和表头错位；若每组都放表头，
 * 一场面试的分组也顶着一行表头，列表几乎全是表头。
 *
 * 这里把各组的 scrollLeft 串起来：滚动任意一组，其余组跟随。首组的表头由 antd 自己跟随其表体，
 * 于是「只有一行表头 + 固定列 + 横向滚动」三者可以同时成立。
 *
 * scroll 事件不冒泡，所以只能逐个元素监听；DOM 由 antd 渲染，用 MutationObserver 兜住
 * 分组数量变化（切筛选、数据刷新）后重新绑定。
 */
export function useSyncedTableScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    // 正在由代码写入 scrollLeft，避免被写入方再次触发 scroll 造成回环
    let syncing = false;
    let bodies: HTMLElement[] = [];

    const onScroll = (e: Event) => {
      if (syncing) return;
      const src = e.currentTarget as HTMLElement;
      syncing = true;
      for (const el of bodies) if (el !== src) el.scrollLeft = src.scrollLeft;
      // 下一帧再解锁：被动写入触发的 scroll 事件是异步派发的
      requestAnimationFrame(() => {
        syncing = false;
      });
    };

    const bind = () => {
      for (const el of bodies) el.removeEventListener('scroll', onScroll);
      bodies = [...root.querySelectorAll<HTMLElement>('.ant-table-body')];
      for (const el of bodies) el.addEventListener('scroll', onScroll, { passive: true });
    };

    bind();
    const mo = new MutationObserver(bind);
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      for (const el of bodies) el.removeEventListener('scroll', onScroll);
    };
  }, []);

  return ref;
}
