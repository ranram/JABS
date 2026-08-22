import definitions from './prideFlags.json';

export type PrideFlagDefinition = {
  id: string;
  label: string;
  file: string;
};

export const prideFlags = definitions as readonly PrideFlagDefinition[];

export function prideFlagDefinition(id: string | undefined): PrideFlagDefinition | undefined {
  return prideFlags.find((flag) => flag.id === id);
}
