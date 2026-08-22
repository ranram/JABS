import React from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { App } from './ui/App';
import { initializeI18n } from './i18n';
import { jabsTheme } from './ui/theme';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './styles.css';
import './controlDeck.css';
void initializeI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <MantineProvider theme={jabsTheme} defaultColorScheme="dark">
        {!window.location.pathname.startsWith('/overlay') && (
          <Notifications position="top-right" limit={4} />
        )}
        <App />
      </MantineProvider>
    </React.StrictMode>
  );
});
