import { useMemo, type ReactNode } from 'react';
import { Button, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { sortByLabel } from './operatorUtils';
import type { LogoAsset } from '@shared/models';
import type { GameId, GameProfile } from '@shared/gameProfiles';
import type { CommentatorEditor } from './useCommentatorEditor';
import { OverlayLogoSelect } from './OverlayLogoSelect';
import { DestructiveButton } from '../DestructiveButton';
import { PanelHeader } from '../PanelHeader';
import { MicrophoneIcon } from '../icons';
import './commentatorControls.css';

type CommentatorControlsProps = {
  editor: CommentatorEditor;
  logos: LogoAsset[];
  profiles: GameProfile[];
  sourceLinks?: ReactNode;
};

export function CommentatorControls({ editor, logos, profiles, sourceLinks }: CommentatorControlsProps) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const sortedProfiles = useMemo(
    () => sortByLabel(profiles, (profile) => profile.styleName, locale),
    [profiles, locale]
  );
  const { draft, setDraft, saving, present, updateSettings, updateCommentator } = editor;
  if (!draft)
    return (
      <Stack gap="md">
        <Text c="dimmed" size="sm">
          {t('workspaces.commentator.loading')}
        </Text>
      </Stack>
    );
  return (
    <Stack className="commentator-controls" gap="md">
      <div className="commentator-appearance-row">
        <TextInput
          className="commentator-tournament-field"
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
      </div>
      <SimpleGrid type="container" cols={{ base: 1, '36rem': 2 }}>
        {draft.commentators.map((commentator, index) => (
          <Stack key={index} gap="md">
            <PanelHeader
              title={t('workspaces.commentator.person', { count: index + 1 })}
              icon={MicrophoneIcon}
              order={3}
            />
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
      <SimpleGrid className="operator-action-grid" type="container" cols={{ base: 1, '36rem': 3 }}>
        <Button loading={saving} onClick={() => void present('timed')}>
          {t('workspaces.commentator.presentTimed')}
        </Button>
        <Button variant="default" loading={saving} onClick={() => void present('persistent')}>
          {t('workspaces.commentator.showPersistent')}
        </Button>
        <DestructiveButton loading={saving} onClick={() => void present('hidden')}>
          {t('workspaces.commentator.hide')}
        </DestructiveButton>
      </SimpleGrid>
      {sourceLinks}
    </Stack>
  );
}
