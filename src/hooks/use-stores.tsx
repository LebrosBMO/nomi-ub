import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { useNomi } from '@/hooks/use-nomi';
import { emptyBoxes, type BoxStore } from '@/utils/boxes';
import { loadBoxes, saveBoxes as writeBoxes } from '@/utils/boxes-storage';
import { emptyPayments, type PaymentStore } from '@/utils/payments';
import { loadPayments, savePayments as writePayments } from '@/utils/payments-storage';
import { emptyPersonal, type PersonalState } from '@/utils/personal';
import { loadPersonal, savePersonal as writePersonal } from '@/utils/personal-storage';
import { emptyReminders, type ReminderStore } from '@/utils/reminders';
import { loadReminders, saveReminders as writeReminders } from '@/utils/reminders-storage';

/**
 * The three stores the user owns — tasks and memories, reminders, monthly payments — in one place, because two screens now read
 * them: the chat (Section 11-13, 19) and the personal helper tab (Section 20). Both the live values, for rendering, and a ref
 * with the same contents, for the chat's async request flow, where a value captured by a closure would go stale.
 *
 * `save*` writes to the device and then updates both; `set*` only updates them, for a store `understand()` has already saved.
 */
export type Stores = {
  /** False until the three stores have loaded; nothing may be read or written before that. */
  ready: boolean;
  personal: PersonalState;
  reminders: ReminderStore;
  payments: PaymentStore;
  /** The user's own boxes (Section 21): spending today. */
  boxes: BoxStore;
  /** The same stores behind a ref, for code that must not capture a render's copy (the chat's async request flow). */
  ref: { current: { personal: PersonalState; reminders: ReminderStore; payments: PaymentStore; boxes: BoxStore } };
  setPersonal: (next: PersonalState) => void;
  setReminders: (next: ReminderStore) => void;
  setPayments: (next: PaymentStore) => void;
  setBoxes: (next: BoxStore) => void;
  savePersonal: (next: PersonalState) => Promise<void>;
  saveReminders: (next: ReminderStore) => Promise<void>;
  savePayments: (next: PaymentStore) => Promise<void>;
  saveBoxes: (next: BoxStore) => Promise<void>;
  /** Set when the load failed; the screens show it instead of pretending the user has nothing. */
  loadFailed: boolean;
};

const StoresContext = createContext<Stores | null>(null);

export function StoresProvider({ children }: { children: ReactNode }) {
  const { dataEpoch } = useNomi();
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [personal, setPersonalState] = useState<PersonalState>(emptyPersonal);
  const [reminders, setRemindersState] = useState<ReminderStore>(emptyReminders);
  const [payments, setPaymentsState] = useState<PaymentStore>(emptyPayments);
  const [boxes, setBoxesState] = useState<BoxStore>(emptyBoxes);
  const current = useRef({ personal: emptyPersonal(), reminders: emptyReminders(), payments: emptyPayments(), boxes: emptyBoxes() });

  // Again after "delete my data": whatever was held goes with it, then the empty stores are read back.
  useEffect(() => {
    if (dataEpoch > 0) {
      current.current = { personal: emptyPersonal(), reminders: emptyReminders(), payments: emptyPayments(), boxes: emptyBoxes() };
      setPersonalState(current.current.personal);
      setRemindersState(current.current.reminders);
      setPaymentsState(current.current.payments);
      setBoxesState(current.current.boxes);
    }
    let live = true;
    setLoadFailed(false);
    Promise.all([loadPersonal(), loadReminders(), loadPayments(), loadBoxes()])
      .then(([tasks, alarms, bills, logs]) => {
        if (!live) return;
        current.current = { personal: tasks, reminders: alarms, payments: bills, boxes: logs };
        setPersonalState(tasks);
        setRemindersState(alarms);
        setPaymentsState(bills);
        setBoxesState(logs);
        setReady(true);
      })
      .catch(() => {
        if (live) setLoadFailed(true);
      });
    return () => {
      live = false;
    };
  }, [dataEpoch]);

  const value: Stores = {
    ready,
    personal,
    reminders,
    payments,
    boxes,
    ref: current,
    setPersonal(next) {
      current.current = { ...current.current, personal: next };
      setPersonalState(next);
    },
    setReminders(next) {
      current.current = { ...current.current, reminders: next };
      setRemindersState(next);
    },
    setPayments(next) {
      current.current = { ...current.current, payments: next };
      setPaymentsState(next);
    },
    setBoxes(next) {
      current.current = { ...current.current, boxes: next };
      setBoxesState(next);
    },
    // Nothing is shown as saved until the write has succeeded; a rejection reaches the caller, which says so.
    async savePersonal(next) {
      await writePersonal(next);
      value.setPersonal(next);
    },
    async saveReminders(next) {
      await writeReminders(next);
      value.setReminders(next);
    },
    async savePayments(next) {
      await writePayments(next);
      value.setPayments(next);
    },
    async saveBoxes(next) {
      await writeBoxes(next);
      value.setBoxes(next);
    },
    loadFailed,
  };

  return <StoresContext.Provider value={value}>{children}</StoresContext.Provider>;
}

export function useStores() {
  const value = useContext(StoresContext);
  if (!value) throw new Error('useStores must be used inside StoresProvider');
  return value;
}
