import { CharacterSelect } from '../operator/CharacterSelect';
import { DestructiveButton } from '../DestructiveButton';
import { PlayerLibraryField } from './PlayerLibraryField';
import { charactersForAssetCatalog } from '@shared/characterRosters';
import { maxCharactersForGame } from '@shared/characterTeams';
import { DisplayFlagSelect } from '../operator/DisplayFlagSelect';
import { loadGameCatalog } from '../operator/GameSelect';
import { sortByLabel } from '../operator/operatorUtils';
import { useOperatorNotifications } from '../operator/useOperatorNotifications';
import { ExternalLink } from '../operator/ExternalLink';
import { OperatorIcon, IdentificationCardIcon, ListChecksIcon } from '../icons';
import {
  Accordion,
  Paper,
  Title,
  Button,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  TagsInput,
  Text,
  TextInput
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryPlayer, PlayerGamePreferences } from '@shared/playerLibrary';
import type { CountryOption, GameCharacterAsset, SelectedSetState } from '@shared/models';
import { gameAssetCatalogSlug } from '@shared/gameAssetCatalog';
import { canonicalGameId, gameProfiles, gameIdForStartggVideogame } from '@shared/gameProfiles';
import { api } from '../../api';
import { PlayerHeadshotEditor } from './PlayerHeadshotEditor';
import { scoreboardPhotoLayout } from '@shared/scoreboardPhotos';

