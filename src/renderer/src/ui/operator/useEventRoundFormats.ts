import { useEffect, useState } from 'react';
import { api } from '../../api';

type RoundFormats = {
  eventId: string;
  formats: number[];
  status: 'loading' | 'ready' | 'error';
};

export function useEventRoundFormats(eventId?: string) {
  const [result, setResult] = useState<RoundFormats>();

  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    const formats = new Set<number>();

    function publish(status: RoundFormats['status']) {
      if (controller.signal.aborted || !eventId) return;
      setResult({ eventId, formats: [...formats].sort((a, b) => a - b), status });
    }

    async function load(currentEventId: string) {
      try {
        let totalPages = 1;
        for (let page = 1; page <= totalPages && formats.size < 10; page += 1) {
          const response = await api.roundFormats(currentEventId, page, controller.signal);
          if (controller.signal.aborted) return;
          for (const format of response.formats) formats.add(format);
          totalPages = response.totalPages;
          if (page < totalPages && formats.size < 10) publish('loading');
        }
        publish('ready');
      } catch {
        publish('error');
      }
    }

    publish('loading');
    void load(eventId);
    return () => controller.abort();
  }, [eventId]);

  return result?.eventId === eventId ? result : undefined;
}
