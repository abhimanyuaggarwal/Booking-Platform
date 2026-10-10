import { createContext, useContext, useEffect, useState } from 'react';

// Every word the team reads on the day-to-day screens, in English and in plain Hindi. Ashram words,
// not office words. The language is a switch in the top bar and is remembered on this device.
// Level-two screens (Money, Settings) are English for now.

export type Lang = 'en' | 'hi';
const KEY = 'samvad-console-lang';

export const WORDS = {
  en: {
    product: 'Samvad',
    nav: { today: 'Today', week: 'Week', calendar: 'Calendar', devotees: 'Devotees', gurus: 'Gurus', more: 'More', money: 'Money', settings: 'Settings', newBooking: 'New booking', newBookingShort: 'Book', search: 'Find anyone by name or number', signOut: 'Sign out', language: 'हिंदी' },
    state: { confirmed: 'Paid', held: 'Paying', completed: 'Done', no_show: 'Did not join', rescheduled: 'Moved', cancelled: 'Cancelled', refunded: 'Returned', expired: 'Hold expired' },
    attention: { hold_expired: 'Chose a time, did not pay', paid_too_late: 'Paid after the hold ran out', did_not_join: 'Did not join', waited_alone: 'Waited, guruji did not sit', waited_and_chose: 'Waited, guruji did not sit', refund_sent: 'Dakshina returned', asked_team: 'Asked to change or cancel, inside four hours' },
    today: {
      title: 'Today', noSittings: 'Guruji has no sittings today.', count: (n: number, open: number) => `${n} ${n === 1 ? 'sitting' : 'sittings'} · ${open} open`,
      nextSitting: 'Next sitting', nowSitting: 'Now', wishes: 'Wishes to speak about', voiceNote: 'has sent a voice note', firstTime: 'First time', visit: (n: number) => `${n}${n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} visit`,
      tellGuru: 'Tell guruji', told: 'Guruji has a note on his WhatsApp.', open: 'Open', nothingNeeds: 'Nothing to do right now.',
      needsOne: 'One thing to do', needsMany: (n: number) => `${n} things to do`, sendLinkAgain: 'Send the link again', decide: 'Decide', handedBack: 'Handed back',
      cannotSit: 'Guruji cannot sit today', sittings: "Today's sittings", time: 'Time', who: 'Who', state: 'State', openSlot: 'open', bookIt: 'book', openRun: (from: string, to: string, n: number) => `${n} open times, ${from} to ${to}`,
      linkSent: (name: string) => `${name} has the pay link again; the time is held for ten minutes.`,
    },
    waiting: {
      title: 'Waiting now', nobody: 'Nobody is waiting. When someone opens her link she appears here, and you can speak to her.',
      people: (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`, inRoom: (m: number) => `In the waiting room · ${m} min`,
      openedEarlier: 'Opened her link earlier, not in the room now — a message goes to WhatsApp', notOpened: 'Link not opened yet — a message goes to WhatsApp',
      call: 'Call', write: 'Write a message', send: 'Send', waysOut: (first: string) => `If he cannot get to ${first}`, hideWays: 'Hide', laterToday: 'Later today', tomorrow: 'Tomorrow',
      nothingToday: 'nothing free today', nothingTomorrow: 'nothing free tomorrow', returnDakshina: 'Return the dakshina',
      running: (name: string, time: string) => `Guruji is with ${name} (${time}).`, late: (n: number) => `Running ${n} minutes late. `,
      foot: 'You can speak to the waiting room or call. You never enter the session.',
      moveConfirm: (name: string, label: string) => `Move ${name} to ${label}? She is told on WhatsApp at once.`,
      refundConfirm: (name: string) => `Return ${name}'s dakshina? Razorpay sends it back; she is told on WhatsApp.`,
    },
    week: {
      title: 'Week', grid: 'Grid', list: 'List', thisWeek: 'This week', cannotSit: 'Guruji cannot sit on a day', filled: (a: number, b: number) => `${a} of ${b} filled`,
      days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], his: 'his', rest: 'afternoon — rest', closed: 'closed', noSittings: 'no sittings', open: 'open', bookIt: 'open · book', openRun: (to: string, n: number) => `${n} open times until ${to}`,
      legend: { paid: 'paid', hold: 'paying', done: 'done', noshow: 'did not join', open: 'open', shut: 'day closed' },
      outside: 'Also booked outside his current timings:', schedule: 'His schedule', thisWeekCount: (n: number) => `${n} this week`,
      scheduleHint: 'Satsangs, lives and meetups appear on his website and, in the week above, on their day.', addEvent: 'Add or change a satsang, live or meetup', hide: 'Hide',
      satsang: 'Satsang', live: 'Live', meetup: 'Meetup', closedNobody: 'Closed. Nobody is booked.', noSittingsLine: 'No sittings.', loading: 'Loading the week.',
    },
    closeDay: {
      title: 'Guruji cannot sit', sub: 'travelling, unwell, or a change of plan', whichDay: 'Which day', looking: 'Looking at that day.',
      nobody: 'Nobody is booked.', booked: (n: number) => `${n === 1 ? 'One sitting is' : `${n} sittings are`} booked. These are the nearest times that suit each of them.`,
      holds: (n: number) => `${n} unpaid ${n === 1 ? 'hold goes' : 'holds go'} back on the shelf.`, leave: 'Leave for now',
      note: 'Each one gets a fresh confirmation on WhatsApp with the new time. Nobody is called, and the dakshina moves with the booking.',
      moveAndTell: (n: number) => `Move ${n} and tell them`, closeTheDay: 'Close the day', cancel: 'Cancel',
      confirm: (day: string, n: number, unmoved: number) => `Close ${day}, move ${n} ${n === 1 ? 'person' : 'people'} and tell them on WhatsApp?${unmoved > 0 ? ` ${unmoved} of them ${unmoved === 1 ? 'has' : 'have'} no new time chosen and will stay booked on a closed day.` : ''}`,
      done: (r: { date: string; moved: number; notified: number; notDelivered: number; failed: number; expiredHolds: number }) =>
        `${r.date} is closed. ${r.moved} moved and ${r.notified} told on WhatsApp` + (r.notDelivered ? `; ${r.notDelivered} could not be reached — call them` : '') + (r.failed ? `; ${r.failed} could not be moved because the time was taken` : '') + (r.expiredHolds ? `; ${r.expiredHolds} unpaid hold released` : '') + '.',
    },
    booking: {
      title: 'New booking', phone: 'Her WhatsApp number, with country code', name: 'Her name', forWhom: 'For whom, if not her', time: 'Time', heard: 'How she heard',
      sources: { direct: 'Called or messaged directly', live: 'From a live', ashram: 'At the ashram', poster: 'Saw a poster' },
      question: 'What she wants to ask, if she said', pays: 'How she pays', payLink: 'She pays the link we send on WhatsApp', cash: 'Already paid in cash', upi: 'Already paid by UPI to the ashram',
      kind: 'Kind of sitting', complimentary: 'Complimentary, at guruji\'s wish', hintFree: 'The time is confirmed now with no dakshina, recorded as complimentary, and she gets the join link on WhatsApp.', submitFree: 'Book it, complimentary',
      hintLink: 'The time is held for ten minutes and she gets a Pay button on WhatsApp. Once she pays, it is confirmed like any other booking.',
      hintPaid: 'The time is confirmed now, the dakshina is recorded as taken by hand, and she gets the join link on WhatsApp.',
      submitLink: 'Hold the time and send the pay link', submitPaid: 'Book it as paid', busy: 'One moment', close: 'Close', cancel: 'Cancel',
      doneLink: (name: string, time: string) => `${name} has the pay link on WhatsApp. ${time} is held for ten minutes.`,
      donePaid: (name: string, time: string) => `${name} is booked for ${time} and has the join link on WhatsApp.`,
      doneNotDelivered: (name: string, time: string, payUrl?: string | null) => payUrl ? `${name}'s time at ${time} is held, but WhatsApp could not deliver the pay link. Read it to her or send it yourself: ${payUrl}` : `${name} is booked for ${time}, but WhatsApp could not reach her. Call her with the time.`,
    },
    drawer: {
      close: 'Close', opening: 'Opening the booking', booking: 'Booking', note: 'A note to her, in the room or on WhatsApp', send: 'Send', pickTime: 'Pick a time', move: 'Move her',
      cancelKeep: 'Cancel and return the dakshina', cancelFree: 'Cancel the time', refund: 'Return the dakshina', noShow: 'Did not join', sendLink: 'Hold again and send the link', paidCash: 'Paid in cash', paidUpi: 'Paid by UPI to the ashram', tellGuru: 'Tell guruji',
      phone: 'Phone', forWhom: 'For', askedAbout: 'Asked about', dakshina: 'Dakshina', notPaid: 'not paid', voiceNote: 'a voice note, for guruji alone', nothingYet: 'nothing yet',
      openedLink: 'Opened link', moved: 'Moved', fromEarlier: 'from an earlier time', edit: 'Edit name or who it is for', money: 'Money', said: 'What was said', us: 'US', her: 'HER', otherTimes: 'Her other times',
      byCredit: 'by credit', notDelivered: 'NOT DELIVERED', save: 'Save', cancelEdit: 'Cancel', herName: 'Her name', whoFor: 'Who the time is for',
      sitting: 'Sitting', complimentary: 'complimentary', paidFree: 'Complimentary', minutes: (n: number) => `${n} min`,
    },
    more: { title: 'More', moneyTitle: 'Money', moneyLine: 'Dakshina collected, returned, and what settles on Friday.', settingsTitle: 'Settings', settingsLine: 'His timings, his website, QR codes.' },
    now: { next: 'Next sitting', none: 'No more sittings today', needs: 'Needs you', nothing: 'nothing', sittings: 'Sittings today', of: (n: number, open: number) => `${n} booked · ${open} open`, inMinutes: (m: number) => (m <= 0 ? 'now' : m < 60 ? `in ${m} min` : `at`) },
    devotees: {
      title: 'Devotees', line: 'Everyone who has booked with guruji, and what they gave.', search: 'Find by name or number', none: 'Nobody has booked yet. The first booking from the live or the phone appears here.',
      noMatch: 'Nobody matches that.', name: 'Name', visits: 'Sittings', last: 'Last sitting', next: 'Next sitting', given: 'Dakshina given', never: 'none yet', nothingAhead: 'nothing booked',
      history: 'Every time', book: 'Book a time for her', back: 'All devotees', phone: 'Phone', forWhom: 'For', visitsOf: (n: number) => `${n} ${n === 1 ? 'sitting' : 'sittings'} with guruji`,
    },
    setup: {
      title: 'Going live: five things to set', done: 'done', todo: 'to do',
      timings: 'His timings', kinds: 'Kinds of sitting and dakshina', website: 'His website: about and tagline', guruPhone: 'Guruji’s WhatsApp number, for the ten-minute note', qr: 'A QR code for the live or a poster',
      foot: 'Once these are set, bookings from the live, the website and the phone land on this screen.',
    },
    settingsPage: {
      title: 'Settings', line: 'Set once, changed rarely.',
      kinds: 'Kinds of sitting', kindsLine: 'How long a sitting is and its dakshina. Up to three.', timings: 'His timings', timingsLine: 'Which days and hours he sits, and days he is away.',
      website: 'His website', websiteLine: 'His photo, his words, and the facts about him.', messages: 'Messages and guruji’s phone', messagesLine: 'Hindi or English for every WhatsApp message, and his own number.',
      qr: 'QR codes', qrLine: 'One for the live, one for the poster, one for the ashram.',
      access: 'Team and access', accessLine: 'Who can open this console: his team, and Slike’s admins.',
    },
    gurus: {
      title: 'Gurus', line: 'Every guru on Samvad, and how far each is set up.', add: 'Add a guru', none: 'No gurus yet. Add the first one.',
      name: 'Name', status: 'Status', address: 'Address', setup: 'Set up', subscription: 'Subscription', open: 'Open',
      statusWords: { draft: 'Draft', setting_up: 'Setting up', live: 'Live', paused: 'Paused' } as Record<string, string>,
      newTitle: 'Add a guru', newLine: 'Three things to start. His team fills in the rest, step by step.', newName: 'His name, as devotees know him', newSlug: 'Short address name', newSlugHint: 'Lowercase letters, digits and hyphens. His site will be at this name under Samvad.',
      newLanguage: 'Language of his WhatsApp messages and his team’s panel', newDomain: 'His own domain, if he has one (optional)', create: 'Create the guru', created: (name: string) => `${name} is created as a draft. Now the steps.`,
      setupTitle: (name: string) => `Setting up ${name}`, progress: (done: number, total: number) => `${done} of ${total} steps done`, required: 'required', optional: 'optional',
      viewAs: 'Open his console', goLive: 'Go live', pause: 'Pause', resume: 'Resume', startSetup: 'Start setting up', notReady: 'Finish the required steps to go live.',
      live: 'His doors are open: WhatsApp, the website and the phone take bookings.', pausedLine: 'Paused: devotees are told booking is not open just now. Nothing is lost.',
      draftLine: 'A draft: nobody outside Slike can see him yet.', settingUpLine: 'Being set up: his team can sign in; his doors stay shut until he goes live.',
      steps: {
        identity: { title: 'Who he is', why: 'His name, a line about him and a tagline are the first things a devotee reads.', action: 'Edit his website words' },
        address: { title: 'His address', why: 'Where his site lives. A Samvad address works on day one; his own domain can come later.', action: 'Set his domain' },
        team: { title: 'His team', why: 'The people who answer the phone and run the day. They sign in with their number.', action: 'Add team members' },
        sittings: { title: 'Kinds of sitting and timings', why: 'What a devotee can book: how long, for what dakshina, on which days.', action: 'Set kinds and timings' },
        payments: { title: 'Payments', why: 'Where the dakshina lands. His own Razorpay account, connected here.', action: 'Connect Razorpay' },
        whatsapp: { title: 'WhatsApp number', why: 'The number devotees write Hi to, in his name.', action: 'Set up his number' },
        distribution: { title: 'QR codes', why: 'One under the live, one on the poster, one at the ashram. Each one tells us where a booking came from.', action: 'Make QR codes' },
        business: { title: 'Business details', why: 'Legal name, address, GST and PAN, if receipts need them.', action: 'Add business details' },
        live: { title: 'Go live', why: 'One switch. Until then his doors are shut and his team can practise.', action: 'Go live' },
      } as Record<string, { title: string; why: string; action: string }>,
      shared: 'Slike’s shared account for now', soon: 'Coming in the next release', done: 'Done', todo: 'To do',
      subscriptionLine: 'What Slike charges him. Recorded here; billed outside the panel.', plan: 'Plan', fee: 'Monthly fee, rupees', subStatus: 'Status', nextDue: 'Next due on',
      subStatusWords: { trial: 'Trial', active: 'Active', overdue: 'Overdue', cancelled: 'Cancelled' } as Record<string, string>,
      businessLine: 'Optional. Needed only if devotees want receipts with tax details.', legalName: 'Legal name', addressLine: 'Address', gst: 'GST number', pan: 'PAN',
      domainTitle: 'His own domain', domainLine: (sub: string) => `His site answers at ${sub} already. For his own domain, add one CNAME record pointing at Samvad and type the domain here.`,
      payments: {
        title: 'His Razorpay account', shared: 'Payments land in Slike’s shared Razorpay account for now.', connected: (keyId: string, mode: string, at: string) => `Connected: ${keyId}, ${mode} mode, since ${at}.`,
        pending: (summary: string, by: string, at: string) => `Waiting for guruji’s approval on WhatsApp: ${summary}, asked by ${by} at ${at}. Nothing changes until he taps Approve.`,
        noPhone: 'Guruji’s WhatsApp number is needed first, so he can approve this. Add it under Settings, Messages.', noSecrets: 'The server has no SECRETS_KEY yet, so secrets cannot be stored. Ask Slike engineering.',
        keyId: 'Key id', keySecret: 'Key secret', webhookSecret: 'Webhook secret', where: 'From his Razorpay dashboard: Settings, API keys. The secret is shown once, when the key is made.',
        webhook: 'Then add this webhook address in his dashboard, event order.paid, with the same webhook secret:', send: 'Check the keys and send to guruji for approval', sent: 'The keys open his account. Guruji has the request on WhatsApp.',
        verify: 'Check the connection', verifiedOk: 'Razorpay accepts his keys.', verifiedBad: 'Razorpay no longer accepts his keys. Make a new key in his dashboard and connect again.', lastVerified: (at: string) => `last checked ${at}`,
        disconnect: 'Disconnect', confirmDisconnect: 'Disconnect his Razorpay? New bookings go to Slike’s shared account until he is connected again.', modeWords: { test: 'test', live: 'live' } as Record<string, string>,
        moneyOwn: (keyId: string, mode: string) => `Payments land in his own Razorpay account (${keyId}, ${mode} mode).`, moneyShared: 'Payments land in Slike’s shared Razorpay account.',
      },
      whatsapp: {
        title: 'His WhatsApp number', shared: (n: string) => `Devotees write to Slike’s shared number${n ? `, +${n}` : ''}, for now.`, live: (name: string, n: string, at: string) => `Live: devotees write to +${n}, shown as "${name}", since ${at}.`,
        pending: (summary: string, by: string, at: string) => `Waiting for guruji’s approval on WhatsApp to switch to ${summary}, asked by ${by} at ${at}.`,
        noWaba: 'The server has no WHATSAPP_BUSINESS_ACCOUNT_ID yet, so a number cannot be added here. A number registered in Meta’s WhatsApp Manager can still be pasted below.',
        rule: 'The SIM must never have been on WhatsApp. Meta will take the number over; it cannot be used in the WhatsApp app afterwards.',
        displayName: 'Display name devotees see', phone: 'The number, with country code', add: 'Add the number to Slike’s account', added: 'Added. Now have Meta send the code to the SIM.',
        sendSms: 'Send the code by SMS', sendCall: 'Send the code by a call', codeSent: 'The code is on its way to the SIM. Type it below.', code: 'The six-digit code', verify: 'Verify and register',
        registered: 'Registered under Slike’s account. One step left: guruji’s approval to switch devotees to it.', goLive: 'Ask guruji to approve the switch', sentToGuru: 'Guruji has the request on WhatsApp.',
        manualTitle: 'Already registered in Meta’s WhatsApp Manager?', manualLine: 'Paste the phone number id shown under the number there, and skip the code step.', phoneNumberId: 'Phone number id', useManual: 'Use this registered number',
        failed: (why: string) => `Meta refused the last step: ${why}`, retry: 'Try the step again', disconnect: 'Back to the shared number', confirmDisconnect: 'Go back to Slike’s shared number? His own number stays registered in Meta and can be connected again.',
        statusWords: { none: 'not set up', added: 'added, code not sent', code_sent: 'code sent to the SIM', verified: 'verified', registered: 'registered', live: 'live', failed: 'failed' } as Record<string, string>,
        displayNameNote: 'Meta approves display names by hand. "Samvad · Bhagwat" always passes; a bare name may be queried.',
      },
      save: 'Save', saved: 'Saved.', trail: 'What changed', nobodyYet: 'nobody yet', teamOf: (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`,
      actions: { 'guru.created': 'created', 'guru.setup': 'changed the setup', 'guru.live': 'went live', 'guru.paused': 'paused', 'guru.setting_up': 'started setting up', 'guru.draft': 'back to draft', 'settings.timings': 'saved the timings', 'settings.website': 'saved the website words', 'settings.kinds': 'saved the kinds of sitting', 'access.added': 'added a person', 'access.removed': 'removed a person', 'payments.requested': 'asked guruji to approve his Razorpay', 'payments.approved': 'approved the Razorpay connection', 'payments.rejected': 'declined the Razorpay connection', 'payments.verified': 'checked the Razorpay keys', 'payments.failed': 'found the Razorpay keys no longer work', 'payments.disconnected': 'disconnected Razorpay', 'whatsapp.added': 'added a WhatsApp number', 'whatsapp.manual': 'used a registered WhatsApp number', 'whatsapp.registered': 'registered the WhatsApp number', 'whatsapp.requested': 'asked guruji to approve the number', 'whatsapp.approved': 'approved the number', 'whatsapp.rejected': 'declined the number', 'whatsapp.disconnected': 'went back to the shared number' } as Record<string, string>,
    },
    access: {
      title: 'Team and access', team: (guru: string) => `${guru}’s team`, admins: 'Slike admins', add: 'Add a person', name: 'Name', phone: 'WhatsApp number, with country code',
      role: 'Role', roleTeam: 'Team member', roleAdmin: 'Slike admin', neverSignedIn: 'has not signed in yet', lastSeen: 'last signed in', remove: 'Remove access',
      hint: 'A new person signs in with their number, asks for a code on WhatsApp, and chooses their password.', removed: 'Access removed.', added: (name: string) => `${name} can sign in now.`,
      confirmRemove: (name: string) => `Remove ${name}’s access? They can be added again later.`,
    },
    meetups: { confirmRemove: (title: string) => `Remove "${title}" from his schedule? It leaves his website at once.` },
    dialog: { notNow: 'Not now', yes: 'Yes', move: 'Move', cancelTime: 'Cancel the time', returnDakshina: 'Return the dakshina', noShow: 'Mark as did not join', confirmPaid: 'Confirm', remove: 'Remove', closeDay: 'Close the day', disconnect: 'Disconnect', sharedNumber: 'Go back to the shared number', moveHer: 'Move her', removeAccess: 'Remove access' },
    slotPicker: { loading: 'Loading open times.', none: 'No open times in the days ahead. Open more in Settings.', pick: 'Pick a time', today: 'Today', tomorrow: 'Tomorrow', days: { Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri', Sat: 'Sat', Sun: 'Sun' } as Record<string, string> },
    login: {
      title: 'Samvad · team console', hint: 'Sign in with your WhatsApp number and your password.', username: 'Username', password: 'Password', signIn: 'Sign in',
      phone: 'Your WhatsApp number, with country code', firstTime: 'First time here, or forgotten your password?', sendCode: 'Send me a code on WhatsApp',
      codeSent: 'A six-digit code is on its way to your WhatsApp. It works for ten minutes.', code: 'The code', newPassword: 'Choose a password, at least 8 characters', setPassword: 'Set the password and sign in',
      back: 'Back to sign in', adminDoor: 'Slike admin, shared password', phoneDoor: 'Sign in with your number',
    },
    common: { loading: 'One moment.', call: 'Call' },
  },
  hi: {
    product: 'संवाद',
    nav: { today: 'आज', week: 'सप्ताह', calendar: 'कैलेंडर', devotees: 'भक्त', gurus: 'गुरु', more: 'और', money: 'दक्षिणा', settings: 'सेटिंग', newBooking: 'नई बुकिंग', newBookingShort: 'बुकिंग', search: 'नाम या नंबर से खोजें', signOut: 'साइन आउट', language: 'English' },
    state: { confirmed: 'दक्षिणा मिली', held: 'भुगतान बाकी', completed: 'हो गया', no_show: 'नहीं आए', rescheduled: 'समय बदला', cancelled: 'रद्द', refunded: 'दक्षिणा लौटाई', expired: 'समय छूटा' },
    attention: { hold_expired: 'समय चुना, भुगतान नहीं किया', paid_too_late: 'समय छूटने के बाद भुगतान किया', did_not_join: 'नहीं आए', waited_alone: 'इंतज़ार किया, गुरुजी नहीं बैठे', waited_and_chose: 'इंतज़ार किया, गुरुजी नहीं बैठे', refund_sent: 'दक्षिणा लौटाई', asked_team: 'चार घंटे के भीतर समय बदलने या रद्द करने को कहा' },
    today: {
      title: 'आज', noSittings: 'आज गुरुजी की कोई बैठक नहीं है।', count: (n: number, open: number) => `${n} बैठकें · ${open} खाली`,
      nextSitting: 'अगली बैठक', nowSitting: 'अभी', wishes: 'बात करना चाहते हैं', voiceNote: 'आवाज़ का संदेश भेजा है', firstTime: 'पहली बार', visit: (n: number) => `${n}वीं बार`,
      tellGuru: 'गुरुजी को बताएँ', told: 'गुरुजी के व्हाट्सऐप पर संदेश चला गया।', open: 'खोलें', nothingNeeds: 'अभी कुछ करने को नहीं है।',
      needsOne: 'एक काम बाकी', needsMany: (n: number) => `${n} काम बाकी`, sendLinkAgain: 'लिंक फिर भेजें', decide: 'तय करें', handedBack: 'वापस दे दी',
      cannotSit: 'आज गुरुजी नहीं बैठेंगे', sittings: 'आज की बैठकें', time: 'समय', who: 'कौन', state: 'स्थिति', openSlot: 'खाली', bookIt: 'बुक करें', openRun: (from: string, to: string, n: number) => `${from} से ${to} तक ${n} खाली समय`,
      linkSent: (name: string) => `${name} को भुगतान लिंक फिर भेजा; समय दस मिनट के लिए रोका है।`,
    },
    waiting: {
      title: 'अभी इंतज़ार में', nobody: 'अभी कोई इंतज़ार में नहीं है। जब कोई अपना लिंक खोलेगा, यहाँ दिखेगा, और आप उनसे बात कर सकेंगे।',
      people: (n: number) => `${n} ${n === 1 ? 'व्यक्ति' : 'लोग'}`, inRoom: (m: number) => `प्रतीक्षा कक्ष में · ${m} मिनट`,
      openedEarlier: 'लिंक पहले खोला था, अभी कक्ष में नहीं — संदेश व्हाट्सऐप पर जाएगा', notOpened: 'लिंक अभी नहीं खोला — संदेश व्हाट्सऐप पर जाएगा',
      call: 'कॉल', write: 'संदेश लिखें', send: 'भेजें', waysOut: (first: string) => `अगर गुरुजी ${first} से नहीं मिल पाएँ`, hideWays: 'छिपाएँ', laterToday: 'आज बाद में', tomorrow: 'कल',
      nothingToday: 'आज कुछ खाली नहीं', nothingTomorrow: 'कल कुछ खाली नहीं', returnDakshina: 'दक्षिणा लौटाएँ',
      running: (name: string, time: string) => `गुरुजी ${name} के साथ हैं (${time})।`, late: (n: number) => `${n} मिनट देर से चल रहा है। `,
      foot: 'आप प्रतीक्षा कक्ष में संदेश भेज सकते हैं या कॉल कर सकते हैं। बैठक में आप कभी नहीं जाते।',
      moveConfirm: (name: string, label: string) => `${name} को ${label} पर ले जाएँ? उन्हें तुरंत व्हाट्सऐप पर बताया जाएगा।`,
      refundConfirm: (name: string) => `${name} की दक्षिणा लौटाएँ? Razorpay से वापस जाएगी; उन्हें व्हाट्सऐप पर बताया जाएगा।`,
    },
    week: {
      title: 'सप्ताह', grid: 'तालिका', list: 'सूची', thisWeek: 'यह सप्ताह', cannotSit: 'किसी दिन गुरुजी नहीं बैठेंगे', filled: (a: number, b: number) => `${b} में से ${a} भरे`,
      days: ['सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि', 'रवि'], his: 'गुरुजी', rest: 'दोपहर — विश्राम', closed: 'बंद', noSittings: 'बैठक नहीं', open: 'खाली', bookIt: 'खाली · बुक करें', openRun: (to: string, n: number) => `${to} तक ${n} खाली समय`,
      legend: { paid: 'दक्षिणा मिली', hold: 'भुगतान बाकी', done: 'हो गया', noshow: 'नहीं आए', open: 'खाली', shut: 'दिन बंद' },
      outside: 'तय समय के बाहर भी बुक:', schedule: 'गुरुजी का कार्यक्रम', thisWeekCount: (n: number) => `इस सप्ताह ${n}`,
      scheduleHint: 'सत्संग, लाइव और मिलन गुरुजी की वेबसाइट पर और ऊपर सप्ताह में उनके दिन पर दिखते हैं।', addEvent: 'सत्संग, लाइव या मिलन जोड़ें या बदलें', hide: 'छिपाएँ',
      satsang: 'सत्संग', live: 'लाइव', meetup: 'मिलन', closedNobody: 'बंद। कोई बुकिंग नहीं।', noSittingsLine: 'बैठक नहीं।', loading: 'सप्ताह खुल रहा है।',
    },
    closeDay: {
      title: 'गुरुजी नहीं बैठेंगे', sub: 'यात्रा, तबीयत, या कोई और वजह', whichDay: 'कौन सा दिन', looking: 'उस दिन को देख रहे हैं।',
      nobody: 'कोई बुकिंग नहीं है।', booked: (n: number) => `${n} बैठकें बुक हैं। हर एक के लिए सबसे पास का समय यह है।`,
      holds: (n: number) => `${n} बिना भुगतान वाले समय खाली हो जाएँगे।`, leave: 'अभी रहने दें',
      note: 'हर किसी को नए समय की पुष्टि व्हाट्सऐप पर मिलेगी। किसी को कॉल नहीं करना पड़ेगा, और दक्षिणा बुकिंग के साथ जाएगी।',
      moveAndTell: (n: number) => `${n} को नया समय दें और बताएँ`, closeTheDay: 'दिन बंद करें', cancel: 'रद्द',
      confirm: (day: string, n: number, unmoved: number) => `${day} बंद करें, ${n} लोगों को नया समय दें और व्हाट्सऐप पर बताएँ?${unmoved > 0 ? ` ${unmoved} के लिए नया समय नहीं चुना है; वे बंद दिन पर ही रहेंगे।` : ''}`,
      done: (r: { date: string; moved: number; notified: number; notDelivered: number; failed: number; expiredHolds: number }) =>
        `${r.date} बंद है। ${r.moved} को नया समय मिला और ${r.notified} को व्हाट्सऐप पर बताया` + (r.notDelivered ? `; ${r.notDelivered} तक संदेश नहीं पहुँचा — उन्हें कॉल करें` : '') + (r.failed ? `; ${r.failed} का समय नहीं बदल सका क्योंकि वह समय ले लिया गया` : '') + (r.expiredHolds ? `; ${r.expiredHolds} बिना भुगतान वाला समय खाली हुआ` : '') + '।',
    },
    booking: {
      title: 'नई बुकिंग', phone: 'उनका व्हाट्सऐप नंबर, देश कोड के साथ', name: 'उनका नाम', forWhom: 'किसके लिए, अगर खुद के लिए नहीं', time: 'समय', heard: 'कैसे पता चला',
      sources: { direct: 'सीधे फ़ोन या संदेश किया', live: 'लाइव से', ashram: 'आश्रम में', poster: 'पोस्टर देखा' },
      question: 'क्या पूछना चाहते हैं, अगर बताया हो', pays: 'भुगतान कैसे', payLink: 'व्हाट्सऐप पर भेजे लिंक से भुगतान करेंगे', cash: 'नकद दे चुके हैं', upi: 'आश्रम को UPI से दे चुके हैं',
      kind: 'बैठक का प्रकार', complimentary: 'निःशुल्क, गुरुजी की इच्छा से', hintFree: 'बुकिंग अभी पक्की हो जाएगी, बिना दक्षिणा, निःशुल्क दर्ज होगी, और उन्हें व्हाट्सऐप पर जुड़ने का लिंक मिलेगा।', submitFree: 'निःशुल्क बुक करें',
      hintLink: 'समय दस मिनट के लिए रोका जाएगा और उन्हें व्हाट्सऐप पर भुगतान का बटन मिलेगा। भुगतान होते ही बुकिंग पक्की।',
      hintPaid: 'बुकिंग अभी पक्की हो जाएगी, दक्षिणा हाथ से ली गई दर्ज होगी, और उन्हें व्हाट्सऐप पर जुड़ने का लिंक मिलेगा।',
      submitLink: 'समय रोकें और भुगतान लिंक भेजें', submitPaid: 'भुगतान हो चुका, बुक करें', busy: 'एक क्षण', close: 'बंद करें', cancel: 'रद्द',
      doneLink: (name: string, time: string) => `${name} को व्हाट्सऐप पर भुगतान लिंक मिल गया। ${time} दस मिनट के लिए रोका है।`,
      donePaid: (name: string, time: string) => `${name} की ${time} की बुकिंग पक्की; जुड़ने का लिंक व्हाट्सऐप पर भेज दिया।`,
      doneNotDelivered: (name: string, time: string, payUrl?: string | null) => payUrl ? `${name} का ${time} का समय रोका है, पर व्हाट्सऐप भुगतान लिंक नहीं पहुँचा सका। उन्हें पढ़कर बताएँ या खुद भेजें: ${payUrl}` : `${name} की ${time} की बुकिंग पक्की, पर व्हाट्सऐप उन तक नहीं पहुँचा। उन्हें कॉल करके समय बताएँ।`,
    },
    drawer: {
      close: 'बंद करें', opening: 'बुकिंग खुल रही है', booking: 'बुकिंग', note: 'उनके लिए संदेश, कक्ष में या व्हाट्सऐप पर', send: 'भेजें', pickTime: 'समय चुनें', move: 'समय बदलें',
      cancelKeep: 'रद्द करें, दक्षिणा लौटाएँ', cancelFree: 'समय रद्द करें', refund: 'दक्षिणा लौटाएँ', noShow: 'नहीं आए', sendLink: 'फिर रोकें और लिंक भेजें', paidCash: 'नकद मिला', paidUpi: 'आश्रम को UPI मिला', tellGuru: 'गुरुजी को बताएँ',
      phone: 'फ़ोन', forWhom: 'किसके लिए', askedAbout: 'प्रश्न', dakshina: 'दक्षिणा', notPaid: 'भुगतान नहीं', voiceNote: 'आवाज़ का संदेश, सिर्फ़ गुरुजी के लिए', nothingYet: 'अभी कुछ नहीं',
      openedLink: 'लिंक खोला', moved: 'समय बदला', fromEarlier: 'पहले के समय से', edit: 'नाम या किसके लिए, बदलें', money: 'दक्षिणा', said: 'बातचीत', us: 'हम', her: 'वे', otherTimes: 'उनकी अन्य बैठकें',
      byCredit: 'जमा दक्षिणा से', notDelivered: 'नहीं पहुँचा', save: 'सहेजें', cancelEdit: 'रहने दें', herName: 'उनका नाम', whoFor: 'किसके लिए',
      sitting: 'बैठक', complimentary: 'निःशुल्क', paidFree: 'निःशुल्क', minutes: (n: number) => `${n} मिनट`,
    },
    more: { title: 'और', moneyTitle: 'दक्षिणा का हिसाब', moneyLine: 'कितनी दक्षिणा आई, कितनी लौटाई, शुक्रवार को क्या आएगा।', settingsTitle: 'सेटिंग', settingsLine: 'गुरुजी का समय, वेबसाइट, QR कोड।' },
    now: { next: 'अगली बैठक', none: 'आज और बैठकें नहीं', needs: 'आपका ध्यान', nothing: 'कुछ नहीं', sittings: 'आज की बैठकें', of: (n: number, open: number) => `${n} बुक · ${open} खाली`, inMinutes: (m: number) => (m <= 0 ? 'अभी' : m < 60 ? `${m} मिनट में` : '') },
    devotees: {
      title: 'भक्त', line: 'जिन्होंने गुरुजी के साथ समय बुक किया, और क्या दक्षिणा दी।', search: 'नाम या नंबर से खोजें', none: 'अभी तक किसी ने बुक नहीं किया। लाइव या फ़ोन से पहली बुकिंग यहाँ दिखेगी।',
      noMatch: 'ऐसा कोई नहीं मिला।', name: 'नाम', visits: 'बैठकें', last: 'पिछली बैठक', next: 'अगली बैठक', given: 'दी गई दक्षिणा', never: 'अभी नहीं', nothingAhead: 'कुछ बुक नहीं',
      history: 'हर बैठक', book: 'इनके लिए समय बुक करें', back: 'सभी भक्त', phone: 'फ़ोन', forWhom: 'किसके लिए', visitsOf: (n: number) => `गुरुजी के साथ ${n} बैठकें`,
    },
    setup: {
      title: 'शुरू करने के लिए पाँच बातें', done: 'हो गया', todo: 'बाकी',
      timings: 'गुरुजी का समय', kinds: 'बैठक के प्रकार और दक्षिणा', website: 'वेबसाइट: परिचय और टैगलाइन', guruPhone: 'गुरुजी का व्हाट्सऐप नंबर, दस मिनट पहले की सूचना के लिए', qr: 'लाइव या पोस्टर के लिए QR कोड',
      foot: 'ये सेट होते ही लाइव, वेबसाइट और फ़ोन से आई बुकिंग इसी स्क्रीन पर दिखेंगी।',
    },
    settingsPage: {
      title: 'सेटिंग', line: 'एक बार सेट करें, कभी-कभार बदलें।',
      kinds: 'बैठक के प्रकार', kindsLine: 'बैठक कितनी देर की और दक्षिणा कितनी। ज़्यादा से ज़्यादा तीन।', timings: 'गुरुजी का समय', timingsLine: 'किन दिनों, किस समय बैठते हैं, और छुट्टी के दिन।',
      website: 'वेबसाइट', websiteLine: 'फ़ोटो, परिचय और उनके बारे में तथ्य।', messages: 'संदेश और गुरुजी का फ़ोन', messagesLine: 'हर व्हाट्सऐप संदेश हिंदी में या अंग्रेज़ी में, और उनका अपना नंबर।',
      qr: 'QR कोड', qrLine: 'एक लाइव के लिए, एक पोस्टर के लिए, एक आश्रम के लिए।',
      access: 'टीम और पहुँच', accessLine: 'यह कंसोल कौन खोल सकता है: उनकी टीम, और Slike के एडमिन।',
    },
    gurus: {
      title: 'गुरु', line: 'संवाद पर हर गुरु, और हर एक का सेटअप कहाँ तक हुआ।', add: 'गुरु जोड़ें', none: 'अभी कोई गुरु नहीं। पहला जोड़ें।',
      name: 'नाम', status: 'स्थिति', address: 'पता', setup: 'सेटअप', subscription: 'सब्सक्रिप्शन', open: 'खोलें',
      statusWords: { draft: 'ड्राफ़्ट', setting_up: 'सेटअप जारी', live: 'लाइव', paused: 'रुका हुआ' } as Record<string, string>,
      newTitle: 'गुरु जोड़ें', newLine: 'शुरू करने के लिए तीन बातें। बाकी उनकी टीम कदम-दर-कदम भरती है।', newName: 'उनका नाम, जैसा भक्त जानते हैं', newSlug: 'छोटा पता-नाम', newSlugHint: 'छोटे अंग्रेज़ी अक्षर, अंक और हाइफ़न। उनकी साइट संवाद के नीचे इसी नाम पर होगी।',
      newLanguage: 'उनके व्हाट्सऐप संदेशों और टीम के पैनल की भाषा', newDomain: 'उनका अपना डोमेन, अगर है (वैकल्पिक)', create: 'गुरु बनाएँ', created: (name: string) => `${name} ड्राफ़्ट के रूप में बन गए। अब कदम।`,
      setupTitle: (name: string) => `${name} का सेटअप`, progress: (done: number, total: number) => `${total} में से ${done} कदम पूरे`, required: 'ज़रूरी', optional: 'वैकल्पिक',
      viewAs: 'उनका कंसोल खोलें', goLive: 'लाइव करें', pause: 'रोकें', resume: 'फिर शुरू करें', startSetup: 'सेटअप शुरू करें', notReady: 'लाइव करने के लिए पहले ज़रूरी कदम पूरे करें।',
      live: 'उनके दरवाज़े खुले हैं: व्हाट्सऐप, वेबसाइट और फ़ोन से बुकिंग हो रही है।', pausedLine: 'रुका हुआ: भक्तों को बताया जाता है कि बुकिंग अभी खुली नहीं। कुछ नहीं खोता।',
      draftLine: 'ड्राफ़्ट: Slike के बाहर अभी कोई इन्हें नहीं देख सकता।', settingUpLine: 'सेटअप जारी: टीम साइन इन कर सकती है; लाइव होने तक दरवाज़े बंद।',
      steps: {
        identity: { title: 'वे कौन हैं', why: 'नाम, एक पंक्ति परिचय और टैगलाइन — भक्त सबसे पहले यही पढ़ता है।', action: 'वेबसाइट के शब्द बदलें' },
        address: { title: 'उनका पता', why: 'उनकी साइट कहाँ रहती है। संवाद का पता पहले दिन से चलता है; अपना डोमेन बाद में।', action: 'डोमेन सेट करें' },
        team: { title: 'उनकी टीम', why: 'जो फ़ोन उठाते हैं और दिन चलाते हैं। वे अपने नंबर से साइन इन करते हैं।', action: 'टीम सदस्य जोड़ें' },
        sittings: { title: 'बैठक के प्रकार और समय', why: 'भक्त क्या बुक कर सकता है: कितनी देर, कितनी दक्षिणा, किन दिनों।', action: 'प्रकार और समय सेट करें' },
        payments: { title: 'भुगतान', why: 'दक्षिणा कहाँ जाती है। उनका अपना Razorpay खाता, यहाँ जोड़ा जाता है।', action: 'Razorpay जोड़ें' },
        whatsapp: { title: 'व्हाट्सऐप नंबर', why: 'जिस नंबर पर भक्त Hi लिखते हैं, उनके नाम से।', action: 'नंबर सेट करें' },
        distribution: { title: 'QR कोड', why: 'एक लाइव के नीचे, एक पोस्टर पर, एक आश्रम में। हर एक बताता है बुकिंग कहाँ से आई।', action: 'QR कोड बनाएँ' },
        business: { title: 'व्यवसाय विवरण', why: 'कानूनी नाम, पता, GST और PAN, अगर रसीदों में चाहिए।', action: 'विवरण जोड़ें' },
        live: { title: 'लाइव करें', why: 'एक स्विच। तब तक दरवाज़े बंद रहते हैं और टीम अभ्यास कर सकती है।', action: 'लाइव करें' },
      } as Record<string, { title: string; why: string; action: string }>,
      shared: 'अभी Slike का साझा खाता', soon: 'अगली रिलीज़ में', done: 'हो गया', todo: 'बाकी',
      subscriptionLine: 'Slike इनसे क्या लेता है। यहाँ दर्ज; बिल पैनल के बाहर।', plan: 'प्लान', fee: 'मासिक शुल्क, रुपये', subStatus: 'स्थिति', nextDue: 'अगली देय तिथि',
      subStatusWords: { trial: 'ट्रायल', active: 'सक्रिय', overdue: 'बकाया', cancelled: 'रद्द' } as Record<string, string>,
      businessLine: 'वैकल्पिक। सिर्फ़ तब ज़रूरी जब भक्तों को कर-विवरण वाली रसीद चाहिए।', legalName: 'कानूनी नाम', addressLine: 'पता', gst: 'GST नंबर', pan: 'PAN',
      domainTitle: 'उनका अपना डोमेन', domainLine: (sub: string) => `उनकी साइट ${sub} पर पहले से चलती है। अपने डोमेन के लिए एक CNAME रिकॉर्ड संवाद की ओर करें और डोमेन यहाँ लिखें।`,
      payments: {
        title: 'उनका Razorpay खाता', shared: 'भुगतान अभी Slike के साझा Razorpay खाते में आते हैं।', connected: (keyId: string, mode: string, at: string) => `जुड़ा हुआ: ${keyId}, ${mode} मोड, ${at} से।`,
        pending: (summary: string, by: string, at: string) => `व्हाट्सऐप पर गुरुजी की मंज़ूरी का इंतज़ार: ${summary}, ${by} ने ${at} पर माँगा। मंज़ूरी तक कुछ नहीं बदलेगा।`,
        noPhone: 'पहले गुरुजी का व्हाट्सऐप नंबर चाहिए, ताकि वे मंज़ूरी दे सकें। सेटिंग, संदेश में जोड़ें।', noSecrets: 'सर्वर पर अभी SECRETS_KEY नहीं है, इसलिए गोपनीय कुंजियाँ सहेजी नहीं जा सकतीं। Slike इंजीनियरिंग से कहें।',
        keyId: 'Key id', keySecret: 'Key secret', webhookSecret: 'Webhook secret', where: 'उनके Razorpay डैशबोर्ड से: Settings, API keys। सीक्रेट एक ही बार दिखता है, जब key बनती है।',
        webhook: 'फिर यह वेबहुक पता उनके डैशबोर्ड में जोड़ें, इवेंट order.paid, इसी वेबहुक सीक्रेट के साथ:', send: 'कुंजियाँ जाँचें और मंज़ूरी के लिए गुरुजी को भेजें', sent: 'कुंजियाँ उनका खाता खोलती हैं। गुरुजी के व्हाट्सऐप पर अनुरोध पहुँच गया।',
        verify: 'कनेक्शन जाँचें', verifiedOk: 'Razorpay उनकी कुंजियाँ स्वीकार करता है।', verifiedBad: 'Razorpay अब उनकी कुंजियाँ स्वीकार नहीं करता। डैशबोर्ड में नई key बनाकर फिर जोड़ें।', lastVerified: (at: string) => `पिछली जाँच ${at}`,
        disconnect: 'अलग करें', confirmDisconnect: 'उनका Razorpay अलग करें? फिर से जुड़ने तक नई बुकिंग Slike के साझा खाते में जाएँगी।', modeWords: { test: 'टेस्ट', live: 'लाइव' } as Record<string, string>,
        moneyOwn: (keyId: string, mode: string) => `भुगतान उनके अपने Razorpay खाते में आते हैं (${keyId}, ${mode} मोड)।`, moneyShared: 'भुगतान Slike के साझा Razorpay खाते में आते हैं।',
      },
      whatsapp: {
        title: 'उनका व्हाट्सऐप नंबर', shared: (n: string) => `अभी भक्त Slike के साझा नंबर${n ? ` +${n}` : ''} पर लिखते हैं।`, live: (name: string, n: string, at: string) => `लाइव: भक्त +${n} पर लिखते हैं, नाम "${name}", ${at} से।`,
        pending: (summary: string, by: string, at: string) => `${summary} पर बदलने के लिए व्हाट्सऐप पर गुरुजी की मंज़ूरी का इंतज़ार, ${by} ने ${at} पर माँगा।`,
        noWaba: 'सर्वर पर अभी WHATSAPP_BUSINESS_ACCOUNT_ID नहीं है, इसलिए यहाँ नंबर जोड़ा नहीं जा सकता। Meta के WhatsApp Manager में रजिस्टर्ड नंबर नीचे पेस्ट किया जा सकता है।',
        rule: 'SIM कभी व्हाट्सऐप पर नहीं रहा हो। Meta नंबर अपने पास ले लेगा; बाद में यह व्हाट्सऐप ऐप में नहीं चलेगा।',
        displayName: 'भक्तों को दिखने वाला नाम', phone: 'नंबर, देश कोड के साथ', add: 'नंबर Slike के खाते में जोड़ें', added: 'जुड़ गया। अब Meta से SIM पर कोड भिजवाएँ।',
        sendSms: 'SMS से कोड भेजें', sendCall: 'कॉल से कोड भेजें', codeSent: 'कोड SIM पर आ रहा है। नीचे लिखें।', code: 'छह अंकों का कोड', verify: 'जाँचें और रजिस्टर करें',
        registered: 'Slike के खाते में रजिस्टर्ड। एक कदम बाकी: भक्तों को इस पर लाने की गुरुजी की मंज़ूरी।', goLive: 'गुरुजी से मंज़ूरी माँगें', sentToGuru: 'गुरुजी के व्हाट्सऐप पर अनुरोध पहुँच गया।',
        manualTitle: 'Meta के WhatsApp Manager में पहले से रजिस्टर्ड?', manualLine: 'वहाँ नंबर के नीचे दिखने वाला phone number id पेस्ट करें, कोड वाला कदम छोड़ें।', phoneNumberId: 'Phone number id', useManual: 'यह रजिस्टर्ड नंबर इस्तेमाल करें',
        failed: (why: string) => `Meta ने पिछला कदम ठुकरा दिया: ${why}`, retry: 'कदम फिर से करें', disconnect: 'साझा नंबर पर वापस', confirmDisconnect: 'Slike के साझा नंबर पर वापस जाएँ? उनका नंबर Meta में रजिस्टर्ड रहेगा और फिर जोड़ा जा सकता है।',
        statusWords: { none: 'सेट नहीं', added: 'जोड़ा, कोड नहीं भेजा', code_sent: 'SIM पर कोड भेजा', verified: 'जाँच हो गई', registered: 'रजिस्टर्ड', live: 'लाइव', failed: 'विफल' } as Record<string, string>,
        displayNameNote: 'Meta दिखने वाले नाम हाथ से मंज़ूर करता है। "Samvad · Bhagwat" हमेशा चलता है; अकेला नाम पूछा जा सकता है।',
      },
      save: 'सहेजें', saved: 'सहेज लिया।', trail: 'क्या बदला', nobodyYet: 'अभी कोई नहीं', teamOf: (n: number) => `${n} व्यक्ति`,
      actions: { 'guru.created': 'बनाया', 'guru.setup': 'सेटअप बदला', 'guru.live': 'लाइव किया', 'guru.paused': 'रोका', 'guru.setting_up': 'सेटअप शुरू किया', 'guru.draft': 'ड्राफ़्ट में वापस', 'settings.timings': 'समय सहेजा', 'settings.website': 'वेबसाइट के शब्द सहेजे', 'settings.kinds': 'बैठक के प्रकार सहेजे', 'access.added': 'व्यक्ति जोड़ा', 'access.removed': 'व्यक्ति हटाया', 'payments.requested': 'Razorpay की मंज़ूरी गुरुजी से माँगी', 'payments.approved': 'Razorpay कनेक्शन मंज़ूर किया', 'payments.rejected': 'Razorpay कनेक्शन नामंज़ूर किया', 'payments.verified': 'Razorpay कुंजियाँ जाँचीं', 'payments.failed': 'Razorpay कुंजियाँ अब नहीं चलतीं', 'payments.disconnected': 'Razorpay अलग किया', 'whatsapp.added': 'व्हाट्सऐप नंबर जोड़ा', 'whatsapp.manual': 'रजिस्टर्ड नंबर इस्तेमाल किया', 'whatsapp.registered': 'नंबर रजिस्टर किया', 'whatsapp.requested': 'नंबर की मंज़ूरी गुरुजी से माँगी', 'whatsapp.approved': 'नंबर मंज़ूर किया', 'whatsapp.rejected': 'नंबर नामंज़ूर किया', 'whatsapp.disconnected': 'साझा नंबर पर वापस' } as Record<string, string>,
    },
    access: {
      title: 'टीम और पहुँच', team: (guru: string) => `${guru} की टीम`, admins: 'Slike एडमिन', add: 'व्यक्ति जोड़ें', name: 'नाम', phone: 'व्हाट्सऐप नंबर, देश कोड के साथ',
      role: 'भूमिका', roleTeam: 'टीम सदस्य', roleAdmin: 'Slike एडमिन', neverSignedIn: 'अभी साइन इन नहीं किया', lastSeen: 'पिछला साइन इन', remove: 'पहुँच हटाएँ',
      hint: 'नया व्यक्ति अपने नंबर से साइन इन करता है, व्हाट्सऐप पर कोड माँगता है, और पासवर्ड चुनता है।', removed: 'पहुँच हटा दी गई।', added: (name: string) => `${name} अब साइन इन कर सकते हैं।`,
      confirmRemove: (name: string) => `${name} की पहुँच हटाएँ? बाद में फिर जोड़ा जा सकता है।`,
    },
    meetups: { confirmRemove: (title: string) => `"${title}" उनके कार्यक्रम से हटाएँ? यह उनकी वेबसाइट से तुरंत हट जाएगा।` },
    dialog: { notNow: 'अभी नहीं', yes: 'हाँ', move: 'बदलें', cancelTime: 'समय रद्द करें', returnDakshina: 'दक्षिणा लौटाएँ', noShow: 'नहीं आए, दर्ज करें', confirmPaid: 'पक्का करें', remove: 'हटाएँ', closeDay: 'दिन बंद करें', disconnect: 'अलग करें', sharedNumber: 'साझा नंबर पर वापस', moveHer: 'समय बदलें', removeAccess: 'पहुँच हटाएँ' },
    slotPicker: { loading: 'खाली समय आ रहे हैं।', none: 'आने वाले दिनों में कोई खाली समय नहीं। सेटिंग में और खोलें।', pick: 'समय चुनें', today: 'आज', tomorrow: 'कल', days: { Mon: 'सोम', Tue: 'मंगल', Wed: 'बुध', Thu: 'गुरु', Fri: 'शुक्र', Sat: 'शनि', Sun: 'रवि' } as Record<string, string> },
    login: {
      title: 'संवाद · टीम कंसोल', hint: 'अपने व्हाट्सऐप नंबर और पासवर्ड से साइन इन करें।', username: 'यूज़रनेम', password: 'पासवर्ड', signIn: 'साइन इन',
      phone: 'आपका व्हाट्सऐप नंबर, देश कोड के साथ', firstTime: 'पहली बार आए हैं, या पासवर्ड भूल गए?', sendCode: 'व्हाट्सऐप पर कोड भेजें',
      codeSent: 'छह अंकों का कोड आपके व्हाट्सऐप पर आ रहा है। यह दस मिनट तक चलेगा।', code: 'कोड', newPassword: 'पासवर्ड चुनें, कम से कम 8 अक्षर', setPassword: 'पासवर्ड सेट करें और साइन इन करें',
      back: 'साइन इन पर वापस', adminDoor: 'Slike एडमिन, साझा पासवर्ड', phoneDoor: 'अपने नंबर से साइन इन करें',
    },
    common: { loading: 'एक क्षण।', call: 'कॉल' },
  },
} as const;

export type Words = typeof WORDS.en;

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try { return (localStorage.getItem(KEY) as Lang) === 'hi' ? 'hi' : 'en'; } catch { return 'en'; }
  });
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem(KEY, l); } catch { /* private window: the choice lasts the session */ } };
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

/** The words for the current language. Outside the provider (tests, pure views) it is English. */
export function useWords(): Words {
  return WORDS[useContext(LangContext).lang] as Words;
}

export function useLang() {
  return useContext(LangContext);
}
