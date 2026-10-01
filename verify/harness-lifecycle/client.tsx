import React from 'react';
import {hydrateRoot,createRoot} from 'react-dom/client';
import {App} from './App';
(window as any).controls = {};
(window as any).recoverableErrors = [];
(window as any).root = hydrateRoot(document.getElementById('root')!, <React.StrictMode><App/></React.StrictMode>, {onRecoverableError(error){(window as any).recoverableErrors.push(String(error));}});

(window as any).remount = () => { const root=createRoot(document.getElementById('root')!); root.render(<React.StrictMode><App/></React.StrictMode>); (window as any).root=root; };
