import { createContext } from 'react';

export const PlayerLibraryLauncherContext = createContext<(() => void) | undefined>(undefined);
