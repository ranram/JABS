// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultPlayerMediaPlacement, type PlayerMediaMode } from '@shared/mediaPlacement';
import { mountView } from '../hooks/hookTestHarness';
import { PlayerMediaLayers } from './PlayerMediaLayers';

afterEach(() => document.getElementById('media-fit-test')?.remove());

it.each([
  ['Top 8', 'operator/topEight.css', 'top8-card-art', 'top8-character-art', 'top8-player-photo'],
  ['Thumbnail', 'operator/thumbnail.css', 'thumbnail-subject', 'thumbnail-character', 'thumbnail-player-photo'],
  ['Versus', 'versusOverlay.css', 'versus-subject', 'versus-character', 'versus-photo']
])(
  '%s keeps the whole character available in editable and read-only combined compositions',
  async (_screen, stylesheet, containerClass, characterClass, photoClass) => {
    const css = document.createElement('style');
    css.id = 'media-fit-test';
    css.textContent = [stylesheet, 'playerMediaLayers.css']
      .map((file) => readFileSync(`src/renderer/src/ui/${file}`, 'utf8'))
      .join('\n');
    document.head.append(css);
    const placement = defaultPlayerMediaPlacement();
    placement.character = { ...placement.character, x: 0.1, scale: 1.25 };
    let mode: PlayerMediaMode = 'character';
    let editing = true;
    const view = await mountView(() =>
      h(
        'div',
        { className: containerClass },
        h(PlayerMediaLayers, {
          mode,
          name: 'Player One',
          characterUrl: 'art.png',
          photoUrl: 'photo.png',
          characterClass,
          photoClass,
          placement,
          onSelect: editing ? vi.fn() : undefined,
          onChange: editing ? vi.fn() : undefined
        })
      )
    );
    const character = () => view.container.querySelector<HTMLImageElement>('.player-media-character')!;
    function checkVersusHeightFit() {
      if (_screen !== 'Versus') return;
      const style = getComputedStyle(character());
      expect(style.width).toBe('auto');
      expect(style.height).toBe('100%');
      expect(style.maxWidth).toBe('none');
      expect(style.objectFit).toBe('contain');
    }
    checkVersusHeightFit();
    const transform = character().style.transform;
    mode = 'combined';
    await view.rerender();
    expect(getComputedStyle(character()).objectFit).toBe('contain');
    checkVersusHeightFit();
    expect(character().style.transform).toBe(transform);
    expect(view.container.querySelector('.player-media-photo')).not.toBeNull();
    editing = false;
    await view.rerender();
    expect(getComputedStyle(character()).objectFit).toBe('contain');
    checkVersusHeightFit();
    expect(character().style.transform).toBe(transform);
    mode = 'character';
    await view.rerender();
    checkVersusHeightFit();
    expect(character().style.transform).toBe(transform);
    expect(view.container.querySelector('.player-media-photo')).toBeNull();
  }
);
