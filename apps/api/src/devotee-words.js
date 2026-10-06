// Every sentence a devotee receives on WhatsApp, and the few guruji receives, in English and in
// plain Hindi. The guru's team chooses the language once (Settings → His website); everything the
// doors, the reminders and the console send follows it. Pure: no database, no network.
//
// Rules from CLAUDE.md: "dakshina" not fee, "time" not appointment, no exclamation marks, plain
// sentences. Hindi uses आप throughout and the same words the console uses.

import { describeSlot as describeSlotEn, parseSlotId, formatTime } from '@expert-sessions/shared';
import { HOLD_MINUTES } from './bookings.js';

const DAYS_HI = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];
const MONTHS_HI = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
const SHORT_DAYS = { Sun: 'रवि', Mon: 'सोम', Tue: 'मंगल', Wed: 'बुध', Thu: 'गुरु', Fri: 'शुक्र', Sat: 'शनि', Today: 'आज', Tomorrow: 'कल' };

/** "Wednesday, 30 September, 4:10 pm" or "बुधवार, 30 सितंबर, 4:10 pm". */
export function describeSlot(slotId, lang = 'en') {
  if (lang !== 'hi') return describeSlotEn(slotId);
  const d = parseSlotId(slotId);
  return `${DAYS_HI[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_HI[d.getUTCMonth()]}, ${formatTime(d)}`;
}

/** A slot button's label: "Today 4:10 pm" → "आज 4:10 pm". */
export function slotLabel(label, lang = 'en') {
  if (lang !== 'hi') return label;
  const [day, ...rest] = label.split(' ');
  return `${SHORT_DAYS[day] ?? day} ${rest.join(' ')}`;
}

const REFUND_DAYS = '5 to 7 working days';
const REFUND_DAYS_HI = '5 से 7 कार्य दिवसों';

