import {
  Accordion,
  Badge,
  Checkbox,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useCallback, useMemo, useRef } from 'react';
import { bestOfOptionsForGame, type GameId, type GameProfile } from '@shared/gameProfiles';
import type { CountryOption, GameCharacterAsset, LogoAsset, SelectedSetState } from '@shared/models';
import { PlayerEditor } from './PlayerEditor';
import { MediaFolderControls } from './MediaFolderControls';
import { emptyToUndefined, sortByLabel } from './operatorUtils';
import { BufferedTextInput } from './BufferedTextInput';
import { maxCharactersForGame } from '@shared/characterTeams';
import { useCustomScoreboardManifest } from '../../hooks/useCustomScoreboard';

type BroadcastPatch = Partial<NonNullable<SelectedSetState['broadcast']>>;

type StreamEditorPanelProps = {
  draft: SelectedSetState;
  profiles: GameProfile[];
  countries: CountryOption[];
  logos: LogoAsset[];
  selectedProfile?: GameProfile;
  characters: readonly string[];
  characterAssets: readonly GameCharacterAsset[];
  dirty: boolean;
  saving: boolean;
  blocked: boolean;
  onPatch(patch: Partial<SelectedSetState>): void;
  onChangeStyling(gameId: GameId): void;
  onPatchBroadcast(patch: BroadcastPatch): void;
};

