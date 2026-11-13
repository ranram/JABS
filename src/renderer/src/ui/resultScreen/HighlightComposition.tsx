import type { PlayerState } from '@shared/models';
import { defaultPlayerMediaPlacement, type PlayerMediaPlacement } from '@shared/mediaPlacement';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogImage } from '../CatalogImage';
import { DisplayText } from '../DisplayText';
import { useIdentityTextFit } from '../useIdentityTextFit';
import { ResultArtwork } from './ResultArtwork';
import { highlightLayout, highlightLayoutStyle } from './highlightLayout';
import { HighlightConfetti } from './HighlightConfetti';
import type { HighlightArtworkFrame } from './highlightArtwork';
import './highlight.css';

export function HighlightComposition({
  winner,
  kind,
  characterUrl,
  characterFrame,
  photoUrl,
  sponsorLogoUrl,
  logoUrl,
  placement,
  showIdentity,
  showWinnerTitle,
  showConfetti,
  ready,
  presentationKey,
  editing
}: {
  winner: PlayerState;
  kind: 'winner' | 'champion';
  characterUrl?: string;
  characterFrame?: HighlightArtworkFrame;
  photoUrl?: string;
  sponsorLogoUrl?: string;
  logoUrl?: string;
  placement?: PlayerMediaPlacement;
  showIdentity: boolean;
  showWinnerTitle: boolean;
  showConfetti: boolean;
  ready: boolean;
  presentationKey: string;
  editing?: ComponentProps<typeof ResultArtwork>['editing'];
}) {
  const { t } = useTranslation('overlay');
  const sponsor = winner.prefix?.trim() || winner.sponsor?.trim();
  const basePlacement = placement ?? defaultPlayerMediaPlacement();
  const characterPlacement = basePlacement.character;
  const customCharacter = characterPlacement.x !== 0 || characterPlacement.y !== 0 || characterPlacement.scale !== 1;
  const layout = highlightLayout(Boolean(photoUrl), Boolean(characterUrl), showIdentity);
  const autoLayout =
    !customCharacter && characterFrame
      ? highlightLayout(Boolean(photoUrl), Boolean(characterUrl), showIdentity, characterFrame)
      : layout;
  // Keep saved edits in the existing stage coordinates, including the first drag from automatic framing.
  const artworkPlacement =
    autoLayout === layout
      ? basePlacement
      : {
          ...basePlacement,
          character: { ...characterPlacement, y: (autoLayout.character.y - layout.character.y) / 1080 }
        };
  return (
    <section
      className="highlight-composition"
      aria-label={t(kind === 'champion' ? 'championAnnouncement' : 'winnerAnnouncement')}
    >
      <div className="highlight-stage" data-entrance="highlight-stage" style={highlightLayoutStyle(layout)}>
        {sponsorLogoUrl && (
          <CatalogImage className="highlight-sponsor-backdrop" src={sponsorLogoUrl} entrance="highlight-sponsor" />
        )}
        {logoUrl && <CatalogImage className="highlight-event-logo" src={logoUrl} entrance="highlight-logo" />}
        <div className="highlight-subjects">
          <ResultArtwork
            characterUrl={characterUrl}
            photoUrl={photoUrl}
            placement={artworkPlacement}
            editing={editing}
          />
        </div>
        <div className="highlight-impact" data-entrance="highlight-impact" aria-hidden="true" />
        <header className="highlight-copy">
          <div
            className="highlight-title"
            data-entrance="highlight-title"
            data-result-title-hidden={!showWinnerTitle || undefined}
          >
            {t(kind === 'champion' ? 'championAnnouncement' : 'winnerAnnouncement')}
          </div>
          {showIdentity && <HighlightName name={winner.name} sponsor={sponsor} />}
        </header>
        {showConfetti && <HighlightConfetti ready={ready} presentationKey={presentationKey} />}
      </div>
    </section>
  );
}

function HighlightName({ name, sponsor }: { name: string; sponsor?: string }) {
  const identity = [sponsor, name].filter(Boolean).join(' | ');
  const nameRef = useIdentityTextFit(identity, '.highlight-name-text');
  return (
    <strong ref={nameRef} className="highlight-name" data-entrance="highlight-name">
      <span className="highlight-name-text">
        {sponsor && (
          <>
            <span className="highlight-sponsor-name">
              <DisplayText text={sponsor} />
            </span>
            {' | '}
          </>
        )}
        <DisplayText text={name} />
      </span>
    </strong>
  );
}
