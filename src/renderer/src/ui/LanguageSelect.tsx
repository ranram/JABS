import { useTranslation } from 'react-i18next';
import { normalizeLocale, setLocale } from '../i18n';
import { supportedLocales, type SupportedLocale } from '../i18n/resources';

type LanguageSelectProps = {
  compact?: boolean;
};

export function LanguageSelect({ compact = false }: LanguageSelectProps) {
  const { t, i18n } = useTranslation('common');
  const value = normalizeLocale(i18n.resolvedLanguage ?? i18n.language) ?? 'en';

  return (
    <label className={compact ? 'language-select language-select-compact' : 'language-select'}>
      <span>{t('language')}</span>
      <select
        value={value}
        aria-label={t('language')}
        onChange={(event) => void setLocale(event.target.value as SupportedLocale)}
      >
        {supportedLocales.map((locale) => (
          <option key={locale} value={locale}>
            {locale === 'en' ? t('languages.en') : t('languages.es419')}
          </option>
        ))}
      </select>
    </label>
  );
}
