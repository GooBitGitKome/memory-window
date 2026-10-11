import { Capacitor } from '@capacitor/core';

export async function setupPlatform(): Promise<() => void> {
  if (Capacitor.isNativePlatform()) {
    const { App } = await import('@capacitor/app');
    const listener = await App.addListener('appStateChange', ({ isActive }) => {
      window.dispatchEvent(new Event(isActive ? 'memory-window:resume' : 'memory-window:suspend'));
    });
    return () => { void listener.remove(); };
  }
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    // Static files only; no authenticated requests or personal media are cached.
    await navigator.serviceWorker.register('/sw.js');
  }
  return () => {};
}
