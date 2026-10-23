import { useCallback, useEffect, useRef, useState } from 'react';

/** Restores an account-scoped form draft and keeps it across unmounts/reloads. */
export function useFormDraft<T extends object>(
  key: string | null,
  value: T,
  restore: (draft: Partial<T> | null) => void,
) {
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const restoreRef = useRef(restore);
  const suppressNextWrite = useRef(false);
  restoreRef.current = restore;

  useEffect(() => {
    if (!key) {
      setReadyKey(null);
      return;
    }

    let draft: Partial<T> | null = null;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) draft = JSON.parse(stored) as Partial<T>;
    } catch {
      // Ignore malformed or unavailable browser storage and use empty fields.
    }
    restoreRef.current(draft);
    setReadyKey(key);
  }, [key]);

  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (!key || readyKey !== key) return;
    if (suppressNextWrite.current) {
      suppressNextWrite.current = false;
      return;
    }
    try {
      window.localStorage.setItem(key, serialized);
    } catch {
      // A full or disabled localStorage must not block form submission.
    }
  }, [key, readyKey, serialized]);

  return useCallback(() => {
    if (key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // The successful submission still proceeds when storage is unavailable.
      }
    }
    suppressNextWrite.current = true;
  }, [key]);
}
