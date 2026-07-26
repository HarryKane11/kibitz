"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * localStorage 에 남는 UI 설정 (컬럼 선택, 저장된 뷰, 패널 폭…).
 *
 * `useEffect` 안에서 setState 로 읽어오는 흔한 패턴은 두 가지가 틀렸다:
 * 캐스케이드 렌더를 만들고, React Compiler 린트가 정당하게 막는다. localStorage 는
 * React 밖의 외부 저장소이므로 외부 저장소를 다루는 정식 훅으로 읽는다.
 *
 * 서버 스냅샷은 항상 `null` 이다 — 서버에는 localStorage 가 없으므로 폴백으로
 * 렌더되고, 하이드레이션 후 저장된 값으로 한 번 다시 렌더된다. 서버에서 저장값을
 * 추측하려 들면 그 순간 하이드레이션이 깨진다.
 */

const listeners = new Set<() => void>();

/** 읽기마다 localStorage 를 건드리면 getSnapshot 이 매번 새 값을 주고 루프가 난다. */
const cache = new Map<string, string | null>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // 다른 탭에서 바뀐 것도 반영한다
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

const serverSnapshot = () => null;

export function usePersisted<T>(key: string, fallback: T): [T, (next: T) => void] {
  const getSnapshot = useCallback(() => {
    if (!cache.has(key)) {
      try {
        cache.set(key, window.localStorage.getItem(key));
      } catch {
        cache.set(key, null); // 프라이빗 모드 등에서 접근이 막힐 수 있다
      }
    }
    return cache.get(key) ?? null;
  }, [key]);

  const raw = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);

  const value = useMemo(() => {
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // 저장 형식이 깨졌으면 폴백으로 간다. 설정 하나 때문에 화면이 죽으면 안 된다.
      return fallback;
    }
  }, [raw, fallback]);

  const set = useCallback(
    (next: T) => {
      const s = JSON.stringify(next);
      try {
        window.localStorage.setItem(key, s);
      } catch {
        // 저장에 실패해도 이번 세션 동안은 동작해야 한다
      }
      cache.set(key, s);
      emit();
    },
    [key],
  );

  return [value, set];
}
