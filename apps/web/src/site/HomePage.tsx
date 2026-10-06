import { useState } from 'react';
import { formatRupees } from '@expert-sessions/shared';
import { siteApi, useSite } from './api';
import BookSheet from './BookSheet';
import TimeChooser from './TimeChooser';
import type { PublicSlot, SitePage } from './types';

// One scrolling page: his picture and name, the facts about him, the next open times, who he is in
// his own words, what people bring to him, how a time works, his schedule, and the few things worth
// knowing before booking. Booking has begun before she has scrolled — the nearest times sit right
// under the picture.
export default function HomePage({ page, call, base }: { page: SitePage; call: ReturnType<typeof siteApi>; base: string }) {
  const [chosen, setChosen] = useState<PublicSlot | null>(null);
  const [showAll, setShowAll] = useState(false);
  const types = page.sessionTypes ?? [];
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const type = types.find((t) => t.id === typeId) ?? types[0] ?? null;
  // The page came with the default kind's nearest times; another kind, or "see other times", asks for its own list.
  const needsFetch = showAll || (type && type.id !== types[0]?.id);
  const all = useSite<{ slots: PublicSlot[] }>(call, needsFetch ? `/slots?type=${encodeURIComponent(type?.id ?? '')}` : '/');
  const fetched = needsFetch && all.data && 'slots' in all.data ? all.data.slots : null;
  const slots = fetched ? (showAll ? fetched : fetched.slice(0, 3)) : page.nextSlots;

  return (
    <main>
      <HomeSections page={page} slots={slots} showAll={showAll} onSeeAll={() => setShowAll(true)} onChoose={setChosen} typeId={type?.id} onChooseType={setTypeId} />
      {chosen && type && <BookSheet slot={chosen} type={type} guru={page.guru} call={call} base={base} onClose={() => setChosen(null)} />}
    </main>
  );
}

// The same three steps for every guru: this is how the product works, not something his team writes.
const STEPS = [
  { heading: 'Choose a time', body: 'Here, or by sending Hi on WhatsApp. The nearest open times are shown first.' },
  { heading: 'Offer the dakshina', body: 'By UPI. The time is held for ten minutes while you pay, and is yours the moment the bank answers.' },
  { heading: 'Open the link at your time', body: 'It arrives on WhatsApp. Guruji joins you there. Only the two of you, on video or by voice.' },
];

const GOOD_TO_KNOW = [
  'You may move or cancel your time once, up to four hours before it. A cancelled dakshina stays with you as a credit for thirty days.',
  'Nothing is recorded. What you write or say before your time, only guruji reads.',
  'If guruji cannot sit at your time, the dakshina is returned in full.',
];

