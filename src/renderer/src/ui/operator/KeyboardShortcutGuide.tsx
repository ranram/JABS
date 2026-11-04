import { Kbd, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import './keyboardShortcutGuide.css';

export function KeyboardShortcutGuide() {
  const { t } = useTranslation(['operator', 'common']);
  const groups = [
    {
      title: t('operator:shortcutGuide.navigation'),
      shortcuts: [
        ['F5', t('operator:players.title')],
        ['F6', t('operator:queue.title')],
        ['F7', t('operator:selector.title')],
        ['Ctrl+Shift+N', t('operator:queue.next')],
        ['Ctrl+Shift+P', t('operator:queue.previous')],
        ['Ctrl+Shift+Space', `${t('operator:queue.pause')} / ${t('operator:queue.resume')}`]
      ]
    },
    {
      title: t('operator:shortcutGuide.scoring'),
      shortcuts: [
        ['1', t('operator:live.playerOnePoint')],
        ['Shift+1', t('operator:live.subtractPlayerOnePoint')],
        ['2', t('operator:live.playerTwoPoint')],
        ['Shift+2', t('operator:live.subtractPlayerTwoPoint')]
      ]
    },
    {
      title: t('operator:shortcutGuide.matchActions'),
      shortcuts: [
        ['Ctrl+Shift+S', t('common:actions.swapPlayers')],
        ['Ctrl+Shift+R', t('common:actions.resetScores')],
        ['Ctrl+Shift+D', t('operator:queue.clear')],
        ['Ctrl+Shift+X', t('operator:editor.clearPlayers')]
      ]
    }
  ];
  return (
    <div className="operator-disclosure-content keyboard-shortcut-guide">
      {groups.map(({ title, shortcuts }) => (
        <section key={title}>
          <Text component="h4" size="sm" fw={700} m={0}>
            {title}
          </Text>
          <dl className="keyboard-shortcut-list">
            {shortcuts.map(([keys, label]) => (
              <div className="keyboard-shortcut-row" key={keys}>
                <dt>{label}</dt>
                <dd>
                  <Kbd>{keys}</Kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
