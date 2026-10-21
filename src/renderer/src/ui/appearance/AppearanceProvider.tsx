import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode
} from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import type { i18n as I18nInstance } from 'i18next';
import {
  appearanceMessageSchema,
  defaultAppearance,
  type Appearance,
  type AppearancePreferences
} from '@shared/appearancePreferences';
import { api } from '../../api';
import { i18n, normalizeLocale } from '../../i18n';
import { useRealtimeState } from '../../hooks/useRealtimeState';
import { parseRealtimeJson } from '../../hooks/realtime';
import { useSettingsDraft } from '../../hooks/useSettingsDraft';
import './appearance.css';

type Update = (
  change: Partial<AppearancePreferences> | ((state: AppearancePreferences) => AppearancePreferences),
  delay?: number
) => Promise<boolean>;
const fallback: AppearancePreferences = {
  appearance: defaultAppearance,
  presets: [],
  operatorLanguage: 'en',
  updatedAt: '1970-01-01T00:00:00Z'
};
const AppearanceContext = createContext<{
  state: AppearancePreferences;
  ready: boolean;
  saving: boolean;
  error?: string;
  broadcastI18n?: I18nInstance;
  update: Update;
}>({ state: fallback, ready: false, saving: false, update: async () => false });

const parseAppearanceMessage = (value: unknown) =>
  parseRealtimeJson(value, (message) => {
    const parsed = appearanceMessageSchema.safeParse(message);
    return parsed.success ? parsed.data.payload : undefined;
  });

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { i18n: operatorI18n } = useTranslation();
  const [error, setError] = useState<string>();
  const live = useRealtimeState({
    load: api.appearancePreferences,
    parseMessage: parseAppearanceMessage,
    loadError: 'Could not load appearance settings.'
  });
  const draft = useSettingsDraft({
    load: api.appearancePreferences,
    save: async (submitted: AppearancePreferences) => {
      try {
        const saved = await api.updateAppearancePreferences(submitted);
        setError(undefined);
        return saved;
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Could not save appearance settings.');
        throw failure;
      }
    },
    // Load errors come from the draft; save errors remain visible until a successful save.
    onError() {},
    retryInitialLoad: true
  });
  useEffect(() => {
    if (
      live.state &&
      draft.state &&
      !draft.saving &&
      Date.parse(live.state.updatedAt) > Date.parse(draft.state.updatedAt)
    )
      void draft.reload();
  }, [live.state?.updatedAt, draft.state?.updatedAt, draft.saving, draft.reload]);
  const operatorLanguage = normalizeLocale(operatorI18n.resolvedLanguage ?? operatorI18n.language) ?? 'en';
  useEffect(() => {
    if (
      !window.location.pathname.startsWith('/overlay') &&
      draft.state &&
      draft.state.operatorLanguage !== operatorLanguage
    )
      void draft.update({ operatorLanguage });
  }, [operatorLanguage, draft.state?.operatorLanguage, draft.update]);
  const state = draft.state ?? live.state ?? fallback;
  const locale =
    state.appearance.broadcastLanguage === 'follow' ? state.operatorLanguage : state.appearance.broadcastLanguage;
  useEffect(() => {
    if (window.location.pathname.startsWith('/overlay')) document.documentElement.lang = locale;
  }, [locale]);
  const broadcastI18n = useMemo(() => i18n.cloneInstance({ lng: locale, initAsync: false }), [locale]);
  return (
    <AppearanceContext.Provider
      value={{
        state,
        ready: Boolean(draft.state),
        saving: draft.saving,
        error: error ?? (draft.loadError instanceof Error ? draft.loadError.message : live.error),
        broadcastI18n,
        update: draft.update
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  return { ...context, appearance: context.state.appearance };
}

export function BroadcastLanguage({ children }: { children: ReactNode }) {
  const { broadcastI18n } = useAppearance();
  return broadcastI18n ? <I18nextProvider i18n={broadcastI18n}>{children}</I18nextProvider> : children;
}

// Previews and OBS use the same language without changing the operator's controls.
export function withBroadcastLanguage<Props extends object>(Presentation: ComponentType<Props>) {
  return function BroadcastPresentation(props: Props) {
    return (
      <BroadcastLanguage>
        <Presentation {...props} />
      </BroadcastLanguage>
    );
  };
}

export function useBracketLabel(side: 'winners' | 'losers') {
  const { appearance } = useAppearance();
  const { t } = useTranslation('operator');
  return (side === 'winners' ? appearance.winnersLabel : appearance.losersLabel)?.trim() || t(`bracketScreen.${side}`);
}

export function useAppearanceStyle(): CSSProperties {
  const { appearance } = useAppearance();
  return appearanceStyle(appearance);
}

export function appearanceStyle(appearance: Appearance): CSSProperties {
  const style: Record<string, string | number> = {
    '--appearance-text-scale': appearance.textSize === 'large' ? 1.12 : 1
  };
  if (appearance.colorOverride) {
    for (const variable of [
      '--game-accent',
      '--bracket-accent',
      '--matchups-accent',
      '--top8-accent',
      '--thumbnail-accent',
      '--top8-headline-color',
      '--thumbnail-headline-color',
      '--custom-text'
    ])
      style[variable] = appearance.primaryColor;
    style['--broadcast-right'] = appearance.secondaryColor;
    style['--appearance-primary'] = appearance.primaryColor;
    style['--appearance-secondary'] = appearance.secondaryColor;
    style['--appearance-primary-wash'] = `color-mix(in srgb, ${appearance.primaryColor} 24%, transparent)`;
    style['--appearance-secondary-wash'] = `color-mix(in srgb, ${appearance.secondaryColor} 24%, transparent)`;
    style['--appearance-on-accent'] = accentTextColor(appearance.primaryColor);
    style['--appearance-on-secondary'] = accentTextColor(appearance.secondaryColor);
    style['--adjustable-media-outline'] = `color-mix(in srgb, ${appearance.primaryColor} 82%, white)`;
  }
  return style as CSSProperties;
}

function accentTextColor(color: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}
