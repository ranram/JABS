import { Alert, Text } from '@mantine/core';

export function ControlWarning({ message }: { message?: string }) {
  return message ? (
    <Alert color="yellow" mt="xs" w="100%" miw={0} role="status" style={{ overflowWrap: 'anywhere' }}>
      <Text size="xs">{message}</Text>
    </Alert>
  ) : null;
}
