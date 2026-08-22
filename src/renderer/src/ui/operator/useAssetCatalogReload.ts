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
    if (!assetCatalogSlug || reloadingAssets) return;
    setReloadingAssets(true);
    try {
      const { logos, counts } = await api.assetCatalogSummary(assetCatalogSlug);
      invalidateCatalogRasterCache();
      setLogos(logos);
      setAssetCatalogRevision((revision) => revision + 1);
      notifications.show({
        title: t('notices.done'),
        message: t('browser.assetsReloaded', counts),
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