export function HomeSections({ page, slots, showAll, onSeeAll, onChoose, typeId, onChooseType }: {
  page: SitePage; slots: PublicSlot[]; showAll: boolean; onSeeAll: () => void; onChoose: (s: PublicSlot) => void;
  typeId?: string; onChooseType?: (id: string) => void;
}) {
  const { guru, events } = page;
  const types = page.sessionTypes ?? [];
  const type = types.find((t) => t.id === typeId) ?? types[0] ?? null;
  const m = guru.marketing;
  const hero = m?.hero ?? null;
  const facts = m?.facts ?? [];
  const themes = m?.themes ?? [];
  const blocks = m?.blocks ?? [];
  const nextEvent = events[0] ?? null;

  return (
    <>
      <div className={`hero ${hero?.image ? 'pictured' : ''}`}>
        {hero?.image && <div className="band"><img src={hero.image} alt="" /></div>}
        <div className="wrap">
          {hero?.portrait && (
            <div className="portrait">
              {/* His team adds the file; until then the frame stays out of the way. */}
              <img src={hero.portrait} alt={guru.name} onError={(e) => { e.currentTarget.parentElement!.hidden = true; }} />
            </div>
          )}
          <h1>{guru.name}</h1>
          <p className="lineage">{m?.tagline}</p>
          <p className="about">{guru.about}</p>
          <p className="terms">{types.length > 1
            ? <>One to one · {types.map((t) => `${t.minutes} minutes for ${formatRupees(t.dakshinaPaise)}`).join(' · ')}</>
            : <>One to one · {type?.minutes ?? guru.slotMinutes} minutes · dakshina {formatRupees(type?.dakshinaPaise ?? guru.dakshinaPaise)}</>}</p>
          <div className="calls">
            <a className="primary" href="#times">Choose a time</a>
            {nextEvent?.link && <a className="ghost" href={nextEvent.link}>Watch the next {nextEvent.kind === 'meetup' ? 'meetup' : nextEvent.kind === 'live' ? 'live' : 'satsang'} · {nextEvent.when}</a>}
          </div>
        </div>
      </div>

      <div className="wrap">
        {facts.length > 0 && (
          <dl className="facts">
            {facts.map((f) => (
              <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>
            ))}
          </dl>
        )}

        <section id="times">
          {types.length > 1 && (
            <>
              <p className="eyebrow">How long would you like</p>
              <div className="kinds" role="radiogroup">
                {types.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={t.id === type?.id} className={t.id === type?.id ? 'kind on' : 'kind'} onClick={() => onChooseType?.(t.id)}>
                    <b>{t.minutes} minutes</b><span>{formatRupees(t.dakshinaPaise)}</span>{t.name && <i>{t.name}</i>}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="eyebrow">Next available</p>
          {slots.length === 0 ? (
            <p className="muted">There are no open times this week. His next satsang is below, and you may write on WhatsApp to be told when times open.</p>
          ) : (
            <>
              {showAll ? <TimeChooser slots={slots} onChoose={onChoose} /> : slots.map((s) => (
                <button key={s.id} className="slot" onClick={() => onChoose(s)}>
                  <b>{s.label}</b><u>Book</u>
                </button>
              ))}
              {!showAll && page.openCount > slots.length && (
                <button className="plain" onClick={onSeeAll}>See other times</button>
              )}
            </>
          )}
          {guru.whatsappLink && (
            <>
              <p className="orline">OR</p>
              <a className="ghost whatsapp" href={guru.whatsappLink}>Book on WhatsApp</a>
            </>
          )}
        </section>

        {(blocks.length > 0 || m?.quote) && (
          <section className="about-him">
            <p className="eyebrow">About him</p>
            {m?.quote && <blockquote className="quote">{m.quote}<cite>{guru.name}</cite></blockquote>}
            {blocks.map((b, i) => (
              <div key={i} className="block">
                <h3>{b.heading}</h3>
                <p className="muted">{b.body}</p>
              </div>
            ))}
          </section>
        )}

        {themes.length > 0 && (
          <section>
            <p className="eyebrow">What people bring to him</p>
            <ul className="themes">
              {themes.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </section>
        )}

        <section>
          <p className="eyebrow">How a personal time works</p>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.heading}>
                <span className="n">{i + 1}</span>
                <div><h3>{s.heading}</h3><p className="muted">{s.body}</p></div>
              </li>
            ))}
          </ol>
        </section>

        {events.length > 0 && (
          <section>
            <p className="eyebrow">His schedule</p>
            <h2>Satsang, lives and meetups</h2>
            {events.map((e) => (
              <div className="event" key={e.id}>
                <span className={`tag ${e.kind}`}>{e.kind === 'live' ? 'Live · open to all' : e.kind === 'meetup' ? 'Meetup' : 'Satsang · open to all'}</span>
                <h3>{e.title}</h3>
                <p className="muted" style={{ margin: 0 }}>
                  {e.when}{e.location ? ` · ${e.location}` : ''}
                  {e.notes ? ` · ${e.notes}` : ''}
                </p>
                {e.link && <p style={{ margin: '6px 0 0' }}><a href={e.link}>Watch it here</a></p>}
              </div>
            ))}
          </section>
        )}

        <section>
          <p className="eyebrow">Good to know</p>
          <ul className="know">
            {GOOD_TO_KNOW.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </section>

        <section className="closing">
          <h2>Thirty minutes with him, at a time you choose.</h2>
          <a className="primary" href="#times">Choose a time</a>
          {hero?.credit && <p className="credit">{hero.credit}</p>}
        </section>
      </div>
    </>
  );
}
