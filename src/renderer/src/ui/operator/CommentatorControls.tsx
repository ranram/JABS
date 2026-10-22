import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Group, Kbd, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { sortByLabel } from './operatorUtils';
import { withCommentatorsSwapped, type CommentatorPresentation, type CommentatorState } from '@shared/commentators';
import type { LogoAsset } from '@shared/models';
import type { GameId, GameProfile } from '@shared/gameProfiles';
import { api } from '../../api';
import { COMMENTATORS_SWAPPED_EVENT, saveSwappedCommentators } from './swapCommentators';
import { OverlayLogoSelect } from './OverlayLogoSelect';
import { DestructiveButton } from '../DestructiveButton';

type CommentatorControlsProps = { logos: LogoAsset[]; profiles: GameProfile[]; sourceLinks?: ReactNode };

export function CommentatorControls({ logos, profiles, sourceLinks }: CommentatorControlsProps) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const [draft, setDraft] = useState<CommentatorState>();
  const [saving, setSaving] = useState(false);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const sortedProfiles = useMemo(
    () => sortByLabel(profiles, (profile) => profile.styleName, locale),
    [profiles, locale]
  );
  useEffect(() => {
    void api
      .commentatorState()
      .then(setDraft)
      .catch((error) =>
        notifyError(error, t('workspaces.commentator.failedTitle'), t('workspaces.commentator.failed'))
      );
  }, [t]);

  useEffect(() => {
    const handleCommentatorsSwapped = () => {
      setDraft((current) => (current ? withCommentatorsSwapped(current) : current));
    };
    window.addEventListener(COMMENTATORS_SWAPPED_EVENT, handleCommentatorsSwapped);
    return () => window.removeEventListener(COMMENTATORS_SWAPPED_EVENT, handleCommentatorsSwapped);
  }, []);

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
      notifyError(error, t('workspaces.commentator.failedTitle'), t('workspaces.commentator.failed'));
    } finally {
      setSaving(false);
    }
  }

  async function updateSettings(patch: Partial<Pick<CommentatorState, 'stylingGameId'>>) {
    if (!draft) return;
    setSaving(true);
    try {
      const next = await api.updateCommentatorState({ ...draft, ...patch });
      setDraft(next);
    } catch (error) {
      notifyError(error, t('workspaces.commentator.failedTitle'), t('workspaces.commentator.failed'));
    } finally {
      setSaving(false);
    }
  }

  function updateCommentator(index: 0 | 1, patch: Partial<CommentatorState['commentators'][number]>) {
    setDraft(
      (current) =>
        current && {
          ...current,
          commentators: current.commentators.map((commentator, commentatorIndex) =>
            commentatorIndex === index ? { ...commentator, ...patch } : commentator
          ) as CommentatorState['commentators']
        }
    );
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

  const heading = (
    <Group justify="space-between" align="center">
      <Text c="dimmed" size="sm" style={{ flex: '1 1 240px' }}>
        {t('workspaces.tools.commentators.description')}
      </Text>
      <Button ml="auto" variant="default" loading={saving} disabled={!draft} onClick={() => void swapCommentators()}>
        {t('workspaces.commentator.swap')} <Kbd ml="xs">Ctrl+Shift+C</Kbd>
      </Button>
    </Group>
  );
  if (!draft)
    return (
      <Stack gap="md">
        {heading}
        {sourceLinks}
        <Text c="dimmed" size="sm">
          {t('workspaces.commentator.loading')}
        </Text>
      </Stack>
    );
  return (
    <Stack gap="md">
      {heading}
      {sourceLinks}
      <SimpleGrid type="container" cols={{ base: 1, '36rem': 2 }}>
        {draft.commentators.map((commentator, index) => (
          <Stack key={index} gap="md">
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
      <SimpleGrid type="container" cols={{ base: 1, '36rem': 2 }}>
        <TextInput
          label={t('workspaces.commentator.tournament')}
          value={draft.tournamentName}
          onChange={(event) => setDraft({ ...draft, tournamentName: event.currentTarget.value })}
        />
        <Select
          label={t('workspaces.styling')}
          searchable
          value={draft.stylingGameId}
          disabled={saving}
          data={sortedProfiles.map((profile) => ({ value: profile.id, label: profile.styleName }))}
          onChange={(value) => value && void updateSettings({ stylingGameId: value as GameId })}
        />
        <OverlayLogoSelect
          logos={logos}
          assetId={draft.logoAssetId}
          disabled={saving}
          onChange={(logoAssetId) => setDraft({ ...draft, logoAssetId })}
        />
      </SimpleGrid>
      <Group grow preventGrowOverflow={false}>
        <Button loading={saving} onClick={() => void present('timed')}>
          {t('workspaces.commentator.presentTimed')}
        </Button>
        <Button variant="default" loading={saving} onClick={() => void present('persistent')}>
          {t('workspaces.commentator.showPersistent')}
        </Button>
        <DestructiveButton loading={saving} onClick={() => void present('hidden')}>
          {t('workspaces.commentator.hide')}
        </DestructiveButton>
      </Group>
    </Stack>
  );
}

function notifyError(error: unknown, title: string, fallback: string) {
  notifications.show({
    title,
    message: error instanceof Error ? error.message : fallback,
    color: 'red'
  });
}
