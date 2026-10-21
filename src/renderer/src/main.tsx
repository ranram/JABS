import { I18nextProvider } from 'react-i18next';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { App } from './ui/App';
import { initializeI18n, i18n } from './i18n';
import { jabsTheme } from './ui/theme';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './styles.css';
import './controlDeck.css';
import { trackObsSourceActivity } from './hooks/obsSourceActivity';
import { trackRendererErrors } from './diagnostics';

const stopErrorTracking = trackRendererErrors();
import.meta.hot?.dispose(stopErrorTracking);

if (window.location.pathname.startsWith('/overlay')) {
  const stopTracking = trackObsSourceActivity();
  import.meta.hot?.dispose(stopTracking);
}
void initializeI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <MantineProvider theme={jabsTheme} defaultColorScheme="dark">
        {!window.location.pathname.startsWith('/overlay') && <Notifications position="top-right" limit={4} autoClose={3_000} />}
        <I18nextProvider i18n={i18n}>
          <App />
        </I18nextProvider>
      </MantineProvider>
    </React.StrictMode>
  );
});
