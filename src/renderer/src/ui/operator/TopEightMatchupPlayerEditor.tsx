import { Paper, Select, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { GameCharacterAsset } from '@shared/models';
import type { TopEightMatchupsState } from '@shared/topEightMatchups';
import { BufferedTextInput } from './BufferedTextInput';
import { CharacterOutfitSelect } from './CharacterOutfitSelect';

type Matchup = TopEightMatchupsState['matchups'][number];
type Player = Matchup['players'][number];

export function TopEightMatchupPlayerEditor({
  player,
  bracket,
  matchNumber,
  playerNumber,
  characters,
  assets,
  onChange
}: {
  player: Player;
  bracket: Matchup['bracket'];
  matchNumber: number;
  playerNumber: number;
  characters: string[];
  assets: GameCharacterAsset[];
  onChange(patch: Partial<Player>): void;
}) {
  const { t } = useTranslation('operator');
  return (
    <Paper className="operator-inset" p="md" radius="md" miw={0} withBorder>
      <Text fw={800} mb="sm">
        {t(`topEightMatchups.${bracket}`)} {matchNumber} · {t('topEightMatchups.player', { number: playerNumber })}
      </Text>
      <Stack gap="sm">
        <BufferedTextInput
          label={t('topEight.playerTag')}
          value={player.name}
          onCommit={(name) => onChange({ name })}
        />
        <BufferedTextInput
          label={t('topEight.sponsor')}
          value={player.sponsor ?? ''}
          onCommit={(sponsor) => onChange({ sponsor: sponsor || undefined })}
        />
        <Select
          searchable
          clearable
          label={t('topEightMatchups.portrait')}
          value={player.character ?? null}
          data={characters}
          onChange={(character) => onChange({ character: character || undefined, characterAssetId: undefined, portraitAssetId: undefined })}
        />
        <CharacterOutfitSelect
          subject={player}
          assets={assets}
          mediaKind="portrait"
          onChange={(characterAssetId) => onChange({ characterAssetId, portraitAssetId: undefined })}
        />
      </Stack>
    </Paper>
  );
}
