import { createContext, useContext, useEffect, useState } from 'react';

// Every word the team reads on the day-to-day screens, in English and in plain Hindi. Ashram words,
// not office words. The language is a switch in the top bar and is remembered on this device.
// Level-two screens (Money, Settings) are English for now.

export type Lang = 'en' | 'hi';
const KEY = 'samvad-console-lang';

export const WORDS = {
  en: {
    product: 'Samvad',
    nav: { today: 'Today', week: 'Week', calendar: 'Calendar', devotees: 'Devotees', more: 'More', money: 'Money', settings: 'Settings', newBooking: 'New booking', newBookingShort: 'Book', search: 'Find anyone by name or number', signOut: 'Sign out', language: 'हिंदी' },
    state: { confirmed: 'Paid', held: 'Paying', completed: 'Done', no_show: 'Did not join', rescheduled: 'Moved', cancelled: 'Cancelled', refunded: 'Returned', expired: 'Hold expired' },
    attention: { hold_expired: 'Chose a time, did not pay', paid_too_late: 'Paid after the hold ran out', did_not_join: 'Did not join', waited_alone: 'Waited, guruji did not sit', waited_and_chose: 'Waited, guruji did not sit', refund_sent: 'Dakshina returned', asked_team: 'Asked to change or cancel, inside four hours' },
    today: {
      title: 'Today', noSittings: 'Guruji has no sittings today.', count: (n: number, open: number) => `${n} ${n === 1 ? 'sitting' : 'sittings'} · ${open} open`,
      nextSitting: 'Next sitting', nowSitting: 'Now', wishes: 'Wishes to speak about', voiceNote: 'has sent a voice note', firstTime: 'First time', visit: (n: number) => `${n}${n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} visit`,
      tellGuru: 'Tell guruji', told: 'Guruji has a note on his WhatsApp.', open: 'Open', nothingNeeds: 'Nothing to do right now.',
      needsOne: 'One thing to do', needsMany: (n: number) => `${n} things to do`, sendLinkAgain: 'Send the link again', decide: 'Decide',
      cannotSit: 'Guruji cannot sit today', sittings: "Today's sittings", time: 'Time', who: 'Who', state: 'State', openSlot: 'open', bookIt: 'book',
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
      days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], his: 'his', rest: 'afternoon — rest', closed: 'closed', noSittings: 'no sittings', open: 'open', bookIt: 'open · book',
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
      doneNotDelivered: (name: string, time: string) => `${name} is booked for ${time}, but WhatsApp could not reach her. Call her with the time.`,
    },
    drawer: {
      close: 'Close', opening: 'Opening the booking', booking: 'Booking', note: 'A note to her, in the room or on WhatsApp', send: 'Send', pickTime: 'Pick a time', move: 'Move her',
      cancelKeep: 'Cancel and return the dakshina', refund: 'Return the dakshina', noShow: 'Did not join', sendLink: 'Hold again and send the link', paidCash: 'Paid in cash', paidUpi: 'Paid by UPI to the ashram', tellGuru: 'Tell guruji',
      phone: 'Phone', forWhom: 'For', askedAbout: 'Asked about', dakshina: 'Dakshina', notPaid: 'not paid', voiceNote: 'a voice note, for guruji alone', nothingYet: 'nothing yet',
      openedLink: 'Opened link', moved: 'Moved', fromEarlier: 'from an earlier time', edit: 'Edit name or who it is for', money: 'Money', said: 'What was said', us: 'US', her: 'HER', otherTimes: 'Her other times',
      byCredit: 'by credit', notDelivered: 'NOT DELIVERED', save: 'Save', herName: 'Her name', whoFor: 'Who the time is for',
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
    },
    login: { title: 'Samvad · team console', hint: 'One login for the whole team.', username: 'Username', password: 'Password', signIn: 'Sign in' },
    common: { loading: 'One moment.', call: 'Call' },
  },
  hi: {
    product: 'संवाद',
    nav: { today: 'आज', week: 'सप्ताह', calendar: 'कैलेंडर', devotees: 'भक्त', more: 'और', money: 'दक्षिणा', settings: 'सेटिंग', newBooking: 'नई बुकिंग', newBookingShort: 'बुकिंग', search: 'नाम या नंबर से खोजें', signOut: 'साइन आउट', language: 'English' },
    state: { confirmed: 'दक्षिणा मिली', held: 'भुगतान बाकी', completed: 'हो गया', no_show: 'नहीं आए', rescheduled: 'समय बदला', cancelled: 'रद्द', refunded: 'दक्षिणा लौटाई', expired: 'समय छूटा' },
    attention: { hold_expired: 'समय चुना, भुगतान नहीं किया', paid_too_late: 'समय छूटने के बाद भुगतान किया', did_not_join: 'नहीं आए', waited_alone: 'इंतज़ार किया, गुरुजी नहीं बैठे', waited_and_chose: 'इंतज़ार किया, गुरुजी नहीं बैठे', refund_sent: 'दक्षिणा लौटाई', asked_team: 'चार घंटे के भीतर समय बदलने या रद्द करने को कहा' },
    today: {
      title: 'आज', noSittings: 'आज गुरुजी की कोई बैठक नहीं है।', count: (n: number, open: number) => `${n} बैठकें · ${open} खाली`,
      nextSitting: 'अगली बैठक', nowSitting: 'अभी', wishes: 'बात करना चाहते हैं', voiceNote: 'आवाज़ का संदेश भेजा है', firstTime: 'पहली बार', visit: (n: number) => `${n}वीं बार`,
      tellGuru: 'गुरुजी को बताएँ', told: 'गुरुजी के व्हाट्सऐप पर संदेश चला गया।', open: 'खोलें', nothingNeeds: 'अभी कुछ करने को नहीं है।',
      needsOne: 'एक काम बाकी', needsMany: (n: number) => `${n} काम बाकी`, sendLinkAgain: 'लिंक फिर भेजें', decide: 'तय करें',
      cannotSit: 'आज गुरुजी नहीं बैठेंगे', sittings: 'आज की बैठकें', time: 'समय', who: 'कौन', state: 'स्थिति', openSlot: 'खाली', bookIt: 'बुक करें',
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
      days: ['सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि', 'रवि'], his: 'गुरुजी', rest: 'दोपहर — विश्राम', closed: 'बंद', noSittings: 'बैठक नहीं', open: 'खाली', bookIt: 'खाली · बुक करें',
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
      doneNotDelivered: (name: string, time: string) => `${name} की ${time} की बुकिंग पक्की, पर व्हाट्सऐप उन तक नहीं पहुँचा। उन्हें कॉल करके समय बताएँ।`,
    },
    drawer: {
      close: 'बंद करें', opening: 'बुकिंग खुल रही है', booking: 'बुकिंग', note: 'उनके लिए संदेश, कक्ष में या व्हाट्सऐप पर', send: 'भेजें', pickTime: 'समय चुनें', move: 'समय बदलें',
      cancelKeep: 'रद्द करें, दक्षिणा लौटाएँ', refund: 'दक्षिणा लौटाएँ', noShow: 'नहीं आए', sendLink: 'फिर रोकें और लिंक भेजें', paidCash: 'नकद मिला', paidUpi: 'आश्रम को UPI मिला', tellGuru: 'गुरुजी को बताएँ',
      phone: 'फ़ोन', forWhom: 'किसके लिए', askedAbout: 'प्रश्न', dakshina: 'दक्षिणा', notPaid: 'भुगतान नहीं', voiceNote: 'आवाज़ का संदेश, सिर्फ़ गुरुजी के लिए', nothingYet: 'अभी कुछ नहीं',
      openedLink: 'लिंक खोला', moved: 'समय बदला', fromEarlier: 'पहले के समय से', edit: 'नाम या किसके लिए, बदलें', money: 'दक्षिणा', said: 'बातचीत', us: 'हम', her: 'वे', otherTimes: 'उनकी अन्य बैठकें',
      byCredit: 'जमा दक्षिणा से', notDelivered: 'नहीं पहुँचा', save: 'सहेजें', herName: 'उनका नाम', whoFor: 'किसके लिए',
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
    },
    login: { title: 'संवाद · टीम कंसोल', hint: 'पूरी टीम के लिए एक लॉगिन।', username: 'यूज़रनेम', password: 'पासवर्ड', signIn: 'साइन इन' },
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
