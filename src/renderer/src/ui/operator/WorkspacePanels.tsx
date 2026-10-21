import { Accordion, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { LogoAsset, SelectedSetState, StartggPhase } from '@shared/models';
import type { GameProfile } from '@shared/gameProfiles';
import { CommentatorControls } from './CommentatorControls';
import { ResultScreenControls } from './ResultScreenControls';
import { VersusScreenControls } from './VersusScreenControls';
import { TopEightMatchupsControls } from './TopEightMatchupsControls';
import { BracketScreenControls } from './BracketScreenControls';
import { PlayerStatsControls } from './PlayerStatsControls';
import { sortByLabel } from './operatorUtils';
import { OverlaySourceField } from './OverlaySourceField';
import { otherOverlayTypes, overlaySources, type OtherOverlayType } from './overlaySources';
import type { CharacterCatalogOptions } from './useCharacterCatalogOptions';

type OtherOverlaysPanelProps = {
  assetCatalogRevision: number;
  localBaseUrl?: string;
  logos: LogoAsset[];
  activeSet?: SelectedSetState;
  streamDraft?: SelectedSetState;
  characterCatalog?: CharacterCatalogOptions;
  streamPending?: boolean;
  onPatchStream?(patch: Partial<SelectedSetState>): void;
  profiles: GameProfile[];
  assetCatalogSlug?: string;
  selectedEventId?: string;
  selectedEventName?: string;
  phases: StartggPhase[];
};

export function OtherOverlaysPanel({ localBaseUrl, ...controls }: OtherOverlaysPanelProps) {
  const { t, i18n } = useTranslation('operator');
  const sortedTypes = sortByLabel(
    otherOverlayTypes,
    (type) => t(`workspaces.tools.${type}.title`),
    i18n.resolvedLanguage ?? i18n.language
  );

  return (
    <Paper className="panel other-overlays-workspace" p="md" radius="lg" withBorder>
      <Stack gap="xs" mb="lg">
        <Title order={2} size="h4">
          {t('workspaces.otherOverlaysTitle')}
        </Title>
      </Stack>

      <Accordion variant="separated" radius="md" chevronPosition="right">
        {sortedTypes.map((overlayType) => (
          <Accordion.Item className="operator-inset" key={overlayType} value={overlayType}>
            <Accordion.Control>
              <Text fw={800}>{t(`workspaces.tools.${overlayType}.title`)}</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                {overlayType === 'commentators' ? (
                  <CommentatorControls
                    logos={controls.logos}
                    profiles={controls.profiles}
                    sourceLinks={<OverlaySourceDetails overlayType={overlayType} localBaseUrl={localBaseUrl} />}
                  />
                ) : (
                  <>
                    <Text c="dimmed" size="sm">
                      {t(`workspaces.tools.${overlayType}.description`)}
                    </Text>
                    <OverlaySourceDetails overlayType={overlayType} localBaseUrl={localBaseUrl} />
                    <OverlayControls overlayType={overlayType} {...controls} />
                  </>
                )}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Paper>
  );
}

function OverlaySourceDetails({ overlayType, localBaseUrl }: { overlayType: OtherOverlayType; localBaseUrl?: string }) {
  const { t } = useTranslation('operator');
  return (
    <div>
      <Text fw={700} size="xs" mb={5}>
        {t('workspaces.obsSource')}
      </Text>
      <OverlaySourceLinks overlayType={overlayType} localBaseUrl={localBaseUrl} />
    </div>
  );
}

function OverlaySourceLinks({ overlayType, localBaseUrl }: { overlayType: OtherOverlayType; localBaseUrl?: string }) {
  const { t } = useTranslation('operator');
  if (!localBaseUrl)
    return (
      <Text c="dimmed" size="sm">
        {t('workspaces.resolvingObs')}
      </Text>
    );
  const sources = overlaySources[overlayType];
  return (
    <SimpleGrid type="container" cols={{ base: 1, '48rem': sources.length }} spacing="md">
      {sources.map((source) => (
        <div key={source}>
          {sources.length > 1 && (
            <Text size="xs" fw={700} mb={5}>
              {t(`live.overlayNames.${source}`)}
            </Text>
          )}
          <OverlaySourceField source={source} localBaseUrl={localBaseUrl} />
        </div>
      ))}
    </SimpleGrid>
  );
}

function OverlayControls({
  overlayType,
  logos,
  activeSet,
  streamDraft,
  characterCatalog,
  streamPending,
  onPatchStream,
  profiles,
  assetCatalogSlug,
  selectedEventId,
  selectedEventName,
  phases,
  assetCatalogRevision
}: Omit<OtherOverlaysPanelProps, 'localBaseUrl'> & {
  overlayType: Exclude<OtherOverlayType, 'commentators'>;
}): ReactElement {
  const { t } = useTranslation('operator');
  switch (overlayType) {
    case 'playerStats':
      return <PlayerStatsControls logos={logos} profiles={profiles} />;
    case 'bracket':
      return <BracketScreenControls eventId={selectedEventId} phases={phases} profiles={profiles} logos={logos} />;
    case 'topEightMatchups':
      return (
        <TopEightMatchupsControls
          profiles={profiles}
          logos={logos}
          selectedEventId={selectedEventId}
          selectedEventName={selectedEventName}
          phases={phases}
          assetCatalogSlug={assetCatalogSlug}
          assetCatalogRevision={assetCatalogRevision}
        />
      );
    case 'winner':
      return (
        <>
          <Text size="sm">{t('workspaces.winnerAutomatic')}</Text>
          <ResultScreenControls activeSet={activeSet} logos={logos} profiles={profiles} />
        </>
      );
    case 'versus':
      return (
        <VersusScreenControls
          activeSet={streamDraft ?? activeSet}
          characterCatalog={characterCatalog}
          pendingChanges={streamPending}
          onPatch={onPatchStream}
          logos={logos}
          profiles={profiles}
        />
      );
  }
}
