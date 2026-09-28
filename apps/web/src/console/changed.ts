import { useEffect } from 'react';

// The drawer can change a booking from any screen, so the screen underneath must refresh without
// knowing who did what. One event, no store: the drawer announces, screens that show bookings listen.
const EVENT = 'es:console-changed';

export function announceChange() {
  window.dispatchEvent(new Event(EVENT));
}

export function useOnChange(reload: () => void) {
  useEffect(() => {
    window.addEventListener(EVENT, reload);
    return () => window.removeEventListener(EVENT, reload);
  }, [reload]);
}
