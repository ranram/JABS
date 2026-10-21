import { useTranslation } from 'react-i18next';
import type { PlayerState } from '@shared/models';
import type { CharacterPortrait } from '../../characterPortraits';
import { CatalogImage } from '../CatalogImage';
import { ResultArtwork } from './ResultArtwork';
import { DisplayText } from '../DisplayText';
import { useVictoryTextFit } from './useVictoryTextFit';
import './victory.css';
import './spotlight.css';

type Props = {
  variant?: 'victory' | 'spotlight';
  winner: PlayerState;
  kind: 'winner' | 'champion';
  round: string;
  characterNames: string[];
  characterUrl?: string;
  photoUrl?: string;
  sponsorLogoUrl?: string;
  logoUrl?: string;
  portraits: CharacterPortrait[];
};

export function VictoryComposition({
  variant = 'victory',
  winner,
  kind,
  round,
  characterNames,
  characterUrl,
  photoUrl,
  sponsorLogoUrl,
  logoUrl,
  portraits
}: Props) {
  const { t } = useTranslation('overlay');
  const sponsor = winner.prefix?.trim() || winner.sponsor?.trim();
  const hasHero = Boolean(characterUrl || photoUrl);
  const nameRef = useVictoryTextFit(`${sponsor ?? ''} ${winner.name}`, hasHero);
  const announcement = t(kind === 'champion' ? 'championAnnouncement' : 'winnerAnnouncement');
  const spotlight = variant === 'spotlight';

  return (
    <section className={`victory-composition${hasHero ? ' has-hero' : ' is-type-led'}`} aria-label={announcement}>
      <div className="victory-ground" data-entrance="victory-ground" aria-hidden="true" />
      {!spotlight && (
        <>
          <div className="victory-band" data-entrance="victory-band" aria-hidden="true" />
          <div className="victory-impact" data-entrance="victory-impact" aria-hidden="true" />
        </>
      )}
      <div className="victory-opening" data-entrance="victory-opening" aria-hidden="true">
        {announcement}
      </div>
      {logoUrl && <CatalogImage className="victory-logo" src={logoUrl} entrance="victory-logo" />}

      <div className="victory-copy" data-entrance="victory-copy">
        <div className="victory-title" data-entrance="victory-title">
          <span>{announcement}</span>
        </div>
        <strong ref={nameRef} className="victory-name" data-entrance="victory-name">
          {sponsor && (
            <>
              <span className="victory-sponsor">
                <DisplayText text={sponsor} />
              </span>{' '}
            </>
          )}
          <DisplayText text={winner.name} />
        </strong>
        <div className="victory-context">
          {spotlight && sponsorLogoUrl && (
            <CatalogImage className="victory-sponsor-logo" src={sponsorLogoUrl} entrance="victory-sponsor" />
          )}
          <div className="victory-details" data-entrance="victory-details">
            {round && (
              <span className="victory-round">
                <DisplayText text={round} />
              </span>
            )}
            {characterNames.length > 0 && (
              <span className="victory-character-label">
                <DisplayText text={characterNames.join(' / ')} />
              </span>
            )}
          </div>
        </div>
        {!spotlight && sponsorLogoUrl && (
          <CatalogImage className="victory-sponsor-logo" src={sponsorLogoUrl} entrance="victory-sponsor" />
        )}
      </div>

      <ResultArtwork characterUrl={characterUrl} photoUrl={photoUrl} portraits={portraits} shadow={!spotlight} />
    </section>
  );
}
