import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Paper, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import type { GameProfile } from '@shared/gameProfiles';
import type { GameCharacterAsset, LogoAsset, SetSummary, StartggPhase, StartggSetScope } from '@shared/models';
import { charactersForAssetCatalog } from '@shared/characterRosters';
import { detectExplicitTopEightOpeningSets, detectTopEightOpeningSets, type TopEightMatchupsState } from '@shared/topEightMatchups';
import { api } from '../../api';
import { BufferedTextInput } from './BufferedTextInput';
import { CharacterOutfitSelect } from './CharacterOutfitSelect';
import { MediaFoldersAccordion } from './MediaFoldersAccordion';
import { TopEightMatchupsPreview } from './TopEightMatchupsPreview';

export function TopEightMatchupsControls({ profiles, logos, selectedEventId, selectedEventName, phases, assetCatalogSlug }: {
  profiles: GameProfile[]; logos: LogoAsset[]; selectedEventId?: string; selectedEventName?: string; phases: StartggPhase[]; assetCatalogSlug?: string;
}) {
  const { t } = useTranslation(['operator', 'common']);
  const [state, setState] = useState<TopEightMatchupsState>();
  const [assets, setAssets] = useState<GameCharacterAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [progress, setProgress] = useState<string>();
  const stateRef = useRef(state); stateRef.current = state;
  useEffect(() => { void loadState(); }, []);
  useEffect(() => {
    if (!state?.assetCatalogSlug) return;
    void api.gameCharacterAssets(state.assetCatalogSlug).then(({ assets }) => setAssets(assets)).catch(showError);
  }, [state?.assetCatalogSlug]);
  useEffect(() => {
    if (!state || !assetCatalogSlug || state.assetCatalogSlug === assetCatalogSlug) return;
    const stylingGameId = profiles.some(({ id }) => id === assetCatalogSlug) ? assetCatalogSlug as typeof state.stylingGameId : state.stylingGameId;
    void update({ assetCatalogSlug, stylingGameId });
  }, [assetCatalogSlug, state?.assetCatalogSlug]);
  const characters = useMemo(() => [...new Set([
    ...charactersForAssetCatalog(state?.assetCatalogSlug ?? ''),
    ...assets.map(({ character }) => character)
  ])].sort(), [assets, state?.assetCatalogSlug]);
  async function loadState() {
    setLoadError(undefined);
    try { setState(await api.topEightMatchupsState()); }
    catch (error) {
      const message = translatedError(error);
      setLoadError(message); showError(error);
    }
  }
  async function update(patch: Partial<TopEightMatchupsState>) {
    if (!stateRef.current) return;
    const next = { ...stateRef.current, ...patch }; setState(next); stateRef.current = next;
    try { const saved = await api.updateTopEightMatchupsState(next); setState(saved); stateRef.current = saved; } catch (error) { showError(error); }
  }
  function updatePlayer(index: number, patch: Partial<TopEightMatchupsState['matchups'][number]['players'][number]>) {
    const current = stateRef.current; if (!current) return;
    const matchups = current.matchups.map((matchup, matchupIndex) => matchupIndex !== Math.floor(index / 2) ? matchup : ({ ...matchup, players: matchup.players.map((player, playerIndex) => playerIndex === index % 2 ? { ...player, ...patch } : player) as typeof matchup.players }));
    void update({ matchups });
  }
  async function detect() {
    if (!selectedEventId || !state) return;
    const topEightPhase = phases.find(({ name }) => isTopEightPhaseName(name));
    const scope: StartggSetScope = topEightPhase
      ? { type: 'phase', eventId: selectedEventId, phaseId: topEightPhase.id }
      : { type: 'event', eventId: selectedEventId };
    setLoading(true);
    setProgress(topEightPhase
      ? t('operator:topEightMatchups.explicitPhase', { phase: topEightPhase.name })
      : t('operator:topEightMatchups.topologyFallback'));
    try {
      const first = await api.sets(scope, 1, 50);
      const sets: SetSummary[] = [...first.sets];
      const pages = first.pageInfo.totalPages;
      if (pages > 200) throw new Error(t('operator:topEightMatchups.tooLarge'));
      for (let start = 2; start <= pages; start += 4) {
        const pageNumbers = Array.from({ length: Math.min(4, pages - start + 1) }, (_, index) => start + index);
        setProgress(t('operator:topEightMatchups.pages', {
          start,
          end: Math.min(start + 3, pages),
          total: pages
        }));
        const results = await Promise.all(pageNumbers.map((page) => api.sets(scope, page, 50)));
        sets.push(...results.flatMap((result) => result.sets));
      }
      setProgress(topEightPhase
        ? t('operator:topEightMatchups.analyzePhase', { phase: topEightPhase.name })
        : t('operator:topEightMatchups.analyzeEvent', { count: sets.length }));
      const opening = topEightPhase ? detectExplicitTopEightOpeningSets(sets) : detectTopEightOpeningSets(sets);
      if (!opening) throw new Error(t('operator:topEightMatchups.notDetected'));
      await update({ assetCatalogSlug: assetCatalogSlug ?? state.assetCatalogSlug, eventName: selectedEventName ?? state.eventName, matchups: opening.map((set, index) => ({ setId: set.id, bracket: index < 2 ? 'winners' as const : 'losers' as const, players: [set.entrantOne, set.entrantTwo].map((entrant, playerIndex) => ({ entrantId: entrant?.id, name: entrant?.name ?? `Player ${index * 2 + playerIndex + 1}`, sponsor: entrant?.sponsor })) as [{ name: string; entrantId?: string; sponsor?: string }, { name: string; entrantId?: string; sponsor?: string }] })) });
      notifications.show({ color: 'green', title: t('operator:topEightMatchups.title'), message: t('operator:topEightMatchups.detected') });
    } catch (error) { showError(error); } finally { setLoading(false); setProgress(undefined); }
  }
  if (!state) return <Stack gap="sm"><Text c={loadError ? 'red' : 'dimmed'}>{loadError ?? t('operator:topEightMatchups.loading')}</Text>{loadError && <Button variant="default" onClick={() => void loadState()}>{t('operator:topEightMatchups.retry')}</Button>}</Stack>;
  return <Stack gap="md">
    <SimpleGrid cols={{ base: 1, sm: 2 }}><Select label={t('operator:workspaces.styling')} value={state.stylingGameId} data={profiles.map((profile) => ({ value: profile.id, label: profile.styleName }))} onChange={(value) => value && void update({ stylingGameId: value as typeof state.stylingGameId })} /><BufferedTextInput label={t('operator:topEight.tournament')} value={state.tournamentName} onCommit={(tournamentName) => void update({ tournamentName })} /><BufferedTextInput label={t('operator:topEightMatchups.eventName')} value={state.eventName ?? ''} onCommit={(eventName) => void update({ eventName: eventName || undefined })} /><Select searchable clearable label={t('operator:topEight.tournamentLogo')} placeholder={t('operator:topEight.noLogo')} value={state.logoAssetId ?? null} data={logos.map((logo) => ({ value: logo.id, label: logo.label }))} onChange={(logoAssetId) => void update({ logoAssetId: logoAssetId || undefined })} /></SimpleGrid>
    <Button loading={loading} disabled={!selectedEventId} onClick={() => void detect()}>{t('operator:topEightMatchups.detect')}</Button>
    {progress && <Text role="status" c="dimmed" size="sm">{progress}</Text>}
    <TopEightMatchupsPreview state={state} />
    <SimpleGrid cols={{ base: 1, md: 2 }}>{state.matchups.flatMap((matchup, matchupIndex) => matchup.players.map((player, playerIndex) => { const index = matchupIndex * 2 + playerIndex; return <Paper key={index} p="sm" withBorder><Text fw={800} mb="xs">{t(`operator:topEightMatchups.${matchup.bracket}`)} {matchupIndex % 2 + 1} · {t('operator:topEightMatchups.player', { number: playerIndex + 1 })}</Text><Stack gap="xs"><BufferedTextInput label={t('operator:topEight.playerTag')} value={player.name} onCommit={(name) => updatePlayer(index, { name })} /><BufferedTextInput label={t('operator:topEight.sponsor')} value={player.sponsor ?? ''} onCommit={(sponsor) => updatePlayer(index, { sponsor: sponsor || undefined })} /><Select searchable clearable label={t('operator:topEightMatchups.portrait')} value={player.character ?? null} data={characters} onChange={(character) => updatePlayer(index, { character: character || undefined, characterAssetId: undefined })} /><CharacterOutfitSelect subject={player} assets={assets} onChange={(characterAssetId) => updatePlayer(index, { characterAssetId })} /></Stack></Paper>; }))}</SimpleGrid>
    <MediaFoldersAccordion gameAssetSubpath={`${state.assetCatalogSlug}/characters`} />
  </Stack>;

  function showError(error: unknown) {
    notifications.show({ color: 'red', title: t('operator:topEightMatchups.title'), message: translatedError(error) });
  }

  function translatedError(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    switch (message) {
      case 'topEightMatchups.serializeFailed': return t('operator:topEightMatchups.serializeFailed');
      case 'topEightMatchups.unavailable': return t('operator:topEightMatchups.unavailable');
      case 'topEightMatchups.invalidStyling': return t('operator:topEightMatchups.invalidStyling');
      case 'topEightMatchups.invalidCatalog': return t('operator:topEightMatchups.invalidCatalog');
      case 'topEightMatchups.invalidTournamentName': return t('operator:topEightMatchups.invalidTournamentName');
      case 'topEightMatchups.invalidMatchupCount': return t('operator:topEightMatchups.invalidMatchupCount');
      case 'topEightMatchups.invalidBracketOrder': return t('operator:topEightMatchups.invalidBracketOrder');
      case 'topEightMatchups.invalidPlayerName': return t('operator:topEightMatchups.invalidPlayerName');
      case 'topEightMatchups.blockedCharacter': return t('operator:topEightMatchups.blockedCharacter');
      case 'topEightMatchups.blockedTournamentName': return t('operator:topEightMatchups.blockedTournamentName');
      case 'topEightMatchups.blockedEventName': return t('operator:topEightMatchups.blockedEventName');
      case 'topEightMatchups.blockedPlayerName': return t('operator:topEightMatchups.blockedPlayerName');
      case 'topEightMatchups.blockedSponsor': return t('operator:topEightMatchups.blockedSponsor');
      default: return message || t('operator:topEightMatchups.unavailable');
    }
  }
}

function isTopEightPhaseName(name: string): boolean {
  return /(^|\s)top\s*8($|\s)/iu.test(name.normalize('NFKC').replace(/[_-]+/gu, ' ').trim());
}
