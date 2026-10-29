import { Accordion, Button, Group, Kbd, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { LogoAsset } from '@shared/models';
import type { GameProfile } from '@shared/gameProfiles';
import { MicrophoneIcon, OperatorIcon } from '../icons';
import { CommentatorControls } from './CommentatorControls';
import { useCommentatorEditor } from './useCommentatorEditor';

export function CommentatorPanel({
  logos,
  profiles,
  sourceLinks
}: {
  logos: LogoAsset[];
  profiles: GameProfile[];
  sourceLinks?: ReactNode;
}) {
  const { t } = useTranslation('operator');
  const editor = useCommentatorEditor();
  return (
    <Accordion.Item className="operator-inset" value="commentators">
      <Group className="commentator-panel-header" gap="sm">
        <Accordion.Control icon={<OperatorIcon icon={MicrophoneIcon} />}>
          <Text fw={800}>{t('workspaces.tools.commentators.title')}</Text>
        </Accordion.Control>
        <Button
          className="commentator-swap-button"
          variant="default"
          loading={editor.saving}
          disabled={!editor.draft}
          onClick={() => void editor.swapCommentators()}
        >
          {t('workspaces.commentator.swap')}
          <Kbd ml="xs" visibleFrom="sm">
            Ctrl+Shift+C
          </Kbd>
        </Button>
      </Group>
      <Accordion.Panel>
        <CommentatorControls editor={editor} logos={logos} profiles={profiles} sourceLinks={sourceLinks} />
      </Accordion.Panel>
    </Accordion.Item>
  );
}
