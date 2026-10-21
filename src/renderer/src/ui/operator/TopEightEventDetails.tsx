import { Accordion, Button, NumberInput, Stack, Text, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { TopEightDraftController } from './useTopEightDraft';

type TopEightEventDetailsProps = {
  controller: TopEightDraftController;
  loadUrl: string;
  onLoadUrlChange: (value: string) => void;
  onLoad: () => void;
  loading: boolean;
};

export function TopEightEventDetails({
  controller,
  loadUrl,
  onLoadUrlChange,
  onLoad,
  loading
}: TopEightEventDetailsProps) {
  const { t } = useTranslation(['operator']);
  const { draft } = controller;

  return (
    <Accordion variant="separated" radius="md" defaultValue="startgg">
      <Accordion.Item className="operator-inset" value="startgg">
        <Accordion.Control>
          <Text fw={700} size="sm">
            {t('operator:topEight.loadFromStartgg')}
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <div className="generator-event-load-row">
            <TextInput
              label={t('operator:topEight.eventUrl')}
              placeholder="https://start.gg/tournament/.../event/..."
              value={loadUrl}
              onChange={(event) => onLoadUrlChange(event.currentTarget.value)}
            />
            <Button variant="default" disabled={!loadUrl.trim() || loading} loading={loading} onClick={onLoad}>
              {t('operator:topEight.loadEventUrl')}
            </Button>
          </div>
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item className="operator-inset" value="manual">
        <Accordion.Control>
          <Text fw={700} size="sm">
            {t('operator:topEight.manualEventDetails')}
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <TextInput
              label={t('operator:topEight.manualEventUrl')}
              description={t('operator:topEight.manualEventUrlHint')}
              inputWrapperOrder={['label', 'input', 'description', 'error']}
              placeholder="https://..."
              value={draft.eventUrl ?? ''}
              onChange={(event) => controller.setEventUrl(event.currentTarget.value)}
            />
            <NumberInput
              label={t('operator:topEight.participantCount')}
              value={draft.participantCount ?? ''}
              onChange={(value) =>
                controller.setParticipantCount(typeof value === 'number' && value > 0 ? value : undefined)
              }
              min={1}
              allowDecimal={false}
              allowNegative={false}
              hideControls={false}
            />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
