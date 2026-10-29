import type { ReactNode } from 'react';
import { Box, Button, Code, Group, Kbd, Paper, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { scoreLimitForPlayer } from '@shared/gameProfiles';
import type { LocalHandoffUrl } from '../../desktopRuntime';
import type { SelectedSetState, ReportOutcome } from '@shared/models';
import { startggReportReadiness, type StartggReportReadiness } from '@shared/startggReporting';
import { localizedReadinessReason } from './operatorUtils';
import { useReportOutcome, ResultOutcomeButtons, reportOutcomeText } from './ResultOutcomeControls';
import { hasStreamMatch } from './streamStatus';
import { MatchQueueControls } from './MatchQueueControls';
import { QuickScore } from './ScoreControls';
import { OverlayUrlMenu } from './OverlayUrlMenu';
import { useMatchFormatLabel } from '../useMatchFormatLabel';
import { DestructiveButton } from '../DestructiveButton';
import { PanelHeader } from '../PanelHeader';
import {
  OperatorIcon,
  IconLabel,
  CheckCircleIcon,
  ArrowsLeftRightIcon,
  ArrowCounterClockwiseIcon,
  KeyboardIcon,
  MonitorIcon
} from '../icons';

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
  onReport(outcome?: ReportOutcome): void;
  onCopy(kind: LocalHandoffUrl): void;
};

