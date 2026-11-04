import type { ReactNode } from 'react';
import { Anchor, Box, Button, Code, Group, Paper, Popover, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
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
import { KeyboardShortcutGuide } from './KeyboardShortcutGuide';
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
  embedded?: boolean;
  beforeDetails?: ReactNode;
  renderLayout?(primary: ReactNode, secondary: ReactNode): ReactNode;
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
  embedded = false,
  beforeDetails,
  renderLayout,
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
  const content = (
    <Stack gap={embedded ? 'xs' : 'md'}>
      {!embedded && <PanelHeader title={t('operator:live.title')} icon={MonitorIcon} inset="md" />}
      <Group justify="space-between" align="baseline" gap="xs" wrap="nowrap">
        <Text size="xs" c="dimmed" flex={1} miw={0} truncate="end">
          {hasStreamMatch(selectedSet)
            ? [selectedSet.tournamentName, selectedSet.round].filter(Boolean).join(' · ') || selectedSet.gameName
            : t('operator:ux.noMatch')}
          {' · '}
          {selectedSet.matchFormat === 'topanga' ? (
            <Popover width={280} position="bottom-start" withArrow shadow="md" trapFocus returnFocus>
              <Popover.Target>
                <Anchor
                  component="button"
                  type="button"
                  size="xs"
                  c="dimmed"
                  underline="always"
                  style={{ fontSize: 'inherit', lineHeight: 'inherit' }}
                >
                  {matchLabel}
                </Anchor>
              </Popover.Target>
              <Popover.Dropdown>
                <Text size="sm">{t('common:match.topangaDescription')}</Text>
              </Popover.Dropdown>
            </Popover>
          ) : (
            matchLabel
          )}
        </Text>
        <Text
          size="xs"
          ta="right"
          miw={0}
          maw="65%"
          truncate="end"
          c={resultStatus === 'reported' ? 'teal' : 'dimmed'}
          role="status"
        >
          {outcome
            ? reportOutcomeText(selectedSet, outcome)
            : selectedSet.upstreamReset
              ? reportReadinessReason
              : t(`operator:ux.result.${resultStatus}`)}
        </Text>
      </Group>
      <Stack gap="xs" className={embedded ? 'stream-score-pair' : undefined}>
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
      </Stack>
      <SimpleGrid cols={3} spacing="xs" className="stream-action-row">
        <Button
          variant="default"
          disabled={loading || draftDirty}
          onClick={onSwap}
          leftSection={<OperatorIcon icon={ArrowsLeftRightIcon} size={14} />}
        >
          {t('common:actions.swapPlayers')}
        </Button>
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
              leftSection={<OperatorIcon icon={CheckCircleIcon} size={14} />}
            >
              {t('operator:live.report')}
            </Button>
          </Box>
        </Tooltip>
        <DestructiveButton
          disabled={loading || draftDirty}
          onClick={() => {
            clear();
            onReset();
          }}
          leftSection={<OperatorIcon icon={ArrowCounterClockwiseIcon} size={14} />}
        >
          {t('common:actions.resetScores')}
        </DestructiveButton>
      </SimpleGrid>
    </Stack>
  );
  const secondary = (
    <Stack gap="xs" className="stream-live-details">
      <MatchQueueControls />
      {beforeDetails}
      {shortcutsEnabled && (
        <details className="operator-disclosure">
          <summary>
            <IconLabel icon={KeyboardIcon}>{t('operator:ux.scoreShortcuts')}</IconLabel>
          </summary>
          <KeyboardShortcutGuide />
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
  );
  if (embedded && renderLayout)
    return renderLayout(
      <div
        className="preview-panel live-controls-panel embedded-live-controls"
        role="group"
        aria-label={t('operator:live.title')}
      >
        {content}
      </div>,
      secondary
    );
  return embedded ? (
    <div
      className="preview-panel live-controls-panel embedded-live-controls"
      role="group"
      aria-label={t('operator:live.title')}
    >
      {content}
      {secondary}
    </div>
  ) : (
    <Paper className="panel preview-panel live-controls-panel" p="md" radius="lg" withBorder>
      {content}
      {secondary}
    </Paper>
  );
}
