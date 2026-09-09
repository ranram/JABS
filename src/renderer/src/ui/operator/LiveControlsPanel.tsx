import type { ReactNode } from 'react';
import { Button, Code, Divider, Group, Kbd, Paper, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { scoreLimitForBestOf } from '@shared/gameProfiles';
import type { LocalHandoffUrl } from '../../desktopRuntime';
import type { SelectedSetState } from '@shared/models';
import type { StartggReportReadiness } from '@shared/startggReporting';
import { QuickScore } from './ScoreControls';
import { OverlayUrlMenu } from './OverlayUrlMenu';
import { ControlWarning } from './ControlWarning';

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
  const maxScore = scoreLimitForBestOf(selectedSet.gameId, selectedSet.bestOf);
  const overlayUrl = localBaseUrl ? `${localBaseUrl}/overlay/active/main` : undefined;

  return (
    <Paper className="panel preview-panel" p="md" radius="lg" withBorder>
      <Stack gap="md">
        <div>
          <Title order={2} size="h4">{t('operator:live.title')}</Title>
        </div>
        {shortcutsEnabled && <Group gap="sm" className="score-shortcuts">
          <Text size="xs" c="dimmed">{t('operator:live.shortcuts')}</Text>
          <ShortcutInstruction><Kbd>1</Kbd><Text size="xs" c="dimmed">{t('operator:live.playerOnePoint')}</Text></ShortcutInstruction>
          <ShortcutInstruction>
            <Kbd>Shift</Kbd><Text size="xs" c="dimmed">+</Text><Kbd>1</Kbd>
            <Text size="xs" c="dimmed">{t('operator:live.subtractPlayerOnePoint')}</Text>
          </ShortcutInstruction>
          <ShortcutInstruction><Kbd>2</Kbd><Text size="xs" c="dimmed">{t('operator:live.playerTwoPoint')}</Text></ShortcutInstruction>
          <ShortcutInstruction>
            <Kbd>Shift</Kbd><Text size="xs" c="dimmed">+</Text><Kbd>2</Kbd>
            <Text size="xs" c="dimmed">{t('operator:live.subtractPlayerTwoPoint')}</Text>
          </ShortcutInstruction>
          <ShortcutInstruction><Kbd>Ctrl+Shift+R</Kbd><Text size="xs" c="dimmed">{t('common:actions.resetScores')}</Text></ShortcutInstruction>
          <ShortcutInstruction><Kbd>Ctrl+Shift+S</Kbd><Text size="xs" c="dimmed">{t('common:actions.swapPlayers')}</Text></ShortcutInstruction>
        </Group>}
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

        <ControlWarning message={draftDirty ? t('operator:editor.waitSave') : loading ? t('operator:editor.waitAction') : undefined} />

        {selectedSet.matchFormat !== 'first-to' && <Paper withBorder p="sm" className="report-result-card">
          <Stack gap="xs" w="100%" miw={0}>
            <Text fw={700}>{t('operator:live.startggResult')}</Text>
            {reportReadiness.ready && <Text size="sm" c="dimmed">
              {`${t('operator:live.winner', {
                    winner: reportReadiness.result.winnerName,
                    winnerScore: reportReadiness.result.winnerScore,
                    loserScore: reportReadiness.result.loserScore
                  })} ${reportReadiness.result.gameData ? t('operator:live.historyReady') : t('operator:live.winnerOnly')}`}
            </Text>}
            <Button
              data-testid="report-startgg-result"
              variant="light"
              disabled={!reportingEnabled || loading || draftDirty || !reportReadiness.ready}
              onClick={onReport}
              w="fit-content"
            >
              {t('operator:live.report')}
            </Button>
            <ControlWarning message={!reportingEnabled ? t('operator:startgg.reportToken')
              : draftDirty ? t('operator:editor.waitSave') : loading ? t('operator:editor.waitAction')
              : !reportReadiness.ready ? reportReadinessReason : undefined} />
          </Stack>
        </Paper>}

        <div>
          <Title order={2} size="h4">{t('operator:live.obsTitle')}</Title>
          <Text size="sm" c="dimmed">{t('operator:live.obsHelp')}</Text>
        </div>
        <HandoffUrl
          testId="obs-active-url"
          url={overlayUrl}
          resolvingLabel={t('operator:live.resolvingObs')}
          copied={copiedHandoff}
          onCopy={onCopy}
        />
        <Group justify="space-between" className="mini-preview" wrap="nowrap">
          <Text>{selectedSet.playerOne.name}</Text>
          <Text fw={800}>{selectedSet.playerOne.score} - {selectedSet.playerTwo.score}</Text>
          <Text ta="right">{selectedSet.playerTwo.name}</Text>
        </Group>
        <Text size="sm" c="dimmed">
          {selectedSet.matchFormat === 'first-to'
            ? t('common:match.firstTo', { count: maxScore })
            : t('common:match.bestOf', { count: selectedSet.bestOf })}
        </Text>
      </Stack>
    </Paper>
  );
}

function ShortcutInstruction({ children }: { children: ReactNode }) {
  return <Group gap={6} wrap="nowrap">
    <Divider orientation="vertical" h={20} />
    {children}
  </Group>;
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
      <Code data-testid={testId} block>{url ?? resolvingLabel}</Code>
      <OverlayUrlMenu copied={copied} disabled={!url} onCopy={onCopy} />
    </Group>
  );
}
