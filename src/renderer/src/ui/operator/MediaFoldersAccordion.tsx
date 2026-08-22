import { Accordion, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { MediaFolderControls } from './MediaFolderControls';

type MediaFoldersAccordionProps = {
  /** Repository-relative character-art subpath such as `street-fighter-6/characters`, when a game catalog is active. */
  gameAssetSubpath?: string;
};

/**
 * Collapsible reference showing where JABS reads every user-media catalog.
 * Surfaces that consume all four catalogs (Versus, Winner/Champion, Top 8,
 * thumbnails) share this so the resolved paths stay consistent.
 */
export function MediaFoldersAccordion({ gameAssetSubpath }: MediaFoldersAccordionProps) {
  const { t } = useTranslation('operator');
  return (
    <Accordion variant="separated" radius="md">
      <Accordion.Item value="media-folders">
        <Accordion.Control>{t('workspaces.mediaFolders')}</Accordion.Control>
        <Accordion.Panel>
          <Stack gap={4}>
            <MediaFolderControls kind="players" label={t('broadcast.playerPhotosFolder')} />
            <MediaFolderControls kind="sponsors" label={t('broadcast.sponsorLogosFolder')} />
            {gameAssetSubpath && (
              <>
                <MediaFolderControls kind="game-assets" label={t('thumbnail.assetFolder')} subpath={gameAssetSubpath} />
                <MediaFolderControls
                  kind="game-assets"
                  label={t('thumbnail.portraitFolder')}
                  subpath={gameAssetSubpath.replace(/\/characters$/, '/portraits')}
                />
              </>
            )}
            <MediaFolderControls kind="tourney-logos" label={t('broadcast.tournamentLogosFolder')} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
