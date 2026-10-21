import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, CloseButton, Group, Menu, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { tutorialIds, type TutorialId, type TutorialWorkspace } from './tutorials';
import type { TutorialPopover } from './runTutorial';
import { sortByLabel } from '../operator/operatorUtils';
import { en } from '../../i18n/catalogs/en';
import { ExternalLink } from '../operator/ExternalLink';
import { SupportDialog } from '../support/SupportDialog';

export function HelpMenu({ navigate }: { navigate(workspace: TutorialWorkspace): void }) {
  const { t, i18n } = useTranslation('operator');
  const sortedGuides = sortByLabel(tutorialIds, (id) => en.operator.help.guides[id], 'en');
  const [loading, setLoading] = useState(false);
  const [supportOpened, setSupportOpened] = useState(false);
  const [popover, setPopover] = useState<TutorialPopover>();
  const current = useRef({ generation: 0, stop: undefined as (() => void) | undefined });
  useEffect(() => {
    setPopover(undefined);
    setLoading(false);
    return () => {
      current.current.generation++;
      current.current.stop?.();
    };
  }, [i18n.resolvedLanguage]);

  async function start(id: TutorialId) {
    const generation = ++current.current.generation;
    current.current.stop?.();
    setPopover(undefined);
    setLoading(true);
    try {
      const { runTutorial } = await import('./runTutorial');
      if (generation !== current.current.generation) return;
      current.current.stop = runTutorial({
        id,
        t,
        navigate,
        render: (next) => {
          if (generation === current.current.generation) setPopover(next);
        }
      });
    } catch {
      if (generation === current.current.generation) notifications.show({ color: 'red', message: t('help.failed') });
    } finally {
      if (generation === current.current.generation) setLoading(false);
    }
  }

  useLayoutEffect(() => {
    if (!popover) return;
    popover.refresh();
    popover.host.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [popover]);

  return (
    <>
      <Menu position="bottom-end" width={260} shadow="md">
        <Menu.Target>
          <Button
            data-tutorial="help"
            size="compact-xs"
            variant="default"
            loading={loading}
            rightSection={<span aria-hidden="true">▾</span>}
          >
            {t('help.title')}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={() => setSupportOpened(true)}>{t('support.title')}</Menu.Item>
          <Menu.Divider />
          <Menu.Label>{t('help.tutorials')}</Menu.Label>
          {sortedGuides.map((id) => (
            <Menu.Item key={id} onClick={() => void start(id)}>
              {t(`help.guides.${id}`)}
            </Menu.Item>
          ))}
          <Menu.Divider />
          <Menu.Item component={ExternalLink} href="https://ko-fi.com/ranram" underline="never" c="inherit">
            {t('help.supportDevelopment')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <SupportDialog opened={supportOpened} onClose={() => setSupportOpened(false)} />
      {popover &&
        createPortal(
          <Stack gap="xs">
            <CloseButton
              className="jabs-tutorial-close"
              aria-label={t('help.close')}
              variant="transparent"
              onClick={popover.close}
            />
            {popover.missing && (
              <Text size="xs" c="dimmed">
                {t('help.missing')}
              </Text>
            )}
            {popover.link && (
              <ExternalLink size="sm" href={popover.link}>
                {t('help.tokenLink')}
              </ExternalLink>
            )}
            <Text size="xs" c="dimmed">
              {t('help.progress', { current: popover.index + 1, total: popover.total })}
            </Text>
            <Group justify="flex-end" gap="xs" wrap="nowrap">
              <Button size="compact-sm" variant="default" disabled={popover.index === 0} onClick={popover.previous}>
                {t('help.previous')}
              </Button>
              <Button size="compact-sm" onClick={popover.next}>
                {t(popover.index === popover.total - 1 ? 'help.done' : 'help.next')}
              </Button>
            </Group>
          </Stack>,
          popover.host
        )}
    </>
  );
}
