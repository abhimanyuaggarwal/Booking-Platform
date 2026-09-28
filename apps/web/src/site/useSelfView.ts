import { useEffect, useRef, useState } from 'react';

export type Check = 'checking' | 'good' | 'bad';

/**
 * Her camera and microphone, asked for once and held for as long as she is on the join screen.
 * It lives here rather than in the check screen because the waiting room shows her to herself
 * too — seeing your own face is what makes a waiting room feel like a place you have entered,
 * and asking the browser a second time would flicker and could be refused.
 */
/**
 * iOS in-app browsers (WhatsApp, Instagram, Facebook) are WKWebViews, where getUserMedia does not
 * work — camera and microphone are simply unavailable. This matters more here than anywhere else:
 * her join link arrives ON WhatsApp, so tapping it is the single most likely thing she does.
 * We do not guess from the user agent — telling someone in Safari to open Safari is worse than
 * saying nothing. We wait until the camera has actually failed, and only then, on iOS, say so.
 */
function onApple() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad pretending to be a Mac
}

export function useSelfView() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [openElsewhere, setOpenElsewhere] = useState(false);
  const [mic, setMic] = useState<Check>('checking');
  const [camera, setCamera] = useState<Check>('checking');
  const [connection, setConnection] = useState<Check>('checking');
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let got: MediaStream | null = null;
    // No mediaDevices at all is the in-app browser's signature: there is nothing to ask.
    if (!navigator.mediaDevices?.getUserMedia) {
      setMic('bad'); setCamera('bad');
      setOpenElsewhere(onApple());
      setProblem(onApple()
        ? 'This browser cannot open your camera or microphone.'
        : 'This browser cannot open your camera or microphone. Please try a different one.');
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      .then((s) => {
        if (!live) return s.getTracks().forEach((t) => t.stop());
        got = s;
        setStream(s);
        setMic(s.getAudioTracks().length > 0 ? 'good' : 'bad');
        setCamera(s.getVideoTracks().length > 0 ? 'good' : 'bad');
      })
      .catch(() => {
        if (!live) return;
        setMic('bad');
        setCamera('bad');
        setOpenElsewhere(onApple());
        setProblem(onApple()
          ? 'This browser cannot open your camera or microphone.'
          : 'Your browser has not given us the microphone and camera. You can still join and speak only, or allow them in the address bar and reload.');
      });
    // Released when she leaves the join screen entirely — not when she steps from the check into
    // the waiting room, which is why this is not inside either of those screens.
    return () => { live = false; got?.getTracks().forEach((t) => t.stop()); };
  }, []);

  useEffect(() => {
    const started = Date.now();
    fetch('/api/health', { cache: 'no-store' })
      .then(() => setConnection(Date.now() - started < 1500 ? 'good' : 'bad'))
      .catch(() => setConnection('bad'));
  }, []);

  return { stream, mic, camera, connection, problem, openElsewhere };
}

/** Points a <video> at a stream. Used by the check screen and the waiting room. */
export function useStreamOn(stream: MediaStream | null) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return ref;
}
