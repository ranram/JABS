import { Accordion, Badge, Code, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { LogoAsset, SelectedSetState, StartggPhase } from '@shared/models';
import type { GameProfile } from '@shared/gameProfiles';
import { CommentatorControls } from './CommentatorControls';
import { ResultScreenControls } from './ResultScreenControls';
import { VersusScreenControls } from './VersusScreenControls';
import { TopEightMatchupsControls } from './TopEightMatchupsControls';

type OtherOverlaysPanelProps = {
  localBaseUrl?: string;
  logos: LogoAsset[];
  activeSet?: SelectedSetState;
  profiles: GameProfile[];
  assetCatalogSlug?: string;
  selectedEventId?: string;
  selectedEventName?: string;
  phases: StartggPhase[];
};

const overlayTypes = ['versus', 'winner', 'commentators', 'topEightMatchups'] as const;
const overlayPaths: Record<(typeof overlayTypes)[number], string> = {
  versus: '/overlay/active/versus',
  winner: '/overlay/active/winner',
  commentators: '/overlay/commentators',
  topEightMatchups: '/overlay/active/top-eight-matchups'
};

export function OtherOverlaysPanel({ localBaseUrl, logos, activeSet, profiles, assetCatalogSlug, selectedEventId, selectedEventName, phases }: OtherOverlaysPanelProps) {
  const { t } = useTranslation('operator');

  return (
    <Paper className="panel other-overlays-workspace" p="lg" radius="lg" withBorder>
      <Stack gap="xs" mb="lg">
        <Title order={2} size="h4">{t('workspaces.otherOverlaysTitle')}</Title>
        <Text c="dimmed" size="sm">{t('workspaces.otherOverlaysDescription')}</Text>
      </Stack>

      <Accordion variant="separated" radius="md" chevronPosition="right">
        {overlayTypes.map((overlayType) => (
          <Accordion.Item key={overlayType} value={overlayType}>
            <Accordion.Control>
              <Text fw={800}>{t(`workspaces.tools.${overlayType}.title`)}</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Text c="dimmed" size="sm">
                  {t(`workspaces.tools.${overlayType}.description`)}
                </Text>
                <div>
                  <Text fw={700} size="xs" mb={5}>{t('workspaces.obsSource')}</Text>
                  {localBaseUrl
                    ? <Code className="workspace-obs-url" block>{localBaseUrl}{overlayPaths[overlayType]}</Code>
                    : <Text c="dimmed" size="sm">{t('workspaces.resolvingObs')}</Text>}
                </div>
                {overlayType === 'topEightMatchups' ? (
                  <TopEightMatchupsControls profiles={profiles} logos={logos} selectedEventId={selectedEventId} selectedEventName={selectedEventName} phases={phases} assetCatalogSlug={assetCatalogSlug} />
                ) : overlayType === 'commentators' ? (
                  <CommentatorControls logos={logos} profiles={profiles} />
                ) : overlayType === 'winner' ? (
                  <>
                    <Group gap="xs">
                      <Badge color="green" variant="light">{t('workspaces.available')}</Badge>
                      <Text size="sm">{t('workspaces.winnerAutomatic')}</Text>
                    </Group>
                    <ResultScreenControls
                      activeSet={activeSet}
                      logos={logos}
                      profiles={profiles}
                      assetCatalogSlug={assetCatalogSlug}
                    />
                  </>
                ) : <VersusScreenControls
                  activeSet={activeSet}
                  profiles={profiles}
                  assetCatalogSlug={assetCatalogSlug}
                />}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Paper>
  );
}
