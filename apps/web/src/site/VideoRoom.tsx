import { Suspense, lazy } from 'react';
import type { SessionView } from './types';

// 100ms's prebuilt room, in his colours. We mount it only once guruji has joined, so she never
// sits in an empty room. Audio holds when the picture does not; that is the SDK's own fallback.
const HMSPrebuilt = lazy(() => import('@100mslive/roomkit-react').then((m) => ({ default: m.HMSPrebuilt })));

export default function VideoRoom({ view, token, onLeave }: { view: SessionView; token: string; onLeave: () => void }) {
  return (
    <div className="room">
      <Suspense fallback={<p className="muted wrap">Opening the room.</p>}>
        <HMSPrebuilt
          authToken={token}
          options={{ userName: view.devotee.name ?? 'Devotee' }}
          onLeave={onLeave}
          leaveOnUnload
          typography={{ font_family: 'Inter' }}
          themes={[{
            default: true,
            name: 'warm',
            palette: {
              background_default: '#231F19',
              background_dim: '#1A1712',
              surface_default: '#2E2820',
              surface_bright: '#3A3228',
              primary_default: '#9C5A2C',
              primary_bright: '#B3682F',
              on_surface_high: '#F4F1EA',
              on_surface_medium: '#C9C0AF',
              on_primary_high: '#FFFFFF',
            },
          }]}
        />
      </Suspense>
      <p className="roomnote">Only the two of you · nothing recorded</p>
    </div>
  );
}
