import { Button, Code, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { scoreLimitForBestOf } from '@shared/gameProfiles';
import type { LocalHandoffUrl } from '../../desktopRuntime';
import type { SelectedSetState } from '@shared/models';
import type { StartggReportReadiness } from '@shared/startggReporting';
import { QuickScore } from './ScoreControls';

type LiveControlsPanelProps = {
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
  const maxScore = scoreLimitForBestOf(selectedSet.gameId, selectedSet.bestOf);
  const overlayUrl = localBaseUrl ? `${localBaseUrl}/overlay/active/main` : undefined;

  return (
    <Paper className="panel preview-panel" p="md" radius="lg" withBorder>
      <Stack gap="md">
        <div>
          <Title order={2} size="h4">{t('operator:live.title')}</Title>
          {draftDirty && <Text size="sm" c="dimmed">{t('operator:live.dirtyWarning')}</Text>}
        </div>
        <QuickScore
          label={selectedSet.playerOne.name}
          score={selectedSet.playerOne.score}
          maxScore={maxScore}
          disabled={loading || draftDirty}
          onChange={(score) => onScore('one', score)}
        />
        <QuickScore
          label={selectedSet.playerTwo.name}
          score={selectedSet.playerTwo.score}
          maxScore={maxScore}
          disabled={loading || draftDirty}
          onChange={(score) => onScore('two', score)}
        />
        <Group>
          <Button variant="default" disabled={loading || draftDirty} onClick={onReset}>
            {t('common:actions.resetScores')}
          </Button>
          <Button variant="default" disabled={loading || draftDirty} onClick={onSwap}>
            {t('common:actions.swapPlayers')}
          </Button>
        </Group>

        <Paper withBorder p="sm" className="report-result-card">
          <Stack gap="xs">
            <Text fw={700}>{t('operator:live.startggResult')}</Text>
            <Text size="sm" c="dimmed">
              {reportReadiness.ready
                ? `${t('operator:live.winner', {
                    winner: reportReadiness.result.winnerName,
                    winnerScore: reportReadiness.result.winnerScore,
                    loserScore: reportReadiness.result.loserScore
                  })} ${reportReadiness.result.gameData ? t('operator:live.historyReady') : t('operator:live.winnerOnly')}`
                : reportReadinessReason}
            </Text>
            <Button
              data-testid="report-startgg-result"
              variant="light"
              disabled={loading || draftDirty || !reportReadiness.ready}
              onClick={onReport}
              w="fit-content"
            >
              {t('operator:live.report')}
            </Button>
          </Stack>
        </Paper>

        <div>
          <Title order={2} size="h4">{t('operator:live.obsTitle')}</Title>
          <Text size="sm" c="dimmed">{t('operator:live.obsHelp')}</Text>
        </div>
        <HandoffUrl
          testId="obs-active-url"
          buttonTestId="copy-obs-url"
          url={overlayUrl}
          resolvingLabel={t('operator:live.resolvingObs')}
          copyLabel={copiedHandoff === 'overlay' ? t('operator:live.copied') : t('operator:live.copyObs')}
          onCopy={() => onCopy('overlay')}
        />
        <Group justify="space-between" className="mini-preview" wrap="nowrap">
          <Text>{selectedSet.playerOne.name}</Text>
          <Text fw={800}>{selectedSet.playerOne.score} - {selectedSet.playerTwo.score}</Text>
          <Text ta="right">{selectedSet.playerTwo.name}</Text>
        </Group>
        <Text size="sm" c="dimmed">{t('common:match.bestOf', { count: selectedSet.bestOf })}</Text>
      </Stack>
    </Paper>
  );
}

type HandoffUrlProps = {
  testId: string;
  buttonTestId: string;
  url?: string;
  resolvingLabel: string;
  copyLabel: string;
  onCopy(): void;
};

function HandoffUrl({ testId, buttonTestId, url, resolvingLabel, copyLabel, onCopy }: HandoffUrlProps) {
  return (
    <Group className="handoff-url" wrap="nowrap">
      <Code data-testid={testId} block>{url ?? resolvingLabel}</Code>
      <Button data-testid={buttonTestId} variant="default" disabled={!url} onClick={onCopy}>
        {copyLabel}
      </Button>
    </Group>
  );
}
