import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { XLogoIcon } from '@phosphor-icons/react/dist/csr/XLogo';
import { canonicalGameId, type GameProfile } from '@shared/gameProfiles';
import { scoreboardPhotoLayout } from '@shared/scoreboardPhotos';
import { normalizeXHandle } from '@shared/playerLibrary';
import type { SelectedSetState } from '@shared/models';
import { DisplayText } from '../DisplayText';
import { scoreboardDetailLayouts, scoreboardDetailsTop } from './scoreboardDetailLayouts';
import './scoreboardDetails.css';
import { scoreboardSeed } from './scoreboardSeed';

export type ScoreboardDetailKind = 'xHandle' | 'pronouns' | 'seed';

export function ScoreboardDetailPill({
  kind,
  value,
  side,
  themeClass
}: {
  kind: ScoreboardDetailKind;
  value: string;
  side: 'left' | 'right';
  themeClass: string;
}) {
  return (
    <span className={`scoreboard-detail-pill ${themeClass}`} data-detail={kind} data-player-side={side} title={value}>
      {kind === 'xHandle' && (
        <XLogoIcon className="scoreboard-detail-icon" size={14} weight="bold" aria-hidden="true" />
      )}
      <span className="scoreboard-detail-label">
        <DisplayText text={value} />
      </span>
    </span>
  );
}

export function ScoreboardDetails({
  selectedSet,
  profile,
  topInset = 0
}: {
  selectedSet: SelectedSetState;
  profile: GameProfile;
  topInset?: number;
}) {
  const { t } = useTranslation(['common', 'overlay']);
  const gameId =
    scoreboardPhotoLayout(selectedSet)?.gameId ??
    canonicalGameId(selectedSet.assetCatalogSlug) ??
    canonicalGameId(selectedSet.gameId) ??
    selectedSet.gameId;
  const layout = scoreboardDetailLayouts[gameId];
  const top = scoreboardDetailsTop(gameId, topInset);
  return (
    <aside className="scoreboard-details" aria-label={t('overlay:playerDetails')}>
      {[selectedSet.playerOne, selectedSet.playerTwo].map((player, index) => {
        const side = index === 0 ? 'left' : 'right';
        const handle = normalizeXHandle(player.xHandle);
        const seed = scoreboardSeed(selectedSet, index);
        const fields: Array<{ kind: ScoreboardDetailKind; value?: string }> = [
          { kind: 'xHandle', value: handle ? `@${handle}` : undefined },
          { kind: 'pronouns', value: player.pronouns?.trim() || undefined },
          {
            kind: 'seed',
            value: seed !== undefined ? t('match.seed', { seed }) : undefined
          }
        ];
        const visible = fields.filter((field): field is { kind: ScoreboardDetailKind; value: string } =>
          Boolean(field.value)
        );
        if (!visible.length) return null;
        const style: CSSProperties = {
          top: `${top / 10.8}%`,
          width: `${layout.width / 19.2}%`,
          [side]: `${layout.left / 19.2}%`
        };
        return (
          <div
            className="scoreboard-detail-group"
            data-player-side={side}
            data-entrance={`details-${side}`}
            style={style}
            key={side}
          >
            {visible.map(({ kind, value }) => (
              <ScoreboardDetailPill
                kind={kind}
                value={value}
                side={side}
                themeClass={profile.overlay.themeClass}
                key={kind}
              />
            ))}
          </div>
        );
      })}
    </aside>
  );
}
