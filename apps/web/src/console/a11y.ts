// A table row that opens something must open from the keyboard too: a stop on Tab, Enter or Space to act.
import type { KeyboardEvent } from 'react';

export function rowKeys(act: () => void) {
  return {
    tabIndex: 0,
    role: 'link' as const,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } },
  };
}
