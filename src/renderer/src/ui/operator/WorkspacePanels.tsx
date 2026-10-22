import { Accordion, Box, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { LogoAsset, SelectedSetState, StartggPhase } from '@shared/models';
import type { GameProfile } from '@shared/gameProfiles';
import { CommentatorControls } from './CommentatorControls';
import { ResultScreenControls, ResultScreenStatus } from './ResultScreenControls';
import { VersusScreenControls, VersusScreenStatus } from './VersusScreenControls';
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
              <Group justify="space-between" gap="md" wrap="nowrap" pr="sm">
                <Text fw={800} flex={1} miw={0}>
                  {t(`workspaces.tools.${overlayType}.title`)}
                </Text>
                {(overlayType === 'versus' || overlayType === 'winner') && (
                  <Box maw="65%" miw={0}>
                    {overlayType === 'versus' ? (
                      <VersusScreenStatus activeSet={controls.streamDraft ?? controls.activeSet} />
                    ) : (
                      <ResultScreenStatus activeSet={controls.activeSet} />
                    )}
                  </Box>
                )}
              </Group>
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
                    {overlayType !== 'versus' && (
                      <OverlaySourceDetails overlayType={overlayType} localBaseUrl={localBaseUrl} />
                    )}
                    <OverlayControls
                      overlayType={overlayType}
                      sourceLinks={
                        overlayType === 'versus' ? (
                          <OverlaySourceDetails overlayType={overlayType} localBaseUrl={localBaseUrl} />
                        ) : undefined
                      }
                      {...controls}
                    />
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
  assetCatalogRevision,
  sourceLinks
}: Omit<OtherOverlaysPanelProps, 'localBaseUrl'> & {
  overlayType: Exclude<OtherOverlayType, 'commentators'>;
  sourceLinks?: ReactElement;
}): ReactElement {
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
      return <ResultScreenControls activeSet={activeSet} logos={logos} profiles={profiles} />;
    case 'versus':
      return (
        <VersusScreenControls
          sourceLinks={sourceLinks}
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
