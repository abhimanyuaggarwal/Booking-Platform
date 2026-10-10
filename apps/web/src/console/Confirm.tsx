import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWords } from './lang';

// The house confirm (Player Console principle): the act as a question, one paragraph saying what happens,
// then Not now and the act with its verb. Esc and the veil close it; a destructive act is outlined in red.
type Ask = { text: string; act: string; danger: boolean; resolve: (yes: boolean) => void };
type Confirm = (text: string, act?: string, danger?: boolean) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(() => Promise.resolve(false))   // outside the provider nothing is confirmed;

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const W = useWords();
  const [ask, setAsk] = useState<Ask | null>(null);
  const confirm = useCallback<Confirm>((text, act, danger = false) => new Promise<boolean>((resolve) => {
    setAsk({ text, act: act ?? W.dialog.yes, danger, resolve });
  }), [W.dialog.yes]);
  const answer = (yes: boolean) => { ask?.resolve(yes); setAsk(null); };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {ask && <ConfirmDialog ask={ask} onAnswer={answer} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() { return useContext(ConfirmContext); }

/** The sentence splits at its first question mark: the question is the title, the rest is the consequence. */
export function splitAsk(text: string): { title: string; body: string } {
  const i = text.indexOf('?');
  if (i < 0) return { title: text, body: '' };
  return { title: text.slice(0, i + 1).trim(), body: text.slice(i + 1).trim() };
}

export function ConfirmDialog({ ask, onAnswer }: { ask: { text: string; act: string; danger: boolean }; onAnswer: (yes: boolean) => void }) {
  const W = useWords();
  const { title, body } = splitAsk(ask.text);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onAnswer(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onAnswer]);
  return (
    <div className="dlg-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onAnswer(false); }}>
      <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <h3 id="dlg-title">{title}</h3>
        {body && <p>{body}</p>}
        <div className="foot">
          <button type="button" className="quiet" ref={first} onClick={() => onAnswer(false)}>{W.dialog.notNow}</button>
          <button type="button" className={ask.danger ? 'danger' : 'primary'} onClick={() => onAnswer(true)}>{ask.act}</button>
        </div>
      </div>
    </div>
  );
}
