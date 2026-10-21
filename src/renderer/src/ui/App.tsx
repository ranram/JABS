import { AppearanceProvider, BroadcastLanguage, useAppearance } from './appearance/AppearanceProvider';
import { lazy, Suspense } from 'react';

const OperatorDashboard = lazy(() =>
  import('./OperatorDashboard').then((module) => ({ default: module.OperatorDashboard }))
);
const OverlayView = lazy(() => import('./OverlayView').then((module) => ({ default: module.OverlayView })));

export function App() {
  return (
    <AppearanceProvider>
      <ApplicationContent />
    </AppearanceProvider>
  );
}

function ApplicationContent() {
  const { ready } = useAppearance();
  const path = window.location.pathname;

  if (path.startsWith('/overlay')) {
    return ready ? (
      <BroadcastLanguage>
        <Suspense fallback={null}>
          <OverlayView />
        </Suspense>
      </BroadcastLanguage>
    ) : null;
  }

  return (
    <Suspense fallback={null}>
      <OperatorDashboard />
    </Suspense>
  );
}
