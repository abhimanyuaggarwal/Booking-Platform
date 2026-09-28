import { createContext, useContext } from 'react';

// One booking, one drawer, from anywhere. Any screen that shows a name calls `useOpenBooking()(id)`
// and the shell opens the same drawer, addressed by `?booking=<id>` so the link can be handed to a
// teammate. Outside the shell (tests, pure views) the default does nothing.
export type OpenBooking = (bookingId: string) => void;
export const OpenBookingContext = createContext<OpenBooking>(() => {});
export function useOpenBooking() {
  return useContext(OpenBookingContext);
}

// The other thing she does while someone is on the phone: hold a time for them. Any open slot on
// any screen can start it with that slot already chosen.
export type BookForCaller = (slotId?: string) => void;
export const BookForCallerContext = createContext<BookForCaller>(() => {});
export function useBookForCaller() {
  return useContext(BookForCallerContext);
}
