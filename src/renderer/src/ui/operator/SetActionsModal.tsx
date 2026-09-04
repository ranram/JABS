import {
  Alert,
  Button,
  Group,
  Modal,
  MultiSelect,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useMemo, type ReactNode } from 'react';
import { bestOfOptionsForGame, scoreLimitForBestOf } from '@shared/gameProfiles';
import { maxCharactersForGame, playerCharacters } from '@shared/characterTeams';
import type { SelectedSetState, SetSummary } from '@shared/models';
import type { StartggReportReadiness } from '@shared/startggReporting';
import { QuickScore } from './ScoreControls';
import { phaseContext, setPhaseContext } from './operatorUtils';

type SetActionsModalProps = {
  target?: SetSummary;
  quickScore?: SelectedSetState;
  receipt?: string;
  quickReadiness: StartggReportReadiness;
  quickReadinessReason: string;
  loading: boolean;
  quickScoreLoading: boolean;
  gameProfileAvailable: boolean;
  characterOptions: readonly string[];
  showSendToStream?: boolean;
  renderCharacterSelect?(props: CharacterSelectRenderProps): ReactNode;
  onClose(): void;
  onSendToStream(setId: string): void;
  onBeginQuickScore(): void;
  onChangeBestOf(bestOf: number): void;
  onChangeScore(side: 'one' | 'two', score: number): void;
  onChangeCharacters(side: 'one' | 'two', characters: string[]): void;
  onResetScores(): void;
  onReport(): void;
};