export function LiveControlsPanel({
  reportingEnabled,
  shortcutsEnabled,
  selectedSet,
  reportReadiness: scoreReadiness,
  reportReadinessReason: scoreReadinessReason,
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
  const { outcome, choose, clear } = useReportOutcome(selectedSet);
  const reportReadiness = outcome ? startggReportReadiness(selectedSet, outcome) : scoreReadiness;
  const reportReadinessReason = outcome ? localizedReadinessReason(reportReadiness) : scoreReadinessReason;
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
  const reportDisabled = reportDisabledReason !== undefined;
  const resultStatus = !selectedSet.setId
    ? 'local'
    : selectedSet.state === '3' && !selectedSet.upstreamReset
      ? 'reported'
      : !reportDisabled
        ? 'ready'
        : 'pending';
  return (
    <Paper className="panel preview-panel live-controls-panel" p="md" radius="lg" withBorder>
      <Stack gap="md">
        <PanelHeader title={t('operator:live.title')} icon={MonitorIcon} inset="md" />
        <Text size="xs" c="dimmed">
          {[
            hasStreamMatch(selectedSet)
              ? [selectedSet.tournamentName, selectedSet.round].filter(Boolean).join(' · ') || selectedSet.gameName
              : t('operator:ux.noMatch'),
            matchLabel
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <QuickScore
          side="one"
          resultControls={
            <ResultOutcomeButtons
              set={selectedSet}
              side="one"
              outcome={outcome}
              disabled={loading || draftDirty || !reportingEnabled}
              onChange={choose}
            />
          }
          label={selectedSet.playerOne.name}
          score={selectedSet.playerOne.score}
          maxScore={scoreLimitForPlayer(selectedSet, 'one')}
          disabled={loading || draftDirty}
          onChange={(score) => {
            clear();
            onScore('one', score);
          }}
        />
        <QuickScore
          side="two"
          resultControls={
            <ResultOutcomeButtons
              set={selectedSet}
              side="two"
              outcome={outcome}
              disabled={loading || draftDirty || !reportingEnabled}
              onChange={choose}
            />
          }
          label={selectedSet.playerTwo.name}
          score={selectedSet.playerTwo.score}
          maxScore={scoreLimitForPlayer(selectedSet, 'two')}
          disabled={loading || draftDirty}
          onChange={(score) => {
            clear();
            onScore('two', score);
          }}
        />
        <Stack gap={6}>
          <Tooltip
            label={reportDisabledReason}
            disabled={!reportDisabledReason}
            multiline
            w={280}
            events={{ hover: true, focus: true, touch: true }}
          >
            <Box
              component="span"
              display="block"
              data-tutorial="report-result"
              tabIndex={reportDisabled ? 0 : undefined}
              aria-label={reportDisabledReason}
            >
              <Button
                fullWidth
                data-testid="report-startgg-result"
                disabled={reportDisabled}
                onClick={() => onReport(outcome)}
                leftSection={<OperatorIcon icon={CheckCircleIcon} />}
              >
                {t('operator:live.report')}
              </Button>
            </Box>
          </Tooltip>
          <Text size="xs" ta="center" c={resultStatus === 'reported' ? 'teal' : 'dimmed'} role="status">
            {outcome
              ? reportOutcomeText(selectedSet, outcome)
              : selectedSet.upstreamReset
                ? reportReadinessReason
                : t(`operator:ux.result.${resultStatus}`)}
          </Text>
        </Stack>
        <SimpleGrid cols={2}>
          <Button
            variant="default"
            disabled={loading || draftDirty}
            onClick={onSwap}
            leftSection={<OperatorIcon icon={ArrowsLeftRightIcon} />}
          >
            {t('common:actions.swapPlayers')}
          </Button>
          <DestructiveButton
            disabled={loading || draftDirty}
            onClick={() => {
              clear();
              onReset();
            }}
            leftSection={<OperatorIcon icon={ArrowCounterClockwiseIcon} />}
          >
            {t('common:actions.resetScores')}
          </DestructiveButton>
        </SimpleGrid>
        <MatchQueueControls />
        {shortcutsEnabled && (
          <details className="operator-disclosure">
            <summary>
              <IconLabel icon={KeyboardIcon}>{t('operator:ux.scoreShortcuts')}</IconLabel>
            </summary>
            <Stack className="operator-disclosure-content score-shortcuts" gap="xs">
              {(['one', 'two'] as const).map((side, index) => (
                <Group key={side} gap="sm">
                  <ShortcutInstruction>
                    <Kbd>{index + 1}</Kbd>
                    <Text size="xs" c="dimmed">
                      {t(side === 'one' ? 'operator:live.playerOnePoint' : 'operator:live.playerTwoPoint')}
                    </Text>
                  </ShortcutInstruction>
                  <ShortcutInstruction>
                    <Kbd>Shift</Kbd>
                    <Text size="xs" c="dimmed">
                      +
                    </Text>
                    <Kbd>{index + 1}</Kbd>
                    <Text size="xs" c="dimmed">
                      {t(
                        side === 'one' ? 'operator:live.subtractPlayerOnePoint' : 'operator:live.subtractPlayerTwoPoint'
                      )}
                    </Text>
                  </ShortcutInstruction>
                </Group>
              ))}
              <ShortcutInstruction>
                <Kbd>Ctrl+Shift+R</Kbd>
                <Text size="xs" c="dimmed">
                  {t('common:actions.resetScores')}
                </Text>
              </ShortcutInstruction>
              <ShortcutInstruction>
                <Kbd>Ctrl+Shift+S</Kbd>
                <Text size="xs" c="dimmed">
                  {t('common:actions.swapPlayers')}
                </Text>
              </ShortcutInstruction>
            </Stack>
          </details>
        )}
        <details className="operator-disclosure">
          <summary>
            <IconLabel icon={MonitorIcon}>{t('operator:live.obsTitle')}</IconLabel>
          </summary>
          <Stack gap="xs" className="operator-disclosure-content">
            <Text size="xs" c="dimmed">
              {t('operator:live.obsHelp')}
            </Text>
            <Group className="handoff-url" wrap="nowrap">
              <Code data-testid="obs-active-url" block>
                {overlayUrl ?? t('operator:live.resolvingObs')}
              </Code>
              <OverlayUrlMenu copied={copiedHandoff} disabled={!overlayUrl} onCopy={onCopy} />
            </Group>
          </Stack>
        </details>
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
