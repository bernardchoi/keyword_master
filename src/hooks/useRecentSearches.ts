'use client';

import { useCallback, useEffect, useState } from 'react';

const KEY = 'km:recent-searches:v1';
const MAX_ITEMS = 20;

function read(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && item.length <= 40).slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function useRecentSearches() {
  const [list, setList] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setList(read());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(KEY, JSON.stringify(list));
  }, [list, ready]);

  const record = useCallback((keyword: string) => {
    setList((previous) => [keyword, ...previous.filter((item) => item !== keyword)].slice(0, MAX_ITEMS));
  }, []);
  const clear = useCallback(() => setList([]), []);

  return { list, record, clear, ready };
}
