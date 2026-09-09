import { useEffect, useMemo, useState } from 'react';
import { Button, Group, Kbd, Select, SimpleGrid, Stack, Switch, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { sortByLabel } from './operatorUtils';
import { MediaFolderControls } from './MediaFolderControls';
import type { CommentatorPresentation, CommentatorState } from '@shared/commentators';
import type { LogoAsset } from '@shared/models';
import type { GameId, GameProfile } from '@shared/gameProfiles';
import { api } from '../../api';
import { saveSwappedCommentators } from './swapCommentators';

type CommentatorControlsProps = { logos: LogoAsset[]; profiles: GameProfile[] };

export function CommentatorControls({ logos, profiles }: CommentatorControlsProps) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const [draft, setDraft] = useState<CommentatorState>();
  const [saving, setSaving] = useState(false);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const sortedProfiles = useMemo(() => sortByLabel(profiles, (profile) => profile.styleName, locale), [profiles, locale]);
  const logoOptions = useMemo(
    () => logos.map((logo) => ({ value: logo.id, label: logo.label }))
      .sort((one, two) => one.label.localeCompare(two.label)),
    [logos]
  );
  useEffect(() => {
    void api.commentatorState().then(setDraft).catch((error) => notifyError(
      error,
      t('workspaces.commentator.failedTitle'),
      t('workspaces.commentator.failed')
    ));
  }, [t]);

  async function present(presentation: CommentatorPresentation) {
    if (!draft) return;
    setSaving(true);
    try {
      const next = await api.updateCommentatorState({ ...draft, presentation });
      setDraft(next);
      notifications.show({
        title: t('notices.done'),
        message: t(`workspaces.commentator.${presentation}`),
        color: presentation === 'hidden' ? 'gray' : 'green'
      });
    } catch (error) {
      notifyError(
        error,
        t('workspaces.commentator.failedTitle'),
        t('workspaces.commentator.failed')
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateSettings(patch: Partial<Pick<CommentatorState, 'stylingGameId' | 'showTournamentLogo'>>) {
    if (!draft) return;
    setSaving(true);
    try {
      const next = await api.updateCommentatorState({ ...draft, ...patch });
      setDraft(next);
    } catch (error) {
      notifyError(
        error,
        t('workspaces.commentator.failedTitle'),
        t('workspaces.commentator.failed')
      );
    } finally {
      setSaving(false);
    }
  }

  function updateCommentator(index: 0 | 1, patch: Partial<CommentatorState['commentators'][number]>) {
    setDraft((current) => current && ({
      ...current,
      commentators: current.commentators.map((commentator, commentatorIndex) => (
        commentatorIndex === index ? { ...commentator, ...patch } : commentator
      )) as CommentatorState['commentators']
    }));
  }

  async function swapCommentators() {
    if (!draft) return;
    setSaving(true);
    try {
      setDraft(await saveSwappedCommentators(draft));
    } catch (error) {
      notifyError(error, t('workspaces.commentator.failedTitle'), t('workspaces.commentator.failed'));
    } finally {
      setSaving(false);
    }
  }

  if (!draft) return <Text c="dimmed" size="sm">{t('workspaces.commentator.loading')}</Text>;
  return (
    <Stack gap="md">
      <SimpleGrid type="container" cols={{ base: 1, '36rem': 2 }}>
        <Select
          label={t('workspaces.styling')}
          searchable
          value={draft.stylingGameId}
          disabled={saving}
          data={sortedProfiles.map((profile) => ({ value: profile.id, label: profile.styleName }))}
          onChange={(value) => value && void updateSettings({ stylingGameId: value as GameId })}
        />
        <TextInput
          label={t('workspaces.commentator.tournament')}
          value={draft.tournamentName}
          onChange={(event) => setDraft({ ...draft, tournamentName: event.currentTarget.value })}
        />
      </SimpleGrid>
      <Group align="flex-end" wrap="wrap">
        <Select
          style={{ flex: '1 1 320px' }}
          label={t('workspaces.commentator.logo')}
          searchable
          clearable
          value={draft.logoAssetId ?? null}
          data={logoOptions}
          onChange={(value) => setDraft({ ...draft, logoAssetId: value ?? undefined })}
        />
        <Button variant="default" loading={saving} onClick={() => void swapCommentators()}>
          {t('workspaces.commentator.swap')} <Kbd ml="xs">Ctrl+Shift+C</Kbd>
        </Button>
      </Group>
      <MediaFolderControls kind="tourney-logos" label={t('broadcast.tournamentLogosFolder')} />
      <Switch label={t('thumbnail.showTournamentLogo')} description={t('broadcast.sharedLogoHelp')}
        checked={draft.showTournamentLogo} disabled={saving}
        onChange={(event) => void updateSettings({ showTournamentLogo: event.currentTarget.checked })} />
      <SimpleGrid type="container" cols={{ base: 1, '36rem': 2 }}>
        {draft.commentators.map((commentator, index) => (
          <Stack key={index} gap="xs">
            <Text fw={800}>{t('workspaces.commentator.person', { count: index + 1 })}</Text>
            <TextInput
              label={t('workspaces.commentator.name')}
              value={commentator.name}
              onChange={(event) => updateCommentator(index as 0 | 1, { name: event.currentTarget.value })}
            />
            <TextInput
              label={t('workspaces.commentator.handle')}
              value={commentator.handle}
              onChange={(event) => updateCommentator(index as 0 | 1, { handle: event.currentTarget.value })}
            />
          </Stack>
        ))}
      </SimpleGrid>
      <Group>
        <Button loading={saving} onClick={() => void present('timed')}>
          {t('workspaces.commentator.presentTimed')}
        </Button>
        <Button variant="default" loading={saving} onClick={() => void present('persistent')}>
          {t('workspaces.commentator.showPersistent')}
        </Button>
        <Button variant="subtle" color="gray" loading={saving} onClick={() => void present('hidden')}>
          {t('workspaces.commentator.hide')}
        </Button>
      </Group>
    </Stack>
  );
}

function notifyError(error: unknown, title: string, fallback: string) {
  notifications.show({
    title,
    message: error instanceof Error ? error.message : fallback,
    color: 'red',
    autoClose: false
  });
}
