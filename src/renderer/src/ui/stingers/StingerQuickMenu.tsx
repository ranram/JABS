import { localizedNativeError } from '../../i18n/nativeErrors';
import { useRef, useState } from 'react';
import { Button, Menu, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import type { SelectedSetState } from '@shared/models';
import type { StingerState } from '@shared/stingers';
import { api } from '../../api';
import { useStingers } from '../../hooks/useStingers';
import { announcementPresentation } from '../announcementPresentation';

export function StingerQuickMenu({ activeSet, onConfigure }: { activeSet?: SelectedSetState; onConfigure(): void }) {
  const { t } = useTranslation('operator');
  const { state, setState, error, reconnectSources } = useStingers();
  const [working, setWorking] = useState(false);
  const pending = useRef(false);
  const winner = activeSet && announcementPresentation(activeSet)?.winner;
  const configured = (['perfect', 'winner'] as const).filter((kind) => state?.settings[kind].video);

  async function run(action: () => Promise<StingerState>) {
    if (pending.current) return;
    pending.current = true;
    setWorking(true);
    try {
      setState(await action());
    } catch (failure) {
      notifications.show({
        title: t('notices.actionFailed'),
        message: failure instanceof Error ? failure.message : t('stingers.failed'),
        color: 'red'
      });
    } finally {
      pending.current = false;
      setWorking(false);
    }
  }

  const actions: Array<{
    id: string;
    label: string;
    disabled: boolean;
    onClick(): void;
    color?: string;
    description?: string;
    play?: boolean;
  }> = configured.map((kind) => {
    const reason = working
      ? t('editor.waitAction')
      : error
        ? t('stingers.unavailable')
        : !state?.readySources
          ? t('stingers.activateSource')
          : kind === 'winner' && !winner
            ? t('stingers.noWinner')
            : undefined;
    return {
      id: kind,
      label: t('stingers.playClip', { name: t(`stingers.${kind}`) }),
      disabled: Boolean(reason),
      onClick: () => void run(() => api.playStinger(kind)),
      description: reason ?? state?.settings[kind].video?.name,
      play: true
    };
  });
  // Keep the English menu order as labels are translated.
  actions.unshift({ id: 'configure', label: t('stingers.configure'), disabled: false, onClick: onConfigure });
  actions.push(
    {
      id: 'reconnect',
      label: t('stingers.reconnect'),
      disabled: working,
      onClick: () => void run(reconnectSources)
    },
    {
      id: 'stop',
      label: t('stingers.stopBroadcast'),
      disabled: working,
      color: 'red',
      onClick: () => void run(api.stopStinger)
    }
  );
  return (
    <Menu position="bottom-start" shadow="md" width={300}>
      <Menu.Target>
        <Button
          data-tutorial="stinger-menu"
          size="compact-xs"
          variant={state?.cue ? 'light' : 'default'}
          color={state?.cue ? 'green' : undefined}
          leftSection={state?.cue ? <span aria-hidden="true">▶</span> : undefined}
          rightSection={<span aria-hidden="true">▾</span>}
        >
          {t('workspaces.stingers')}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t('stingers.readySources', { count: state?.readySources ?? 0 })}</Menu.Label>
        {state?.cue && (
          <Menu.Label>
            {t(state.cue.claimed ? 'stingers.playingClip' : 'stingers.queuedClip', {
              name: t(`stingers.${state.cue.kind}`)
            })}
          </Menu.Label>
        )}
        {(error || state?.playbackError) && (
          <Text role="alert" size="xs" c="red" px="sm" py="xs">
            {error ?? (state?.playbackError && localizedNativeError(state.playbackError))}
          </Text>
        )}
        {!state && !error && <Menu.Label>{t('stingers.loading')}</Menu.Label>}
        {state && !configured.length && <Menu.Label>{t('stingers.noClips')}</Menu.Label>}
        {actions.map((action) => (
          <Menu.Item
            key={action.id}
            color={action.color}
            disabled={action.disabled}
            onClick={action.onClick}
            leftSection={action.play ? <span aria-hidden="true">▶</span> : undefined}
          >
            {action.label}
            {action.description && (
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                {action.description}
              </Text>
            )}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