const EN = {
  held: ({ guruName, slotId, dakshina }) =>
    `${describeSlotEn(slotId)} with ${guruName}.\nDakshina ${dakshina}.\n\nThis time is held for you for ${HOLD_MINUTES} minutes.`,
  confirmed: ({ guruName, slotId }) =>
    `Your time is confirmed.\n${describeSlotEn(slotId)} with ${guruName}.\n\nOpen this link to see your booking. To change or cancel the time, write Hi here. The join link comes here ten minutes before your time.`,
  confirmedSoon: ({ guruName, slotId }) =>
    `Your time is confirmed.\n${describeSlotEn(slotId)} with ${guruName}.\n\nIt begins in a few minutes. Open this link when you are ready.`,
  askQuestion: ({ guruName }) =>
    `If you wish, tell ${guruName} what you seek guidance on — type it here, or send a voice note. Only he will hear it.`,
  moved: ({ guruName, slotId }) =>
    `Your time with ${guruName} has moved to ${describeSlotEn(slotId)}. Your dakshina moves with it.\n\nOpen this link to see your booking.`,
  refunded: ({ guruName, slotId, dakshina }) =>
    `${guruName} could not sit at ${describeSlotEn(slotId)}. Your dakshina of ${dakshina} is on its way back to you and reaches you within a week.`,
  cancelled: ({ guruName, slotId, dakshina }) =>
    `Your time with ${guruName} on ${describeSlotEn(slotId)} is cancelled. Your dakshina of ${dakshina} is on its way back and reaches your account in ${REFUND_DAYS}.`,
  cancelledByHand: ({ guruName, slotId, dakshina }) =>
    `Your time with ${guruName} on ${describeSlotEn(slotId)} is cancelled. His team will return your dakshina of ${dakshina} to you directly.`,
  cancelledFree: ({ guruName, slotId }) =>
    `Your time with ${guruName} on ${describeSlotEn(slotId)} is cancelled. There was no dakshina to return.`,
  cancelledCredit: ({ guruName, slotId, dakshina }) =>
    `Your time with ${guruName} on ${describeSlotEn(slotId)} is cancelled. Your credit of ${dakshina} is back with you for thirty days.`,
  // her booking, when she writes Hi with a time ahead
  myBooking: ({ guruName, slotId, minutes }) =>
    `Your time with ${guruName}: ${describeSlotEn(slotId)}, ${minutes} minutes.\n\nWhat would you like to do?`,
  changeTime: 'Change the time',
  cancelIt: 'Cancel',
  newBooking: 'Book another',
  chooseNewTime: 'Choose the new time. Your dakshina moves with it.',
  confirmCancel: ({ slotId, dakshina }) =>
    `Cancel your time on ${describeSlotEn(slotId)}?\n\nYour dakshina of ${dakshina} comes back to your account in ${REFUND_DAYS}.`,
  confirmCancelByHand: ({ slotId, dakshina }) =>
    `Cancel your time on ${describeSlotEn(slotId)}?\n\nHis team will return your dakshina of ${dakshina} to you directly.`,
  confirmCancelFree: ({ slotId }) => `Cancel your time on ${describeSlotEn(slotId)}?`,
  yesCancel: 'Yes, cancel it',
  keepIt: 'No, keep it',
  kept: 'Your time stays as it is.',
  cannotChange: ({ reason }) => `${reason}\n\nShall we ask his team to call you?`,
  tellTeam: 'Yes, tell the team',
  teamWillCall: ({ guruName }) => `Noted. ${guruName}'s team will get in touch with you.`,
  paidTooLate: ({ guruName, slotId, dakshina }) =>
    `Your dakshina of ${dakshina} reached us, but the time you chose — ${describeSlotEn(slotId)} — was released before it arrived, so nothing is booked.\n\n${guruName}'s team will return your dakshina within a week, or find you another time. They will message you.`,
  stillToPay: ({ slotId, dakshina }) =>
    `Your time is still held — ${describeSlotEn(slotId)}.\n\nThe dakshina is ${dakshina}. Open this to pay, and the time is yours.`,
  heardAfterSession: ({ guruName }) =>
    `Thank you. ${guruName}'s team will read this.\n\nIf you would like another time, send Hi and they will be offered.`,
  noTimes: ({ guruName }) =>
    `Namaste 🙏 ${guruName} has no open times this week. Please send Hi again in a few days.`,
  slotTaken: () => 'That time was just taken. Here are the next ones:',
  paymentUnavailable: () => 'The payment page could not be opened just now, so nothing is booked. Please send Hi again in a few minutes, or write to his team.',
  refundedByHand: ({ guruName, slotId, dakshina }) =>
    `${guruName} could not sit at ${describeSlotEn(slotId)}. His team will return your dakshina of ${dakshina} to you directly.`,
  refundedAsCredit: ({ guruName, slotId, dakshina }) =>
    `${guruName} could not sit at ${describeSlotEn(slotId)}. Your dakshina of ${dakshina} is back in your credit — book any other time with it within thirty days.`,
  // the door
  greeting: ({ guruName, minutes, dakshina }) =>
    `Namaste 🙏\nBook time with ${guruName} — ${minutes} minutes, dakshina ${dakshina}.\nNext available:`,
  chooseType: ({ guruName }) => `Namaste 🙏\nBook time with ${guruName}. How long would you like?`,
  otherTimes: 'Other times',
  chooseTime: 'Choose a time that suits you.',
  seeTimes: 'See times',
  received: ({ guruName }) => `Received. ${guruName} will hear this before your session.`,
  noted: ({ guruName }) => `Noted. ${guruName} will read this before your session.`,
  // buttons
  pay: ({ dakshina }) => `Pay ${dakshina}`,
  payTheDakshina: 'Pay the dakshina',
  seeBooking: 'See my booking',
  joinNow: 'Join now',
  // reminders
  night: ({ guruName, slotId }) =>
    `A reminder: your time with ${guruName} is tomorrow, ${describeSlotEn(slotId).split(', ').slice(1).join(', ')}.\n\nYour booking is at this link. The join link comes ten minutes before your time.`,
  soon: ({ guruName }) =>
    `Your time with ${guruName} begins in about ten minutes. Open this link when you are ready.`,
  // to guruji
  guruSoon: ({ devoteeName, time, question }) =>
    `In ten minutes: ${devoteeName} at ${time}.${question ? `\n\nShe wishes to speak about: ${question}` : ''}\n\nOpen your day to join.`,
  guruNow: ({ devoteeName, time, question }) =>
    `${devoteeName} is booked for ${time}.${question ? `\n\nShe wishes to speak about: ${question}` : ''}\n\nYour team sent this note.`,
  // the console's one-tap notes to someone waiting
  oneTap: ['Joining in 5 minutes', 'Joining in 10 minutes', 'Would another time suit you?'],
};