export function StreamEditorPanel({
  draft,
  profiles,
  countries,
  logos,
  selectedProfile,
  characters,
  characterAssets,
  dirty,
  saving,
  blocked,
  onPatch,
  onChangeStyling,
  onPatchBroadcast
}: StreamEditorPanelProps) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const customScoreboard = useCustomScoreboardManifest(
    draft.customScoreboardId,
    draft.customScoreboardRevision
  );
  const customStyleValue = draft.customScoreboardId
    ? `custom-scoreboard:${draft.customScoreboardId}`
    : undefined;
  const profileOptions = useMemo(
    () => {
      const options: Array<{ value: string; label: string }> = sortByLabel(
        profiles,
        (profile) => profile.styleName,
        locale
      ).map((profile) => ({
        value: profile.id,
        label: profile.styleName
      }));
      if (customStyleValue) options.unshift({
        value: customStyleValue,
        label: customScoreboard?.name
          ? `${t('operator:workspaces.customScoreboard')} · ${customScoreboard.name}`
          : t('operator:workspaces.customScoreboard')
      });
      return options;
    },
    [profiles, locale, customStyleValue, customScoreboard?.name, t]
  );
  const logoOptions = useMemo(
    () => sortByLabel(logos, (logo) => logo.label, locale).map((logo) => ({
      value: logo.id,
      label: logo.label
    })),
    [logos, locale]
  );
  const patchRef = useRef(onPatch);
  patchRef.current = onPatch;
  const changePlayerOne = useCallback((playerOne: SelectedSetState['playerOne']) => {
    patchRef.current({ playerOne });
  }, []);
  const changePlayerTwo = useCallback((playerTwo: SelectedSetState['playerTwo']) => {
    patchRef.current({ playerTwo });
  }, []);
  const extrasEnabled = Number(Boolean(draft.broadcast?.infoBarEnabled))
    + Number(Boolean(draft.broadcast?.logoEnabled));

  return (
    <Paper className="panel editor-panel" p="md" radius="lg" withBorder>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2} size="h4">{t('operator:editor.title')}</Title>
          <Text c="dimmed" size="sm">{t('operator:editor.description')}</Text>
        </div>
        {(dirty || saving) && (
          <Badge color={blocked ? 'red' : saving ? 'blue' : 'yellow'}>
            {t(blocked
              ? 'operator:editor.notSent'
              : saving
                ? 'operator:editor.saving'
                : 'operator:editor.savePending')}
          </Badge>
        )}
      </Group>

      <Stack gap="md" mt="md">
        <SimpleGrid type="container" cols={{ base: 1, '28rem': 2 }}>
          <BufferedTextInput
            label={t('operator:editor.detectedGame')}
            value={draft.gameName ?? selectedProfile?.label ?? draft.gameId}
            readOnly
          />
          <Select
            data-testid="editor-game"
            label={t('operator:editor.styling')}
            data={profileOptions}
            value={customStyleValue ?? draft.stylingGameId ?? draft.gameId}
            searchable
            allowDeselect={false}
            onChange={(value) => value && !value.startsWith('custom-scoreboard:')
              && onChangeStyling(value as GameId)}
          />
        </SimpleGrid>
        <Accordion
          variant="contained"
          radius="md"
          data-testid="broadcast-extras"
        >
          <Accordion.Item value="broadcast-extras">
            <Accordion.Control>
              <Group justify="space-between" pr="md">
                <Text fw={700}>{t('operator:broadcast.title')}</Text>
                <Text size="xs" c="dimmed">
                  {extrasEnabled
                    ? t('operator:broadcast.enabled', { count: extrasEnabled })
                    : t('operator:broadcast.optional')}
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                <Checkbox
                  data-testid="editor-info-bar-enabled"
                  checked={draft.broadcast?.infoBarEnabled ?? false}
                  label={t('operator:broadcast.showRails')}
                  onChange={(event) => onPatchBroadcast({ infoBarEnabled: event.currentTarget.checked })}
                />
                <SimpleGrid type="container" cols={{ base: 1, '30rem': 2 }}>
                  <BufferedTextInput
                    data-stream-free-text="infoLeft"
                    data-testid="editor-info-left"
                    label={t('operator:broadcast.leftRail')}
                    value={draft.broadcast?.infoLeft ?? ''}
                    disabled={!draft.broadcast?.infoBarEnabled}
                    placeholder={t('operator:broadcast.leftPlaceholder')}
                    onCommit={(value) => onPatchBroadcast({ infoLeft: emptyToUndefined(value) })}
                  />
                  <BufferedTextInput
                    data-stream-free-text="infoRight"
                    data-testid="editor-info-right"
                    label={t('operator:broadcast.rightRail')}
                    value={draft.broadcast?.infoRight ?? ''}
                    disabled={!draft.broadcast?.infoBarEnabled}
                    placeholder={t('operator:broadcast.rightPlaceholder')}
                    onCommit={(value) => onPatchBroadcast({ infoRight: emptyToUndefined(value) })}
                  />
                </SimpleGrid>
                <SimpleGrid
                  type="container"
                  cols={{ base: 1, '32rem': 2 }}
                  className="broadcast-logo-grid"
                >
                  <Checkbox
                    data-testid="editor-logo-enabled"
                    checked={draft.broadcast?.logoEnabled ?? false}
                    disabled={logos.length === 0}
                    label={t('operator:broadcast.showLogo')}
                    onChange={(event) => onPatchBroadcast({
                      logoEnabled: event.currentTarget.checked,
                      logoAssetId: draft.broadcast?.logoAssetId ?? logos[0]?.id
                    })}
                  />
                  <Select
                    data-testid="editor-logo-asset"
                    label={t('operator:broadcast.logo')}
                    data={logoOptions}
                    value={draft.broadcast?.logoAssetId ?? null}
                    disabled={logos.length === 0 || !draft.broadcast?.logoEnabled}
                    placeholder={t('operator:broadcast.chooseLogo')}
                    searchable
                    clearable
                    onChange={(value) => onPatchBroadcast({ logoAssetId: value ?? undefined })}
                  />
                </SimpleGrid>
                <Text size="xs" c="dimmed">{t('operator:broadcast.logoHint')}</Text>
                <MediaFolderControls kind="tourney-logos" label={t('operator:broadcast.tournamentLogosFolder')} />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
        <SimpleGrid type="container" cols={{ base: 1, '28rem': 2 }}>
          <Select
            data-testid="editor-best-of"
            label={t('operator:editor.matchLength')}
            data={bestOfOptionsForGame(draft.gameId).map((bestOf) => ({
              value: String(bestOf),
              label: t('common:match.bestOf', { count: bestOf })
            }))}
            value={String(draft.bestOf)}
            allowDeselect={false}
            onChange={(value) => value && onPatch({ bestOf: Number(value) })}
          />
          <BufferedTextInput
            data-stream-free-text="displayName"
            data-testid="editor-display-name"
            label={t('operator:editor.displayName')}
            value={draft.displayName}
            onCommit={(displayName) => onPatch({ displayName })}
          />
        </SimpleGrid>
        <SimpleGrid type="container" cols={{ base: 1, '28rem': 2 }}>
          <BufferedTextInput
            data-stream-free-text="round"
            data-testid="editor-round"
            label={t('operator:editor.round')}
            value={draft.round ?? ''}
            placeholder={t('operator:editor.roundPlaceholder')}
            onCommit={(value) => onPatch({ round: emptyToUndefined(value) })}
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

        <div className="player-editor-grid">
          <PlayerEditor
            side="one"
            title={t('operator:editor.playerOne')}
            player={draft.playerOne}
            countries={countries}
            characters={characters}
            characterAssets={characterAssets}
            maxCharacters={maxCharactersForGame(draft.gameId)}
            editableFields={selectedProfile?.editableFields ?? []}
            onChange={changePlayerOne}
          />
          <PlayerEditor
            side="two"
            title={t('operator:editor.playerTwo')}
            player={draft.playerTwo}
            countries={countries}
            characters={characters}
            characterAssets={characterAssets}
            maxCharacters={maxCharactersForGame(draft.gameId)}
            editableFields={selectedProfile?.editableFields ?? []}
            onChange={changePlayerTwo}
          />
        </div>
      </Stack>
    </Paper>
  );
}
