'use client';

import { useCallback, useEffect, useState } from 'react';
import { sameSnapshot, type HistorySnapshot } from '@/lib/history';

const KEY = 'km:history:v1';
/** 키워드 하나당 남기는 스냅샷 개수 */
const MAX_PER_KEYWORD = 20;
/** 추적하는 키워드 가짓수 상한 — 넘으면 가장 오래전에 조회한 키워드부터 지운다 */
const MAX_KEYWORDS = 200;

type Store = Record<string, HistorySnapshot[]>;

function read(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

/**
 * 키워드별 분석 이력. `useFavorites` 와 같은 SSR 하이드레이션 패턴 —
 * 마운트 이후에만 읽고 쓴다.
 *
 * 매 조회마다 무한정 쌓이지 않도록 두 겹으로 캡을 둔다: 키워드당 최근
 * {@link MAX_PER_KEYWORD}개, 전체 키워드 가짓수 {@link MAX_KEYWORDS}개
 * (넘으면 가장 오래전에 손댄 키워드부터 삭제 — `cache.ts` 의 메모리
 * 캐시 정리 방식과 같다).
 */
export function useAnalysisHistory() {
  const [store, setStore] = useState<Store>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setStore(read());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      /* 저장 용량 초과 등은 조용히 무시 */
    }
  }, [store, ready]);

  /** 이번에 기록하기 '직전'의 마지막 스냅샷 — 비교 기준으로 쓴다 */
  const getPrevious = useCallback(
    (keyword: string): HistorySnapshot | null => {
      const list = store[keyword];
      return list && list.length > 0 ? list[list.length - 1] : null;
    },
    [store],
  );

  const record = useCallback((keyword: string, snapshot: HistorySnapshot) => {
    setStore((prev) => {
      const list = prev[keyword] ?? [];
      const last = list[list.length - 1];
      // 직전과 완전히 같은 값이면 저장하지 않는다 — 같은 키워드를 연달아
      // 눌러도 의미 없는 항목만 늘어나는 걸 막는다.
      if (last && sameSnapshot(last, snapshot)) return prev;

      const nextList = [...list, snapshot].slice(-MAX_PER_KEYWORD);
      const next: Store = { ...prev, [keyword]: nextList };

      const keys = Object.keys(next);
      if (keys.length > MAX_KEYWORDS) {
        // 각 키워드의 마지막 스냅샷 시각으로 가장 오래된 것부터 정리한다.
        const drop = keys
          .sort((a, b) => {
            const at = next[a][next[a].length - 1]?.at ?? 0;
            const bt = next[b][next[b].length - 1]?.at ?? 0;
            return at - bt;
          })
          .slice(0, keys.length - MAX_KEYWORDS);
        for (const k of drop) delete next[k];
      }

      return next;
    });
  }, []);

  return { ready, getPrevious, record };
}
