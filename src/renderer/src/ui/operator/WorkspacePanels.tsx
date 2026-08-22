import { Accordion, Badge, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { LogoAsset, SelectedSetState } from '@shared/models';
import type { GameProfile } from '@shared/gameProfiles';
import { CommentatorControls } from './CommentatorControls';
import { ResultScreenControls } from './ResultScreenControls';
import { VersusScreenControls } from './VersusScreenControls';

type OtherOverlaysPanelProps = {
  localBaseUrl?: string;
  logos: LogoAsset[];
  activeSet?: SelectedSetState;
  profiles: GameProfile[];
  assetCatalogSlug?: string;
};

const overlayTypes = ['versus', 'winner', 'commentators'] as const;

export function OtherOverlaysPanel({ localBaseUrl, logos, activeSet, profiles, assetCatalogSlug }: OtherOverlaysPanelProps) {
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
                {overlayType === 'commentators' ? (
                  <CommentatorControls localBaseUrl={localBaseUrl} logos={logos} profiles={profiles} />
                ) : overlayType === 'winner' ? (
                  <>
                    <Group gap="xs">
                      <Badge color="green" variant="light">{t('workspaces.available')}</Badge>
                      <Text size="sm">{t('workspaces.winnerAutomatic')}</Text>
                    </Group>
                    <ResultScreenControls
                      activeSet={activeSet}
                      localBaseUrl={localBaseUrl}
                      logos={logos}
                      profiles={profiles}
                      assetCatalogSlug={assetCatalogSlug}
                    />
                  </>
                ) : <VersusScreenControls
                  activeSet={activeSet}
                  localBaseUrl={localBaseUrl}
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
