import { gameProfiles, type GameId } from '@shared/gameProfiles';

type DetailLayout = { top: number; left: number; width: number; belowHudTop?: number };

// Coordinates use the 1920×1080 game references. The right group mirrors the left.
export const scoreboardDetailLayouts: Record<GameId, DetailLayout> = {
  'street-fighter-6': { top: 146, left: 172, width: 620 },
  'tekken-8': { top: 166, left: 438, width: 420 },
  'avatar-legends': { top: 118, left: 40, width: 478 },
  'marvel-tokon': { top: 118, left: 230, width: 348 },
  'guilty-gear-strive': { top: 62, left: 260, width: 500, belowHudTop: 206 },
  '2xko': { top: 150, left: 237, width: 329 },
  'blazblue-centralfiction': { top: 146, left: 260, width: 560 },
  'fatal-fury-city-of-the-wolves': { top: 109, left: 220, width: 420 },
  'granblue-fantasy-versus-rising': { top: 178, left: 224, width: 560 },
  'king-of-fighters-xv': { top: 141, left: 170, width: 480 },
  'melty-blood-type-lumina': { top: 164, left: 238, width: 560 },
  'mortal-kombat-1': { top: 94, left: 540, width: 300 },
  'ultimate-marvel-vs-capcom-3': { top: 200, left: 414, width: 440 },
  'super-smash-bros-ultimate': { top: 64, left: 310, width: 500 },
  'under-night-in-birth-ii-sys-celes': { top: 147, left: 213, width: 450 }
};

export function scoreboardDetailsTop(gameId: GameId, topInset: number) {
  const layout = scoreboardDetailLayouts[gameId];
  // Clearance follows the game's HUD, so choosing another style cannot move these details.
  const gameHudBottom = gameProfiles[gameId].overlay.hudSafeZone.bottom;
  const photoClearanceTop = gameHudBottom + topInset + 8;
  if (photoClearanceTop <= layout.top) return layout.top;
  return Math.max(layout.belowHudTop ?? layout.top, photoClearanceTop);
}
