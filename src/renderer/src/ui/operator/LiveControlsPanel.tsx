import type { ReactNode } from 'react';
import { Box, Button, Code, Divider, Group, Kbd, Paper, Stack, Text, Title, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { scoreLimitForPlayer } from '@shared/gameProfiles';
import type { LocalHandoffUrl } from '../../desktopRuntime';
import type { SelectedSetState } from '@shared/models';
import type { StartggReportReadiness } from '@shared/startggReporting';
import { QuickScore } from './ScoreControls';
import { OverlayUrlMenu } from './OverlayUrlMenu';
import { ControlWarning } from './ControlWarning';
import { useMatchFormatLabel } from '../useMatchFormatLabel';
import { DestructiveButton } from '../DestructiveButton';

type LiveControlsPanelProps = {
  reportingEnabled: boolean;
  shortcutsEnabled: boolean;
  selectedSet: SelectedSetState;
  reportReadiness: StartggReportReadiness;
  reportReadinessReason: string;
  localBaseUrl?: string;
  copiedHandoff?: LocalHandoffUrl;
  loading: boolean;
  draftDirty: boolean;
  onScore(side: 'one' | 'two', score: number): void;
  onReset(): void;
  onSwap(): void;
  onReport(): void;
  onCopy(kind: LocalHandoffUrl): void;
};

export function LiveControlsPanel({
  reportingEnabled,
  shortcutsEnabled,
  selectedSet,
  reportReadiness,
  reportReadinessReason,
  localBaseUrl,
  copiedHandoff,
  loading,
  draftDirty,
  onScore,
  onReset,
  onSwap,
  onReport,
  onCopy
}: LiveControlsPanelProps) {
  const { t } = useTranslation(['operator', 'common']);
  const matchLabel = useMatchFormatLabel(selectedSet);
  const overlayUrl = localBaseUrl ? `${localBaseUrl}/overlay/active/main` : undefined;
  const reportDisabledReason = !selectedSet.setId
    ? t('operator:readiness.setMissing')
    : !reportingEnabled
      ? t('operator:startgg.reportToken')
      : draftDirty
        ? t('operator:editor.waitSave')
        : loading
          ? t('operator:editor.waitAction')
          : !reportReadiness.ready
            ? reportReadinessReason
            : undefined;
  const reportDisabled = !selectedSet.setId || !reportingEnabled || loading || draftDirty || !reportReadiness.ready;

  return (
    <Paper className="panel preview-panel" p="md" radius="lg" withBorder>
      <Stack gap="md">
        <div>
          <Title order={2} size="h4">
            {t('operator:live.title')}
          </Title>
        </div>
        {shortcutsEnabled && (
          <Stack gap="xs" className="score-shortcuts">
            <Group gap="sm">
              <ShortcutInstruction>
                <Kbd>1</Kbd>
                <Text size="xs" c="dimmed">
                  {t('operator:live.playerOnePoint')}
                </Text>
              </ShortcutInstruction>
              <Divider orientation="vertical" h={20} />
              <ShortcutInstruction>
                <Kbd>Shift</Kbd>
                <Text size="xs" c="dimmed">
                  +
                </Text>
                <Kbd>1</Kbd>
                <Text size="xs" c="dimmed">
                  {t('operator:live.subtractPlayerOnePoint')}
                </Text>
              </ShortcutInstruction>
            </Group>
            <Group gap="sm">
              <ShortcutInstruction>
                <Kbd>2</Kbd>
                <Text size="xs" c="dimmed">
                  {t('operator:live.playerTwoPoint')}
                </Text>
              </ShortcutInstruction>
              <Divider orientation="vertical" h={20} />
              <ShortcutInstruction>
                <Kbd>Shift</Kbd>
                <Text size="xs" c="dimmed">
                  +
                </Text>
                <Kbd>2</Kbd>
                <Text size="xs" c="dimmed">
                  {t('operator:live.subtractPlayerTwoPoint')}
                </Text>
              </ShortcutInstruction>
            </Group>
            <Group gap="sm">
              <ShortcutInstruction>
                <Kbd>Ctrl+Shift+R</Kbd>
                <Text size="xs" c="dimmed">
                  {t('common:actions.resetScores')}
                </Text>
              </ShortcutInstruction>
              <Divider orientation="vertical" h={20} />
              <ShortcutInstruction>
                <Kbd>Ctrl+Shift+S</Kbd>
                <Text size="xs" c="dimmed">
                  {t('common:actions.swapPlayers')}
                </Text>
              </ShortcutInstruction>
            </Group>
          </Stack>
        )}
        <QuickScore
          label={selectedSet.playerOne.name}
          score={selectedSet.playerOne.score}
          maxScore={scoreLimitForPlayer(selectedSet, 'one')}
          disabled={loading || draftDirty}
          onChange={(score) => onScore('one', score)}
        />
        <QuickScore
          label={selectedSet.playerTwo.name}
          score={selectedSet.playerTwo.score}
          maxScore={scoreLimitForPlayer(selectedSet, 'two')}
          disabled={loading || draftDirty}
          onChange={(score) => onScore('two', score)}
        />
        <Group grow preventGrowOverflow={false}>
          <Tooltip
            label={reportDisabledReason}
            disabled={!reportDisabledReason}
            multiline
            w={280}
            events={{ hover: true, focus: true, touch: false }}
          >
            <Box
              component="span"
              display="inline-flex"
              data-tutorial="report-result"
              tabIndex={reportDisabled ? 0 : undefined}
              aria-label={reportDisabledReason}
            >
              <Button
                fullWidth
                data-testid="report-startgg-result"
                variant="default"
                disabled={reportDisabled}
                onClick={onReport}
              >
                {t('operator:live.report')}
              </Button>
            </Box>
          </Tooltip>
          <Button variant="default" disabled={loading || draftDirty} onClick={onSwap}>
            {t('common:actions.swapPlayers')}
          </Button>
          <DestructiveButton disabled={loading || draftDirty} onClick={onReset}>
            {t('common:actions.resetScores')}
          </DestructiveButton>
        </Group>

        <ControlWarning
          message={draftDirty ? t('operator:editor.waitSave') : loading ? t('operator:editor.waitAction') : undefined}
        />

        <div>
          <Title order={2} size="h4">
            {t('operator:live.obsTitle')}
          </Title>
          <Text size="sm" c="dimmed">
            {t('operator:live.obsHelp')}
          </Text>
        </div>
        <HandoffUrl
          testId="obs-active-url"
          url={overlayUrl}
          resolvingLabel={t('operator:live.resolvingObs')}
          copied={copiedHandoff}
          onCopy={onCopy}
        />
        <Text size="sm" c="dimmed">
          {matchLabel}
        </Text>
      </Stack>
    </Paper>
  );
}

function ShortcutInstruction({ children }: { children: ReactNode }) {
  return (
    <Group gap={6} wrap="nowrap">
      {children}
    </Group>
  );
}

type HandoffUrlProps = {
  testId: string;
  url?: string;
  resolvingLabel: string;
  copied?: LocalHandoffUrl;
  onCopy(kind: LocalHandoffUrl): void;
};

function HandoffUrl({ testId, url, resolvingLabel, copied, onCopy }: HandoffUrlProps) {
  return (
    <Group className="handoff-url" wrap="nowrap">
      <Code data-testid={testId} block>
        {url ?? resolvingLabel}
      </Code>
      <OverlayUrlMenu copied={copied} disabled={!url} onCopy={onCopy} />
    </Group>
  );
}
