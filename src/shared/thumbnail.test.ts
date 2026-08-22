import { describe, expect, it } from 'vitest';
import { createThumbnailDraft, thumbnailMatchHeadline, validateThumbnailDraft } from './thumbnail';

describe('thumbnail model', () => {
  it('creates and validates a useful default draft and imported headline', () => {
    const draft = createThumbnailDraft();
    expect(validateThumbnailDraft(draft)).toBe(true);
    draft.players[1].name = '';
    expect(validateThumbnailDraft(draft)).toBe(false);
    expect(thumbnailMatchHeadline({ phase: 'Top 8', phaseGroup: 'A1', round: 'Winners Final' })).toBe('Top 8 · Winners Final');
  });
});
