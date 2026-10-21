import { Alert, Button, Group, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playerLabel, type LibraryPlayer } from '@shared/playerLibrary';
import {
  defaultHeadshotCrop,
  scoreboardPhotoPlacement,
  scoreboardPhotoLayout,
  type ScoreboardPhoto
} from '@shared/scoreboardPhotos';
import type { SelectedSetState } from '@shared/models';
import { canonicalGameId } from '@shared/gameProfiles';
import { defaultMediaTransform, type MediaTransform } from '@shared/mediaPlacement';
import { PlayerHeadshotPreview } from './PlayerHeadshotPreview';
import { MediaControlHint } from '../operator/MediaControlHint';
import { api } from '../../api';
import { useCatalogRevision } from '../../hooks/useCatalogRevision';
import { MediaFolderControls } from '../operator/MediaFolderControls';
import { loadScoreboardPhoto, type LoadedScoreboardPhoto } from '../scoreboardPhotos/useScoreboardPhotoMedia';
import './playerHeadshotEditor.css';

type Props = {
  player: LibraryPlayer;
  selectedSet?: SelectedSetState;
  gameKey?: string;
  onChange(photo: ScoreboardPhoto | null): void;
};
export function PlayerHeadshotEditor({ player, selectedSet, gameKey, onChange }: Props) {
  const { t } = useTranslation('operator');
  const revision = useCatalogRevision();
  const [loaded, setLoaded] = useState<{ key: string; image?: LoadedScoreboardPhoto }>();
  const [errorKey, setErrorKey] = useState<string>();
  const key = JSON.stringify({
    localPlayerId: player.seenAt ? player.localId : undefined,
    playerId: player.playerId ?? undefined,
    name: playerLabel(player),
    playerPhotoAssetId: player.overrides.playerPhotoAssetId
  });
  const requestKey = `${revision}:${key}`;
  useEffect(() => {
    let active = true;
    void api
      .resolveScoreboardPhotos([JSON.parse(key)])
      .then(async ({ photos }) => {
        const image = photos[0] ? await loadScoreboardPhoto(photos[0]) : undefined;
        if (active) {
          setLoaded({ key: requestKey, image });
          setErrorKey(undefined);
        }
      })
      .catch(() => {
        if (active) setErrorKey(requestKey);
      });
    return () => {
      active = false;
    };
  }, [key, requestKey]);
  const image = loaded?.key === requestKey ? loaded.image : undefined;
  const saved = player.scoreboardPhoto;
  const sameImage = Boolean(image && saved && image.source === saved.source && image.assetId === saved.assetId);
  const crop = sameImage && saved ? saved.crop : defaultHeadshotCrop();
  const stale = sameImage && image?.fingerprint !== saved?.fingerprint;
  const opponent = selectedSet?.playerTwo;
  const defaultSide =
    opponent &&
    (opponent.localPlayerId === player.localId || (player.playerId && opponent.playerId === player.playerId))
      ? 'right'
      : 'left';
  const [chosenSide, setChosenSide] = useState<'left' | 'right'>();
  const side = chosenSide ?? defaultSide;
  const layout =
    gameKey !== undefined
      ? gameKey
        ? scoreboardPhotoLayout({ gameId: canonicalGameId(gameKey) ?? 'street-fighter-6', assetCatalogSlug: gameKey })
        : undefined
      : selectedSet && scoreboardPhotoLayout(selectedSet);
  const photo = image ? { ...image, crop, placements: sameImage ? saved?.placements : undefined } : undefined;
  const placement = photo ? scoreboardPhotoPlacement(photo, layout?.gameId, side) : defaultMediaTransform();
  function changePlacement(next?: MediaTransform) {
    if (!photo) return;
    const placements = { ...photo.placements };
    if (next && layout?.gameId) placements[layout.gameId] = { ...placements[layout.gameId], [side]: next };
    onChange({ source: photo.source, assetId: photo.assetId, fingerprint: photo.fingerprint, crop, placements });
  }
  return (
    <Paper className="operator-inset" p="md" withBorder>
      <Stack gap="md">
        <Title order={4}>{t('scoreboardPhotos.preparation')}</Title>
        <Text size="xs" c="dimmed">
          {t('scoreboardPhotos.recommendedSize')}
        </Text>
        <MediaFolderControls kind="player_headshots" label={t('scoreboardPhotos.headshotsFolder')} />
        <Group>
          <Button
            size="compact-sm"
            variant="subtle"
            onClick={() => void api.reloadAssets().catch(() => setErrorKey(requestKey))}
          >
            {t('scoreboardPhotos.reload')}
          </Button>
        </Group>
        {errorKey === requestKey && <Alert color="red">{t('scoreboardPhotos.imageFailed')}</Alert>}
        {loaded?.key === requestKey && !image && (
          <Text size="sm" c="dimmed">
            {t('scoreboardPhotos.noImage')}
          </Text>
        )}
        {image && (
          <>
            {stale && (
              <Alert color="yellow">
                {t('scoreboardPhotos.changed')}{' '}
                <Button size="compact-sm" onClick={() => changePlacement()}>
                  {t('scoreboardPhotos.confirmImage')}
                </Button>
              </Alert>
            )}
            {layout && photo ? (
              <>
                <SegmentedControl
                  aria-label={t('scoreboardPhotos.side')}
                  value={side}
                  onChange={(value) => setChosenSide(value as 'left' | 'right')}
                  data={[
                    { value: 'left', label: t('editor.playerOne') },
                    { value: 'right', label: t('editor.playerTwo') }
                  ]}
                />
                <PlayerHeadshotPreview
                  key={`${photo.url}:${layout.gameId}:${side}`}
                  photo={photo}
                  layout={layout}
                  side={side}
                  placement={placement}
                  stylingGameId={selectedSet?.stylingGameId}
                  onChange={changePlacement}
                />
                <MediaControlHint />
                <Group>
                  <Button variant="default" size="compact-sm" onClick={() => changePlacement(defaultMediaTransform())}>
                    {t('scoreboardPhotos.reset')}
                  </Button>
                </Group>
              </>
            ) : (
              <Text size="sm" c="dimmed">
                {t(gameKey ? 'scoreboardPhotos.unsupported' : 'players.chooseGameHelp')}
              </Text>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}