export function SetActionsModal({
  target,
  quickScore,
  receipt,
  quickReadiness,
  quickReadinessReason,
  loading,
  quickScoreLoading,
  gameProfileAvailable,
  characterOptions,
  showSendToStream = true,
  renderCharacterSelect,
  onClose,
  onSendToStream,
  onBeginQuickScore,
  onChangeBestOf,
  onChangeScore,
  onChangeCharacters,
  onResetScores,
  onReport
}: SetActionsModalProps) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const characterData = useMemo(
    () => [...characterOptions]
      .sort((left, right) => left.localeCompare(right, locale))
      .map((character) => ({ value: character, label: character })),
    [characterOptions, locale]
  );

  if (!target) return null;

  const targetContext = [
    setPhaseContext(target),
    target.round ?? t('common:match.set', { id: target.id })
  ].filter(Boolean).join(' · ');

  return (
    <Modal
      opened
      onClose={onClose}
      closeOnClickOutside={!quickScoreLoading}
      closeOnEscape={!quickScoreLoading}
      withCloseButton={!quickScoreLoading}
      title={(
        <Stack gap={2}>
          <Text size="xs" c="dimmed">{targetContext}</Text>
          <Title order={2} size="h4" id="set-action-title">
            {target.entrantOne?.name ?? t('operator:selector.tbd')}{' '}
            {t('common:match.versus')}{' '}
            {target.entrantTwo?.name ?? t('operator:selector.tbd')}
          </Title>
        </Stack>
      )}
      aria-labelledby="set-action-title"
      centered
      size="xl"
      overlayProps={{ backgroundOpacity: 0.72, blur: 5 }}
      classNames={{
        content: 'set-action-dialog',
        header: 'set-action-heading',
        body: 'set-action-body'
      }}
    >
      {!quickScore && !receipt ? (
        <Stack gap="md">
          <SimpleGrid className="set-action-choices" type="container" cols={{ base: 1, '32rem': showSendToStream ? 2 : 1 }}>
            {showSendToStream && (
              <Button
                className="set-action-choice stream-choice"
                variant="light"
                size="lg"
                h="auto"
                py="md"
                disabled={loading || quickScoreLoading || !gameProfileAvailable}
                onClick={() => onSendToStream(target.id)}
              >
                <Stack gap={4} align="flex-start">
                  <Text fw={700}>{t('operator:setActions.send')}</Text>
                  <Text className="set-action-description" size="sm" fw={400} lh={1.45}>
                    {t('operator:setActions.sendHelp')}
                  </Text>
                </Stack>
              </Button>
            )}
            <Button
              className="set-action-choice score-choice"
              variant="light"
              color="orange"
              size="lg"
              h="auto"
              py="md"
              disabled={quickScoreLoading || !gameProfileAvailable || target.state === '3'}
              loading={quickScoreLoading}
              onClick={onBeginQuickScore}
            >
              <Stack gap={4} align="flex-start">
                <Text fw={700}>
                  {quickScoreLoading ? t('operator:setActions.loading') : t('operator:setActions.quick')}
                </Text>
                <Text className="set-action-description" size="sm" fw={400} lh={1.45}>
                  {t('operator:setActions.quickHelp')}
                </Text>
              </Stack>
            </Button>
          </SimpleGrid>
          {target.state === '3' && (
            <Alert color="yellow">{t('operator:setActions.alreadyComplete')}</Alert>
          )}
        </Stack>
      ) : receipt ? (
        <Alert color="green" title={t('operator:setActions.accepted')}>
          <Stack gap="sm">
            <Text fw={700}>{receipt}</Text>
            <Text size="sm">{t('operator:setActions.streamUnchanged')}</Text>
            <Button onClick={onClose} w="fit-content">{t('common:actions.done')}</Button>
          </Stack>
        </Alert>
      ) : quickScore ? (
        <Stack gap="md" className="quick-score-sheet">
          <Group justify="space-between" align="flex-end" wrap="wrap">
            <Select
              label={t('operator:editor.matchLength')}
              value={String(quickScore.bestOf)}
              disabled={quickScoreLoading}
              allowDeselect={false}
              data={bestOfOptionsForGame(quickScore.gameId).map((bestOf) => ({
                value: String(bestOf),
                label: t('common:match.bestOf', { count: bestOf })
              }))}
              onChange={(value) => value && onChangeBestOf(Number(value))}
            />
            <Text size="sm" c="dimmed">
              {[
                phaseContext(quickScore),
                quickScore.round ?? t('operator:setActions.bracketSet'),
                t('common:match.set', { id: quickScore.setId ?? '' })
              ].filter(Boolean).join(' · ')}
            </Text>
          </Group>

          {quickScore.gameHistory === undefined && (
            <Alert color="yellow">{t('operator:setActions.historyWarning')}</Alert>
          )}

          <SimpleGrid type="container" cols={{ base: 1, '30rem': 2 }}>
            {(['one', 'two'] as const).map((side) => {
              const player = side === 'one' ? quickScore.playerOne : quickScore.playerTwo;
              const selectedCharacters = playerCharacters(player);
              const unavailable = selectedCharacters
                .filter((character) => !characterOptions.includes(character))
                .map((character) => ({
                  value: character,
                  label: t('operator:editor.unavailableCharacter', { character })
                }));
              return (
                <Stack key={side} gap="xs">
                  <QuickScore
                    label={player.name}
                    score={player.score}
                    maxScore={scoreLimitForBestOf(quickScore.gameId, quickScore.bestOf)}
                    disabled={quickScoreLoading}
                    onChange={(score) => onChangeScore(side, score)}
                  />
                  {renderCharacterSelect ? renderCharacterSelect({
                    label: t('operator:setActions.charactersFor', { player: player.name }),
                    description: t('operator:setActions.characterHelp'),
                    options: [...unavailable, ...characterData],
                    value: selectedCharacters,
                    maxValues: maxCharactersForGame(quickScore.gameId),
                    disabled: quickScoreLoading,
                    onChange: (characters) => onChangeCharacters(side, characters)
                  }) : (
                    <MultiSelect
                      searchable
                      clearable
                      label={t('operator:setActions.charactersFor', { player: player.name })}
                      description={t('operator:setActions.characterHelp')}
                      inputWrapperOrder={['label', 'input', 'description', 'error']}
                      data={[...unavailable, ...characterData]}
                      value={selectedCharacters}
                      maxValues={maxCharactersForGame(quickScore.gameId)}
                      disabled={quickScoreLoading}
                      onChange={(characters) => onChangeCharacters(side, characters)}
                    />
                  )}
                </Stack>
              );
            })}
          </SimpleGrid>

          <Paper withBorder p="md">
            <Text size="xs" c="dimmed">{t('operator:setActions.resultCheck')}</Text>
            <Text fw={700}>
              {quickReadiness.ready
                ? t('operator:setActions.winner', {
                    winner: quickReadiness.result.winnerName,
                    winnerScore: quickReadiness.result.winnerScore,
                    loserScore: quickReadiness.result.loserScore
                  })
                : quickReadinessReason}
            </Text>
          </Paper>

          <Group justify="space-between">
            <Button variant="default" disabled={quickScoreLoading} onClick={onResetScores}>
              {t('common:actions.resetScores')}
            </Button>
            <Button
              data-testid="quick-report-startgg-result"
              loading={quickScoreLoading}
              disabled={!quickReadiness.ready}
              onClick={onReport}
            >
              {t('operator:setActions.confirm')}
            </Button>
          </Group>
          <Text size="xs" c="dimmed">{t('operator:setActions.safety')}</Text>
        </Stack>
      ) : null}
    </Modal>
  );
}

export type CharacterSelectRenderProps = {
  label: string;
  description: string;
  options: Array<{ value: string; label: string }>;
  value: string[];
  maxValues: number;
  disabled: boolean;
  onChange(value: string[]): void;
};
