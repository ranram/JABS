import { useIdentityTextFit } from '../useIdentityTextFit';

export function useVersusNameFit(identity: string) {
  return useIdentityTextFit(identity, '.versus-name-text');
}
