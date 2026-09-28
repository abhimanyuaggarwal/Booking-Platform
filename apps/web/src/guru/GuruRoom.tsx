import { Suspense, lazy } from 'react';
import type { DevoteeCard } from './types';

// The room, with her card beside the video: who she is and what she carries, nothing about money.
const HMSPrebuilt = lazy(() => import('@100mslive/roomkit-react').then((m) => ({ default: m.HMSPrebuilt })));

// Leaving the room and ending the session are deliberately different. The video SDK calls onLeave
// when he closes it, when his phone locks, when he switches apps — none of which mean he is done
// with her. Only the End button below ends the session.
export default function GuruRoom({ guruName, token, devotee, onEnd, onLeave, ending = false, problem = null }: {
  guruName: string; token: string; devotee: DevoteeCard | null;
  onEnd: () => void; onLeave: () => void; ending?: boolean; problem?: string | null;
}) {
  return (
    <div className="room">
      <div className="video">
        <Suspense fallback={<p className="wrap" style={{ color: '#C9C0AF' }}>Opening the room.</p>}>
          <HMSPrebuilt
            authToken={token}
            options={{ userName: guruName }}
            onLeave={onLeave}
            leaveOnUnload
            themes={[{
              default: true, name: 'warm',
              palette: {
                background_default: '#231F19', background_dim: '#1A1712', surface_default: '#2E2820', surface_bright: '#3A3228',
                primary_default: '#9C5A2C', primary_bright: '#B3682F', on_surface_high: '#F4F1EA', on_surface_medium: '#C9C0AF', on_primary_high: '#FFFFFF',
              },
            }]}
          />
        </Suspense>
      </div>
      <DevoteeStrip devotee={devotee} onEnd={onEnd} ending={ending} problem={problem} />
    </div>
  );
}

export function DevoteeStrip({ devotee, onEnd, ending = false, problem = null }: {
  devotee: DevoteeCard | null; onEnd: () => void; ending?: boolean; problem?: string | null;
}) {
  return (
    <div className="card">
      <div>
        <b>{devotee?.name ?? 'Your session'}</b>
        {devotee && <i>{devotee.context}</i>}
        {problem && <i className="problem">{problem}</i>}
      </div>
      <button className="end" onClick={onEnd} disabled={ending}>{ending ? 'Ending' : 'End'}</button>
    </div>
  );
}
