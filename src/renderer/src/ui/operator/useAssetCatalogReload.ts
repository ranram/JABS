import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import type { LogoAsset } from '@shared/models';
import { api, invalidateCatalogRasterCache } from '../../api';

export function useAssetCatalogReload({
  assetCatalogSlug,
  setLogos,
  setAssetCatalogRevision
}: {
  assetCatalogSlug?: string;
  setLogos: Dispatch<SetStateAction<LogoAsset[]>>;
  setAssetCatalogRevision: Dispatch<SetStateAction<number>>;
}) {
  const { t } = useTranslation('operator');
  const [reloadingAssets, setReloadingAssets] = useState(false);
  const reloadAssets = useCallback(async () => {
    if (reloadingAssets) return;
    setReloadingAssets(true);
    try {
      let logos: LogoAsset[];
      let message: string;
      if (assetCatalogSlug) {
        const summary = await api.assetCatalogSummary(assetCatalogSlug);
        logos = summary.logos;
        message = t('browser.assetsReloaded', summary.counts);
      } else {
        const response = await api.logos();
        logos = response.logos;
        message = t('browser.logosReloaded', { count: logos.length });
      }
      invalidateCatalogRasterCache();
      setLogos(logos);
      setAssetCatalogRevision((revision) => revision + 1);
      notifications.show({
        title: t('notices.done'),
        message,
        color: 'green',
        autoClose: 8_000,
        withCloseButton: true
      });
    } catch (error) {
      notifications.show({
        title: t('notices.actionFailed'),
        message: error instanceof Error ? error.message : t('browser.assetsReloadFailed'),
        color: 'red',
        autoClose: false,
        withCloseButton: true
      });
    } finally {
      setReloadingAssets(false);
    }
  }, [assetCatalogSlug, reloadingAssets, setAssetCatalogRevision, setLogos, t]);
  return { reloadAssets, reloadingAssets };
}
