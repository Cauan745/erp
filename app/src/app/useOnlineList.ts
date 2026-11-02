import { useCallback, useRef, useState } from 'react';

import { readErrorMessage } from '../formatters';
import { Translator } from '../i18n';

// One read per list at a time. Writes invalidate reads that began before confirmation.
export function useOnlineList<T>(load: () => Promise<T[]>, t: Translator) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);
  const revision = useRef(0);
  const pending = useRef<Promise<void> | null>(null);

  const refresh = useCallback(() => {
    if (pending.current) return pending.current;
    if (attempted.current) setRefreshing(true);
    const startedAt = revision.current;
    const request = (async () => {
      try {
        const rows = await load();
        if (startedAt === revision.current) { setData(rows); setError(null); }
      } catch (failure) {
        if (startedAt === revision.current) setError(readErrorMessage(failure, t));
        throw failure;
      } finally {
        attempted.current = true;
        setLoading(false);
        setRefreshing(false);
        pending.current = null;
      }
    })();
    pending.current = request;
    return request;
  }, [load, t]);

  const refreshFresh = useCallback(async () => {
    // A foreground or post-write refresh must include changes after an existing read began.
    await pending.current?.catch(() => undefined);
    await refresh();
  }, [refresh]);
  const invalidate = () => { revision.current += 1; };
  const update = (change: (rows: T[]) => T[]) => { invalidate(); setData(change); };

  return { data, loading, refreshing, error, refresh, refreshFresh, invalidate, update };
}
