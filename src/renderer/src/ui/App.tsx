import { lazy, Suspense } from 'react';

const OperatorDashboard = lazy(() => import('./OperatorDashboard').then((module) => ({ default: module.OperatorDashboard })));
const OverlayView = lazy(() => import('./OverlayView').then((module) => ({ default: module.OverlayView })));

export function App() {
  const path = window.location.pathname;

  if (path.startsWith('/overlay')) {
    return <Suspense fallback={null}><OverlayView /></Suspense>;
  }

  return <Suspense fallback={null}><OperatorDashboard /></Suspense>;
}
