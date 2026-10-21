import { useCenteredNameFit } from '../useCenteredNameFit';

export function useVersusNameFit(identity: string) {
  return useCenteredNameFit(identity, '.versus-name-text');
}
