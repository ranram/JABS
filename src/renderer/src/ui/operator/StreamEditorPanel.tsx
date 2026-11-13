import { Button, Group, Paper, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { StreamSaveBadge } from './StreamSaveBadge';
import { SetSelectorButton } from './SetSelectorButton';
import { QueueButton } from './MatchQueueControls';
import { DestructiveButton } from '../DestructiveButton';
import { streamSaveStatus } from './streamStatus';
import { PanelHeader } from '../PanelHeader';
import { useTranslation } from 'react-i18next';
import { useCallback, useId, useMemo, useRef, type ReactNode } from 'react';
import { type GameId, type GameProfile } from '@shared/gameProfiles';
import type { CountryOption, GameCharacterAsset, LogoAsset, SelectedSetState } from '@shared/models';
import { PlayerEditor } from './PlayerEditor';
import { StreamBroadcastControls } from './StreamBroadcastControls';
import { emptyToUndefined, sortByLabel } from './operatorUtils';
import { BufferedTextInput } from './BufferedTextInput';
import { maxCharactersForGame } from '@shared/characterTeams';
import { useCustomScoreboardManifest } from '../../hooks/useCustomScoreboard';
import { ScoreboardPhotoControls } from '../scoreboardPhotos/ScoreboardPhotoControls';
import { BroadcastScoreboardFontSelect } from '../fonts/BroadcastScoreboardFontSelect';
import {
  IconLabel,
  OperatorIcon,
  SlidersHorizontalIcon,
  ListChecksIcon,
  PencilSimpleIcon,
  TrashSimpleIcon
} from '../icons';

type BroadcastPatch = Partial<NonNullable<SelectedSetState['broadcast']>>;

type StreamEditorPanelProps = {
  draft: SelectedSetState;
  clearPlayersDisabled: boolean;
  onClearPlayers(): void;
  gameSelector?: ReactNode;
  renderLiveControls?(
    appearance: ReactNode,
    layout: (primary: ReactNode, secondary: ReactNode) => ReactNode
  ): ReactNode;
  profiles: GameProfile[];
  countries: CountryOption[];
  logos: LogoAsset[];
  selectedProfile?: GameProfile;
  characters: readonly string[];
  characterAssets: readonly GameCharacterAsset[];
  allowExhibitionFormats: boolean;
  dirty: boolean;
  saving: boolean;
  blocked: boolean;
  saveError?: string;
  onRetrySave?(): void;
  onPatch(patch: Partial<SelectedSetState>): void;
  onChangeStyling(gameId: GameId): void;
  onPatchBroadcast(patch: BroadcastPatch): void;
};

export function StreamEditorPanel({
  draft,
  clearPlayersDisabled,
  onClearPlayers,
  gameSelector,
  renderLiveControls,
  profiles,
  countries,
  logos,
  selectedProfile,
  characters,
  characterAssets,
  allowExhibitionFormats,
  dirty,
  saving,
  blocked,
  saveError,
  onRetrySave,
  onPatch,
  onChangeStyling,
  onPatchBroadcast
}: StreamEditorPanelProps) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const logoSelectId = useId();
  const clearPlayersHelpId = useId();
  const isExhibition = !draft.setId;
  const playerGameKey = draft.assetCatalogSlug ?? draft.gameId;
  const maxCharacters = maxCharactersForGame(playerGameKey);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const customScoreboard = useCustomScoreboardManifest(draft.customScoreboardId, draft.customScoreboardRevision);
  const customStyleValue = draft.customScoreboardId ? `custom-scoreboard:${draft.customScoreboardId}` : undefined;
  const profileOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = sortByLabel(
      profiles,
      (profile) => profile.styleName,
      locale
    ).map((profile) => ({
      value: profile.id,
      label: profile.styleName
    }));
    if (customStyleValue)
      options.unshift({
        value: customStyleValue,
        label: customScoreboard?.name
          ? `${t('operator:workspaces.customScoreboard')} · ${customScoreboard.name}`
          : t('operator:workspaces.customScoreboard')
      });
    return options;
  }, [profiles, locale, customStyleValue, customScoreboard?.name, t]);
  const patchRef = useRef(onPatch);
  patchRef.current = onPatch;
  const changePlayerOne = useCallback((playerOne: SelectedSetState['playerOne']) => {
    patchRef.current({ playerOne });
  }, []);
  const changePlayerTwo = useCallback((playerTwo: SelectedSetState['playerTwo']) => {
    patchRef.current({ playerTwo });
  }, []);
  const matchLengthOptions: Array<{ value: string; label: string }> = [
    { value: 'best-of:3', label: t('common:match.bestOf', { count: 3 }) },
    { value: 'best-of:5', label: t('common:match.bestOf', { count: 5 }) }
  ];
  if (allowExhibitionFormats) {
    for (const firstTo of [2, 3, 5, 7, 10]) {
      matchLengthOptions.push({
        value: `first-to:${firstTo}`,
        label: t('common:match.firstTo', { count: firstTo })
      });
    }
    matchLengthOptions.push({ value: 'topanga:7', label: t('common:match.topanga') });
  }
  let matchLengthValue = `best-of:${draft.bestOf}`;
  if (draft.matchFormat === 'first-to') matchLengthValue = `first-to:${Math.ceil(draft.bestOf / 2)}`;
  if (draft.matchFormat === 'topanga') matchLengthValue = 'topanga:7';

  const appearance = (
    <details className="operator-disclosure" data-testid="stream-appearance">
      <summary>
        <IconLabel icon={SlidersHorizontalIcon}>{t('operator:ux.scoreboardAppearance')}</IconLabel>
      </summary>
      <Stack className="operator-disclosure-content stream-appearance-content" gap="xs">
        <SimpleGrid type="container" cols={{ base: 1, '18rem': 2 }} spacing="xs">
          <Select
            data-testid="editor-game"
            label={t('operator:editor.styling')}
            data={profileOptions}
            value={customStyleValue ?? draft.stylingGameId ?? draft.gameId}
            searchable
            allowDeselect={false}
            onChange={(value) => value && !value.startsWith('custom-scoreboard:') && onChangeStyling(value as GameId)}
          />
          <BroadcastScoreboardFontSelect
            customActive={Boolean(draft.customScoreboardId)}
            customFont={customScoreboard?.typography.font}
          />
        </SimpleGrid>
        <ScoreboardPhotoControls selectedSet={draft} logoSelectId={logoSelectId} isExhibition={isExhibition} />

        <StreamBroadcastControls
          logoSelectId={logoSelectId}
          selectedSet={draft}
          broadcast={draft.broadcast}
          isExhibition={isExhibition}
          logos={logos}
          onChange={onPatchBroadcast}
        />
      </Stack>
    </details>
  );
  const matchFields = (
    <Stack gap="xs" className="stream-match-fields" data-exhibition={isExhibition || undefined}>
      {gameSelector ?? (
        <BufferedTextInput
          label={t('operator:editor.detectedGame')}
          value={draft.gameName ?? selectedProfile?.label ?? draft.gameId}
          readOnly
        />
      )}
      <Select
        data-testid="editor-best-of"
        label={t('operator:editor.matchLength')}
        data={matchLengthOptions}
        value={matchLengthValue}
        allowDeselect={false}
        onChange={(value) => {
          if (!value) return;
          const [matchFormat, length] = value.split(':') as [NonNullable<SelectedSetState['matchFormat']>, string];
          const amount = Number(length);
          onPatch({
            matchFormat,
            bestOf: matchFormat === 'best-of' ? amount : amount * 2 - 1
          });
        }}
      />

      {!isExhibition && (
        <BufferedTextInput
          data-stream-free-text="phase"
          data-testid="editor-phase"
          label={t('operator:browser.phase')}
          value={draft.phase ?? ''}
          onCommit={(value) => onPatch({ phase: emptyToUndefined(value) })}
        />
      )}
      <BufferedTextInput
        data-stream-free-text="round"
        data-testid="editor-round"
        label={t(isExhibition ? 'operator:editor.exhibitionName' : 'operator:editor.round')}
        value={draft.round ?? ''}
        placeholder={t('operator:editor.roundPlaceholder')}
        onCommit={(value) => onPatch({ round: emptyToUndefined(value) })}
      />
    </Stack>
  );
  const matchDetails = (
    <details className="operator-disclosure">
      <summary>
        <IconLabel icon={ListChecksIcon}>{t('operator:ux.matchDetails')}</IconLabel>
      </summary>
      <SimpleGrid className="operator-disclosure-content" type="container" cols={{ base: 1, '18rem': 2 }}>
        <BufferedTextInput
          data-stream-free-text="displayName"
          data-testid="editor-display-name"
          label={t(isExhibition ? 'operator:editor.exhibitionTitle' : 'operator:editor.displayName')}
          value={draft.displayName}
          onCommit={(displayName) => onPatch({ displayName })}
        />
        <BufferedTextInput
          data-stream-free-text="station"
          data-testid="editor-station"
          label={t('operator:editor.station')}
          value={draft.station ?? ''}
          placeholder={t('operator:editor.stationPlaceholder')}
          onCommit={(value) => onPatch({ station: emptyToUndefined(value) })}
        />
      </SimpleGrid>
    </details>
  );
  const playerTwoEditor = (
    <PlayerEditor
      libraryGameKey={isExhibition ? playerGameKey : undefined}
      side="two"
      title={t('operator:editor.playerTwo')}
      player={draft.playerTwo}
      countries={countries}
      characters={characters}
      characterAssets={characterAssets}
      showSeed={!isExhibition}
      maxCharacters={maxCharacters}
      editableFields={selectedProfile?.editableFields ?? []}
      onChange={changePlayerTwo}
    />
  );
  return (
    <Paper className="panel editor-panel combined-stream-panel" p="md" radius="lg" withBorder>
      <PanelHeader title={t('operator:editor.title')} icon={PencilSimpleIcon} inset="md">
        <Group gap="xs" justify="flex-end" wrap="wrap">
          <SetSelectorButton />
          <QueueButton />
          <DestructiveButton
            size="compact-sm"
            leftSection={<OperatorIcon icon={TrashSimpleIcon} />}
            disabled={clearPlayersDisabled}
            aria-describedby={clearPlayersHelpId}
            aria-keyshortcuts="Control+Shift+X"
            onClick={onClearPlayers}
          >
            {t('operator:editor.clearPlayers')}
          </DestructiveButton>
          <StreamSaveBadge status={streamSaveStatus(dirty, saving, blocked)} />
        </Group>
      </PanelHeader>

      <Stack gap="xs" mt="xs">
        <Text id={clearPlayersHelpId} size="xs" c="dimmed">
          {t('operator:editor.clearPlayersHelp')}
        </Text>
        {blocked && dirty && (
          <div className="stream-save-error" role="status">
            <Group justify="space-between" align="flex-start">
              <Text size="sm" c="red" flex={1}>
                {saveError ?? t('operator:ux.saveError')}
              </Text>
              {onRetrySave && (
                <Button size="compact-sm" variant="default" onClick={onRetrySave}>
                  {t('operator:ux.retrySave')}
                </Button>
              )}
            </Group>
          </div>
        )}
        <div className="stream-control-grid">
          <PlayerEditor
            libraryGameKey={isExhibition ? playerGameKey : undefined}
            side="one"
            title={t('operator:editor.playerOne')}
            player={draft.playerOne}
            countries={countries}
            characters={characters}
            characterAssets={characterAssets}
            showSeed={!isExhibition}
            maxCharacters={maxCharacters}
            editableFields={selectedProfile?.editableFields ?? []}
            onChange={changePlayerOne}
          />
          {renderLiveControls ? (
            renderLiveControls(appearance, (primary, secondary) => (
              <>
                <div className="stream-center-controls">
                  {matchFields}
                  {primary}
                </div>
                {playerTwoEditor}
                <div className="stream-secondary-controls">
                  {secondary}
                  {matchDetails}
                </div>
              </>
            ))
          ) : (
            <>
              <div className="stream-center-controls">
                {matchFields}
                {appearance}
                {matchDetails}
              </div>
              {playerTwoEditor}
            </>
          )}
        </div>
      </Stack>
    </Paper>
  );
}
