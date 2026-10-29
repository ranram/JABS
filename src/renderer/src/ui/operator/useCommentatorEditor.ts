import { useEffect, useEffectEvent, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { withCommentatorsSwapped, type CommentatorPresentation, type CommentatorState } from '@shared/commentators';
import { api } from '../../api';
import { COMMENTATORS_SWAPPED_EVENT, saveSwappedCommentators } from './swapCommentators';

export function useCommentatorEditor() {
  const { t } = useTranslation('operator');
  const [draft, setDraft] = useState<CommentatorState>();
  const [saving, setSaving] = useState(false);
  const reportLoadError = useEffectEvent((error: unknown) => {
    notifyError(error, t('workspaces.commentator.failedTitle'), t('workspaces.commentator.failed'));
  });
  useEffect(() => {
    let active = true;
    void api
      .commentatorState()
      .then((state) => {
        if (active) setDraft(state);
      })
      .catch((error) => {
        if (active) reportLoadError(error);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleCommentatorsSwapped = () => {
      setDraft((current) => (current ? withCommentatorsSwapped(current) : current));
    };
    window.addEventListener(COMMENTATORS_SWAPPED_EVENT, handleCommentatorsSwapped);
    return () => window.removeEventListener(COMMENTATORS_SWAPPED_EVENT, handleCommentatorsSwapped);
  }, []);

  async function present(presentation: CommentatorPresentation) {
    if (!draft) return;
    setSaving(true);
    try {
      const next = await api.updateCommentatorState({ ...draft, presentation });
      setDraft(next);
      notifications.show({
        title: t('notices.done'),
        message: t(`workspaces.commentator.${presentation}`),
        color: presentation === 'hidden' ? 'gray' : 'green'
      });
    } catch (error) {
      notifyError(error, t('workspaces.commentator.failedTitle'), t('workspaces.commentator.failed'));
    } finally {
      setSaving(false);
    }
  }

  async function updateSettings(patch: Partial<Pick<CommentatorState, 'stylingGameId'>>) {
    if (!draft) return;
    setSaving(true);
    try {
      const next = await api.updateCommentatorState({ ...draft, ...patch });
      setDraft(next);
    } catch (error) {
      notifyError(error, t('workspaces.commentator.failedTitle'), t('workspaces.commentator.failed'));
    } finally {
      setSaving(false);
    }
  }

  function updateCommentator(index: 0 | 1, patch: Partial<CommentatorState['commentators'][number]>) {
    setDraft(
      (current) =>
        current && {
          ...current,
          commentators: current.commentators.map((commentator, commentatorIndex) =>
            commentatorIndex === index ? { ...commentator, ...patch } : commentator
          ) as CommentatorState['commentators']
        }
    );
  }

  async function swapCommentators() {
    if (!draft) return;
    setSaving(true);
    try {
      setDraft(await saveSwappedCommentators(draft));
    } catch (error) {
      notifyError(error, t('workspaces.commentator.failedTitle'), t('workspaces.commentator.failed'));
    } finally {
      setSaving(false);
    }
  }

  return { draft, setDraft, saving, present, updateSettings, updateCommentator, swapCommentators };
}

export type CommentatorEditor = ReturnType<typeof useCommentatorEditor>;

function notifyError(error: unknown, title: string, fallback: string) {
  notifications.show({
    title,
    message: error instanceof Error ? error.message : fallback,
    color: 'red'
  });
}
