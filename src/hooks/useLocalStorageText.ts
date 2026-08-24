'use client';

import { useEffect, useState } from 'react';

/**
 * localStorage 에 저장되는 일반 텍스트 상태.
 *
 * `useFavorites` 와 같은 패턴 — SSR 하이드레이션 불일치를 피하려고 마운트
 * 이후에만 읽고, 저장도 그 이후에만 한다.
 *
 * 어디에 쓰나: "직접 확인한 타사 브랜드 추가" 처럼, 코드 수정 없이 사용자가
 * 스스로 늘려 가는 목록을 세션이 끝나도 남겨 두고 싶을 때. 즐겨찾기와 달리
 * 값이 구조화된 목록이 아니라 콤마/줄바꿈으로 구분한 자유 텍스트라
 * `useFavorites` 를 그대로 쓰기보다 이 쪽이 더 가볍다.
 */
export function useLocalStorageText(key: string, initial = ''): [string, (v: string) => void] {
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(raw);
    } catch {
      /* 저장소 접근 불가 등은 조용히 무시 — 초깃값으로 동작한다 */
    }
    setReady(true);
    // key 는 호출부에서 상수로 넘기는 것을 전제한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* 저장 용량 초과 등은 조용히 무시 */
    }
  }, [key, value, ready]);

  return [value, setValue];
}
