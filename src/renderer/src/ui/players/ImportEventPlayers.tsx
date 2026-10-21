import { Button, Group, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import { useOperatorNotifications } from '../operator/useOperatorNotifications';

export function ImportEventPlayers({ eventId }: { eventId: string }) {
  const { t } = useTranslation('operator');
  const notify = useOperatorNotifications();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setRunning(false);
    setStatus('');
    return () => {
      generation.current++;
    };
  }, [eventId]);
  async function importPlayers() {
    const run = ++generation.current;
    setRunning(true);
    setStatus('');
    let added = 0;
    try {
      for (let page = 1; ; page++) {
        const result = await api.importEventPlayers(eventId, page);
        if (generation.current !== run) return;
        added += result.added;
        setStatus(t('players.importProgress', { page, total: result.totalPages }));
        if (page >= result.totalPages) break;
      }
      setStatus('');
      notify(t('players.importDone', { count: added }), 'success');
    } catch (error) {
      if (generation.current === run) {
        setStatus('');
        notify(`${t('players.importFailed')} ${error instanceof Error ? error.message : ''}`.trim(), 'error');
      }
    } finally {
      if (generation.current === run) setRunning(false);
    }
  }
  return (
    <Group gap="xs">
      <Button variant="default" disabled={running || !eventId} onClick={() => void importPlayers()}>
        {t('players.importEvent')}
      </Button>
      {running && (
        <Button
          variant="subtle"
          onClick={() => {
            generation.current++;
            setRunning(false);
            setStatus('');
            notify(t('players.importStopped'), 'info');
          }}
        >
          {t('players.stopImport')}
        </Button>
      )}
      {status && (
        <Text size="sm" role="status">
          {status}
        </Text>
      )}
    </Group>
  );
}