type Props = { player: LibraryPlayer; selectedSet?: SelectedSetState; onChange(player: LibraryPlayer): void };
const fields: Array<'name' | 'prefix' | 'xHandle' | 'pronouns' | 'nickname' | 'playerPhotoAssetId'> = [
  'name',
  'prefix'
];
export function PlayerLibraryEditor({ player, selectedSet, onChange }: Props) {
  const { t, i18n } = useTranslation('operator');
  const notify = useOperatorNotifications();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [gameKey, setGameKey] = useState(
    (selectedSet && scoreboardPhotoLayout(selectedSet)?.gameId) ?? player.games[0]?.gameKey ?? ''
  );
  const [games, setGames] = useState<Array<{ value: string; label: string }>>(
    Object.values(gameProfiles).map((game) => ({ value: game.id, label: game.label }))
  );
  const [assets, setAssets] = useState<GameCharacterAsset[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  useEffect(() => {
    let active = true;
    void api
      .countries()
      .then(({ countries }) => {
        if (active) setCountries(countries);
      })
      .catch(() => {});
    void loadGameCatalog()
      .then(({ games }) => {
        if (active)
          setGames([
            ...new Map(
              games.map((game) => {
                const value =
                  gameIdForStartggVideogame(game) ?? gameAssetCatalogSlug(game) ?? `startgg-game-${game.id}`;
                return [value, { value, label: game.name }];
              })
            ).values()
          ]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setAssets([]);
    if (gameKey)
      void api
        .gameCharacterAssets(gameKey)
        .then(({ assets }) => {
          if (active) setAssets(assets);
        })
        .catch(() => {
          if (active) notify(t('players.assetsFailed'), 'error');
        });
    return () => {
      active = false;
    };
  }, [gameKey, notify, t]);
  const game = player.games.find((game) => game.gameKey === gameKey);
  const updateGame = (patch: Partial<PlayerGamePreferences>) => {
    const next = { gameKey, characters: [], characterAssetId: null, portraitAssetId: null, ...game, ...patch };
    onChange({ ...player, games: [...player.games.filter((entry) => entry.gameKey !== gameKey), next] });
  };
  const gameOptions = useMemo(
    () =>
      sortByLabel(
        [
          ...games,
          ...player.games
            .filter((game) => !games.some((option) => option.value === game.gameKey))
            .map((game) => ({ value: game.gameKey, label: game.gameKey }))
        ],
        (option) => option.label,
        locale
      ),
    [games, player.games, locale]
  );
  const characterOptions = useMemo(
    () =>
      sortByLabel(
        [
          ...new Set([
            ...charactersForAssetCatalog(gameKey),
            ...assets.map((asset) => asset.character),
            ...(game?.characters ?? [])
          ])
        ],
        (character) => character,
        locale
      ),
    [gameKey, assets, game?.characters, locale]
  );
  const lead = assets.find((asset) => asset.character === game?.characters[0]);
  const artwork = [
    ...new Set([lead?.assetId, ...(lead?.variants.map((v) => v.assetId) ?? [])].filter((s): s is string => Boolean(s)))
  ];
  const portraits = [
    ...new Set(
      [lead?.portraitAssetId, ...(lead?.variants.map((v) => v.portraitAssetId) ?? [])].filter((s): s is string =>
        Boolean(s)
      )
    )
  ];
  const optionsWithSaved = (values: string[], saved?: string | null) =>
    saved && !values.includes(saved) ? [...values, saved] : values;
  return (
    <Stack gap="md">
      <Paper className="operator-inset" p="md" withBorder>
        <Stack gap="md">
          <Title order={4}>{t('players.detailsHeading')}</Title>

          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {fields.map((field) => (
              <PlayerLibraryField key={field} field={field} player={player} onChange={onChange} />
            ))}
          </SimpleGrid>
          <DisplayFlagSelect
            label={t('players.fields.displayFlag')}
            placeholder={t('editor.countrySearch')}
            countries={countries}
            country={player.overrides.country ?? player.imported.country ?? undefined}
            displayFlag={player.overrides.displayFlag || undefined}
            onChange={({ country, displayFlag }) =>
              onChange({
                ...player,
                overrides: { ...player.overrides, country: country ?? '', displayFlag: displayFlag ?? '', state: '' }
              })
            }
          />
          {(Object.hasOwn(player.overrides, 'country') || Object.hasOwn(player.overrides, 'displayFlag')) && (
            <Group>
              <Button
                size="compact-xs"
                variant="subtle"
                onClick={() => {
                  const overrides = { ...player.overrides };
                  delete overrides.country;
                  delete overrides.displayFlag;
                  delete overrides.state;
                  onChange({ ...player, overrides });
                }}
              >
                {t('players.useImported')}
              </Button>
            </Group>
          )}
          <TagsInput
            label={t('players.aliases')}
            value={player.aliases}
            maxTags={30}
            onChange={(aliases) => onChange({ ...player, aliases })}
          />
          <Accordion variant="contained">
            <Accordion.Item className="operator-inset" value="personal">
              <Accordion.Control icon={<OperatorIcon icon={ListChecksIcon} />}>
                {t('quickTools.moreDetails')}
              </Accordion.Control>
              <Accordion.Panel>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <NumberInput
                    label={t('players.fields.age')}
                    value={player.overrides.age ? Number(player.overrides.age) : ''}
                    min={1}
                    max={120}
                    allowDecimal={false}
                    allowNegative={false}
                    onChange={(age) => onChange({ ...player, overrides: { ...player.overrides, age: String(age) } })}
                  />
                  {(['xHandle', 'pronouns', 'nickname', 'playerPhotoAssetId'] as const).map((field) => (
                    <PlayerLibraryField key={field} field={field} player={player} onChange={onChange} />
                  ))}
                </SimpleGrid>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
          <Accordion variant="contained">
            <Accordion.Item className="operator-inset" value="identity">
              <Accordion.Control icon={<OperatorIcon icon={IdentificationCardIcon} />}>
                {t('players.identityHeading')}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="md">
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed">
                      {t('players.localId')}: {player.localId}
                    </Text>
                    {player.imported.profileSlug && (
                      <ExternalLink href={`https://www.start.gg/${player.imported.profileSlug}`}>
                        {t('players.profile')}
                      </ExternalLink>
                    )}
                  </Group>
                  <TextInput
                    label={t('players.startggId')}
                    value={player.playerId ?? ''}
                    readOnly={Boolean(player.seenAt && player.playerId)}
                    onChange={(event) => onChange({ ...player, playerId: event.currentTarget.value || null })}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
          <Text size="xs" c="dimmed">
            {t('players.overrideHelp')}
          </Text>
        </Stack>
      </Paper>
      <Paper className="operator-inset" p="md" withBorder>
        <Stack gap="md">
          <Title order={4}>{t('players.gamesHeading')}</Title>
          <Select
            searchable
            clearable
            label={t('players.game')}
            data={gameOptions}
            value={gameKey || null}
            onChange={(value) => setGameKey(value ?? '')}
          />
          {!gameKey && (
            <Text size="sm" c="dimmed">
              {t('players.chooseGameHelp')}
            </Text>
          )}
          {gameKey && (
            <>
              <CharacterSelect
                searchable
                label={t('players.characters')}
                maxValues={maxCharactersForGame(canonicalGameId(gameKey))}
                data={characterOptions}
                value={game?.characters ?? []}
                onChange={(characters) => updateGame({ characters, characterAssetId: null, portraitAssetId: null })}
              />
              <SimpleGrid cols={2}>
                <Select
                  searchable
                  clearable
                  label={t('players.artwork')}
                  data={optionsWithSaved(artwork, game?.characterAssetId)}
                  value={game?.characterAssetId ?? null}
                  onChange={(characterAssetId) => updateGame({ characterAssetId })}
                />
                <Select
                  searchable
                  clearable
                  label={t('players.portrait')}
                  data={optionsWithSaved(portraits, game?.portraitAssetId)}
                  value={game?.portraitAssetId ?? null}
                  onChange={(portraitAssetId) => updateGame({ portraitAssetId })}
                />
              </SimpleGrid>
              <DestructiveButton
                onClick={() => onChange({ ...player, games: player.games.filter((game) => game.gameKey !== gameKey) })}
              >
                {t('players.clearGame')}
              </DestructiveButton>
            </>
          )}
        </Stack>
      </Paper>
      <PlayerHeadshotEditor
        player={player}
        selectedSet={selectedSet}
        gameKey={gameKey}
        onChange={(scoreboardPhoto) => onChange({ ...player, scoreboardPhoto })}
      />
    </Stack>
  );
}
