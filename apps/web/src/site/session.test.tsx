// Her session screens. Warm, quiet, almost empty — and never a countdown.
import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { PreEntryView } from './PreEntry';
import { WaitingRoomView } from './WaitingRoom';
import { Ended } from './Join';
import type { SessionView } from './types';

const view: SessionView = {
  booking: { id: 'b1', when: 'Wednesday, 16 September, 11:00 am', status: 'confirmed', minutes: 30 },
  guru: { name: 'Guruji Vishwanath' },
  devotee: { name: 'Ramesh K' },
  state: 'due', sentence: 'Guruji will join you shortly. You can stay on this screen.', canLeave: false,
  video: { ready: true }, minutesTogether: null, escapeAfter: '2026-09-16T05:40:00Z',
  messages: [], nextEvent: { title: 'Weekly satsang', kind: 'satsang', when: 'Friday, 18 September, 5:00 pm' },
  bookAgainPath: 'guruji',
};

test('before she enters: her session named, the length stated, and the three checks', () => {
  const html = renderToStaticMarkup(<PreEntryView view={view} mic="good" camera="good" connection="good" problem={null} onEnter={() => {}} />);
  expect(html).toContain('Your session with Guruji Vishwanath');
  expect(html).toContain('30 minutes, only the two of you');
  expect(html).toContain('Microphone is working');
  expect(html).toContain('Camera is working');
  expect(html).toContain('Connection is working');
  expect(html).toContain('This is how Guruji Vishwanath will see you');
  expect(html).toContain('Enter the waiting room');
  expect(html).toContain('Nothing is recorded.');
});

test('a refused microphone is explained, and she can still go in', () => {
  const html = renderToStaticMarkup(<PreEntryView view={view} mic="bad" camera="bad" connection="good" problem="Your browser has not given us the microphone and camera." onEnter={() => {}} />);
  expect(html).toContain('Microphone is not available');
  expect(html).toContain('has not given us the microphone');
  expect(html).toContain('Enter the waiting room');
});

test('a slow connection promises sound rather than a warning she cannot act on', () => {
  const html = renderToStaticMarkup(<PreEntryView view={view} mic="good" camera="good" connection="bad" problem={null} onEnter={() => {}} />);
  expect(html).toContain('sound will hold even if the picture does not');
});

test('waiting: she is somewhere — her own seat, the honest sentence, and a way to reach his team', () => {
  const html = renderToStaticMarkup(<WaitingRoomView view={view} onChoose={async () => ''} onSay={async () => {}} />);
  expect(html).toContain('Guruji will join you shortly');
  expect(html).toContain('You are ready');                       // the caption under her own face
  expect(html).toContain('They can see you are here');           // the channel, before anyone speaks
  expect(html).toContain('Write to his team');
  expect(html).toContain('only between you and Guruji Vishwanath');
  expect(html).not.toContain('Choose another time');
  expect(html).not.toMatch(/\d+:\d\d/);
});

test("a note from his team appears in the same calm frame, named as theirs", () => {
  const withNote = { ...view, messages: [{ text: 'He is running a little late today. He will join you in about ten minutes.', from: 'team' as const, at: '2026-09-16T05:34:00Z' }] };
  const html = renderToStaticMarkup(<WaitingRoomView view={withNote} onChoose={async () => ''} onSay={async () => {}} />);
  expect(html).toContain("Guruji Vishwanath&#x27;s team");
  expect(html).toContain('running a little late today');
});

test('her own words sit in the same conversation, marked as hers', () => {
  const both = { ...view, messages: [
    { text: 'I am here, the picture is a little dark.', from: 'devotee' as const, at: '2026-09-16T05:33:00Z' },
    { text: 'He is running a little late today.', from: 'team' as const, at: '2026-09-16T05:34:00Z' },
  ] };
  const html = renderToStaticMarkup(<WaitingRoomView view={both} onChoose={async () => ''} onSay={async () => {}} />);
  expect(html).toContain('the picture is a little dark');
  expect(html).toContain('>You<');                                // said by her, not by his team
  expect(html).toContain("Guruji Vishwanath&#x27;s team");
});

test('ten minutes past, two clear choices and nobody to chase', () => {
  const late = { ...view, state: 'late' as const, canLeave: true, sentence: 'Something has kept him. You do not need to wait, or call anyone.' };
  const html = renderToStaticMarkup(<WaitingRoomView view={late} onChoose={async () => ''} onSay={async () => {}} />);
  expect(html).toContain('Guruji Vishwanath has not been able to join');
  expect(html).toContain('You do not need to wait, or call anyone');
  expect(html).toContain('Choose another time');
  expect(html).toContain('Ask for the dakshina back');
  expect(html).toContain('His team can see you were waiting');
});

test('afterwards: what happened, the next satsang, and a quiet way to book again', () => {
  const ended = { ...view, state: 'ended' as const, minutesTogether: 32 };
  const html = renderToStaticMarkup(<StaticRouter location="/join/b1"><Ended view={ended} /></StaticRouter>);
  expect(html).toContain('Your session is complete');
  expect(html).toContain('32 minutes with Guruji Vishwanath');
  expect(html).toContain('next satsang is Friday, 18 September, 5:00 pm');
  expect(html).toContain('Book another time');
  expect(html).toContain('A note has gone to your WhatsApp');
  expect(html).not.toMatch(/rate|rating|survey|how did/i);
});

test('no session screen shows a countdown or an exclamation mark', () => {
  const screens = [
    renderToStaticMarkup(<PreEntryView view={view} mic="checking" camera="checking" connection="checking" problem={null} onEnter={() => {}} />),
    renderToStaticMarkup(<WaitingRoomView view={view} onChoose={async () => ''} onSay={async () => {}} />),
    renderToStaticMarkup(<WaitingRoomView view={{ ...view, canLeave: true }} onChoose={async () => ''} onSay={async () => {}} />),
    renderToStaticMarkup(<StaticRouter location="/join/b1"><Ended view={{ ...view, minutesTogether: 32 }} /></StaticRouter>),
  ];
  for (const html of screens) {
    expect(html).not.toMatch(/\d+ seconds|remaining|countdown/i);
    expect(html.replace(/class="[^"]*"/g, '')).not.toContain('!');
  }
});

test('with no camera she is told she can still be heard, never shown an empty box', () => {
  const html = renderToStaticMarkup(
    <WaitingRoomView view={view} onChoose={async () => ''} onSay={async () => {}} ready={false}>
      <div className="selfview off"><p>Your camera is off. You can still join and speak — guruji will hear you.</p></div>
    </WaitingRoomView>,
  );
  expect(html).toContain('You can still join and speak');
  expect(html).toContain('Sound only');
  expect(html).not.toContain('You are ready');
});