const HI = {
  held: ({ guruName, slotId, dakshina }) =>
    `${describeSlot(slotId, 'hi')} — ${guruName} के साथ।\nदक्षिणा ${dakshina}।\n\nयह समय आपके लिए ${HOLD_MINUTES} मिनट तक रोका गया है।`,
  confirmed: ({ guruName, slotId }) =>
    `आपका समय पक्का हो गया।\n${describeSlot(slotId, 'hi')} — ${guruName} के साथ।\n\nअपनी बुकिंग देखने के लिए यह लिंक खोलें। समय बदलने या रद्द करने के लिए यहीं Hi लिखें। जुड़ने का लिंक आपके समय से दस मिनट पहले यहीं आएगा।`,
  confirmedSoon: ({ guruName, slotId }) =>
    `आपका समय पक्का हो गया।\n${describeSlot(slotId, 'hi')} — ${guruName} के साथ।\n\nयह कुछ ही मिनट में शुरू होगा। तैयार हों तो यह लिंक खोलें।`,
  askQuestion: ({ guruName }) =>
    `अगर आप चाहें, तो ${guruName} को बताएँ कि आप किस बारे में मार्गदर्शन चाहते हैं — यहीं लिखें, या आवाज़ का संदेश भेजें। इसे सिर्फ़ वही सुनेंगे।`,
  moved: ({ guruName, slotId }) =>
    `${guruName} के साथ आपका समय अब ${describeSlot(slotId, 'hi')} है। आपकी दक्षिणा इसी समय के साथ है।\n\nअपनी बुकिंग देखने के लिए यह लिंक खोलें।`,
  refunded: ({ guruName, slotId, dakshina }) =>
    `${guruName} ${describeSlot(slotId, 'hi')} को नहीं बैठ सके। आपकी ${dakshina} की दक्षिणा वापस भेज दी गई है; यह एक सप्ताह में आपके खाते में आ जाएगी।`,
  cancelled: ({ guruName, slotId, dakshina }) =>
    `${describeSlot(slotId, 'hi')} का ${guruName} के साथ आपका समय रद्द हो गया। आपकी ${dakshina} की दक्षिणा वापस भेज दी गई है; यह ${REFUND_DAYS_HI} में आपके खाते में आ जाएगी।`,
  cancelledByHand: ({ guruName, slotId, dakshina }) =>
    `${describeSlot(slotId, 'hi')} का ${guruName} के साथ आपका समय रद्द हो गया। उनकी टीम आपकी ${dakshina} की दक्षिणा सीधे आपको लौटा देगी।`,
  cancelledFree: ({ guruName, slotId }) =>
    `${describeSlot(slotId, 'hi')} का ${guruName} के साथ आपका समय रद्द हो गया। कोई दक्षिणा लौटानी नहीं थी।`,
  cancelledCredit: ({ guruName, slotId, dakshina }) =>
    `${describeSlot(slotId, 'hi')} का ${guruName} के साथ आपका समय रद्द हो गया। आपकी ${dakshina} की जमा दक्षिणा तीस दिन के लिए फिर आपके पास है।`,
  myBooking: ({ guruName, slotId, minutes }) =>
    `${guruName} के साथ आपका समय: ${describeSlot(slotId, 'hi')}, ${minutes} मिनट।\n\nआप क्या करना चाहेंगे?`,
  changeTime: 'समय बदलें',
  cancelIt: 'रद्द करें',
  newBooking: 'नई बुकिंग',
  chooseNewTime: 'नया समय चुनें। आपकी दक्षिणा उसी के साथ चली जाएगी।',
  confirmCancel: ({ slotId, dakshina }) =>
    `${describeSlot(slotId, 'hi')} का समय रद्द करें?\n\nआपकी ${dakshina} की दक्षिणा ${REFUND_DAYS_HI} में आपके खाते में वापस आ जाएगी।`,
  confirmCancelByHand: ({ slotId, dakshina }) =>
    `${describeSlot(slotId, 'hi')} का समय रद्द करें?\n\nउनकी टीम आपकी ${dakshina} की दक्षिणा सीधे आपको लौटा देगी।`,
  confirmCancelFree: ({ slotId }) => `${describeSlot(slotId, 'hi')} का समय रद्द करें?`,
  yesCancel: 'हाँ, रद्द करें',
  keepIt: 'नहीं, रहने दें',
  kept: 'आपका समय वैसा ही है।',
  cannotChange: ({ reason }) => `${reason}\n\nक्या हम उनकी टीम से आपको कॉल करवाएँ?`,
  tellTeam: 'हाँ, टीम को बताएँ',
  teamWillCall: ({ guruName }) => `लिख लिया। ${guruName} की टीम आपसे संपर्क करेगी।`,
  paidTooLate: ({ guruName, slotId, dakshina }) =>
    `आपकी ${dakshina} की दक्षिणा हमें मिली, पर आपका चुना हुआ समय — ${describeSlot(slotId, 'hi')} — उससे पहले ही छूट गया, इसलिए अभी कुछ बुक नहीं है।\n\n${guruName} की टीम एक सप्ताह में दक्षिणा लौटा देगी, या आपको दूसरा समय देगी। वे आपको संदेश करेंगे।`,
  stillToPay: ({ slotId, dakshina }) =>
    `आपका समय अभी भी रोका हुआ है — ${describeSlot(slotId, 'hi')}।\n\nदक्षिणा ${dakshina} है। भुगतान के लिए यह खोलें, और यह समय आपका है।`,
  heardAfterSession: ({ guruName }) =>
    `धन्यवाद। ${guruName} की टीम इसे पढ़ेगी।\n\nअगर आप दूसरा समय चाहें, तो Hi भेजें।`,
  noTimes: ({ guruName }) =>
    `नमस्ते 🙏 इस सप्ताह ${guruName} का कोई समय खाली नहीं है। कृपया कुछ दिनों बाद फिर Hi भेजें।`,
  slotTaken: () => 'वह समय अभी-अभी किसी और ने ले लिया। ये अगले समय हैं:',
  paymentUnavailable: () => 'भुगतान का पेज अभी नहीं खुल सका, इसलिए कुछ बुक नहीं हुआ। कृपया कुछ मिनट बाद फिर Hi भेजें, या उनकी टीम को लिखें।',
  refundedByHand: ({ guruName, slotId, dakshina }) =>
    `${guruName} ${describeSlot(slotId, 'hi')} को नहीं बैठ सके। उनकी टीम आपकी ${dakshina} की दक्षिणा सीधे आपको लौटा देगी।`,
  refundedAsCredit: ({ guruName, slotId, dakshina }) =>
    `${guruName} ${describeSlot(slotId, 'hi')} को नहीं बैठ सके। आपकी ${dakshina} की दक्षिणा फिर से आपके जमा में है — तीस दिन के भीतर कोई भी समय बुक कर लें।`,
  greeting: ({ guruName, minutes, dakshina }) =>
    `नमस्ते 🙏\n${guruName} के साथ समय बुक करें — ${minutes} मिनट, दक्षिणा ${dakshina}।\nअगला खाली समय:`,
  chooseType: ({ guruName }) => `नमस्ते 🙏\n${guruName} के साथ समय बुक करें। कितना समय चाहिए?`,
  otherTimes: 'और समय',
  chooseTime: 'अपने लिए समय चुनें।',
  seeTimes: 'समय देखें',
  received: ({ guruName }) => `मिल गया। ${guruName} आपके समय से पहले इसे सुनेंगे।`,
  noted: ({ guruName }) => `लिख लिया। ${guruName} आपके समय से पहले इसे पढ़ेंगे।`,
  pay: ({ dakshina }) => `${dakshina} दें`,
  payTheDakshina: 'दक्षिणा दें',
  seeBooking: 'बुकिंग देखें',
  joinNow: 'अभी जुड़ें',
  night: ({ guruName, slotId }) =>
    `याद दिलाना: ${guruName} के साथ आपका समय कल है, ${describeSlot(slotId, 'hi').split(', ').slice(1).join(', ')}।\n\nआपकी बुकिंग इस लिंक पर है। जुड़ने का लिंक समय से दस मिनट पहले आएगा।`,
  soon: ({ guruName }) =>
    `${guruName} के साथ आपका समय लगभग दस मिनट में शुरू होगा। तैयार हों तो यह लिंक खोलें।`,
  guruSoon: ({ devoteeName, time, question }) =>
    `दस मिनट में: ${devoteeName}, ${time}।${question ? `\n\nवे इस बारे में बात करना चाहते हैं: ${question}` : ''}\n\nजुड़ने के लिए अपना दिन खोलें।`,
  guruNow: ({ devoteeName, time, question }) =>
    `${devoteeName} की बैठक ${time} को है।${question ? `\n\nवे इस बारे में बात करना चाहते हैं: ${question}` : ''}\n\nयह संदेश आपकी टीम ने भेजा है।`,
  oneTap: ['5 मिनट में जुड़ रहे हैं', '10 मिनट में जुड़ रहे हैं', 'क्या दूसरा समय ठीक रहेगा?'],
};

export const LANGUAGES = ['en', 'hi'];

/** The words for a guru's chosen language. Anything but 'hi' is English. */
export function wordsFor(lang) {
  return lang === 'hi' ? HI : EN;
}
