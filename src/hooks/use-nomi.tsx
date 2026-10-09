import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { addActivity, emptyActivity, type ActivityEntry, type ActivityStore } from '@/utils/activity';
import { loadActivity, saveActivity } from '@/utils/activity-storage';
import {
  answeredToday,
  answerFollowup,
  deferFollowup,
  emptyFollowups,
  planFollowup,
  withCall,
  type FollowupChoice,
  type FollowupStore,
  type FollowupTrigger,
  type PendingFollowup,
} from '@/utils/followups';
import { loadFollowups, saveFollowups } from '@/utils/followups-storage';
import { configureEvents } from '@/utils/events';
import { needsTerms } from '@/utils/legal';
import { chatExpired, MESSAGE_CAP, restoreMessages, storedMessage, type Message } from '@/utils/messages';
import { placeById } from '@/utils/places';
import { addReport, emptyReports, type ReportDraft, type ReportStore } from '@/utils/reports';
import { loadReports, saveReports } from '@/utils/reports-storage';
import { emptyState, type LocalState } from '@/utils/storage';
import { deleteDeviceData, installKeys, loadState, saveState } from '@/utils/storage-device';
import { addUsage, emptyUsage, todayUsage, type DailyUsage, type ServerDaily, type TokenUsage } from '@/utils/usage';
import { loadUsage, saveUsage } from '@/utils/usage-storage';

export type { Message };

type NomiState = {
  ready: boolean;
  messages: Message[];
  /** Ids created in this session. Only these animate in; restored history appears instantly. */
  fresh: ReadonlySet<string>;
  addMessage: (message: Omit<Message, 'id'>) => void;
  clearMessages: () => void;
  settings: LocalState;
  saveSettings: (next: LocalState) => Promise<void>;
  usage: DailyUsage;
  recordUsage: (add: { ai: boolean; tokens?: TokenUsage; server?: ServerDaily }) => void;
  notice: string;
  setNotice: (notice: string) => void;
  /** True for the whole of the launch in which `onboardedAt` was first written, and again after "delete my data". */
  firstLaunch: boolean;
  /** The AI disclosure was offered or refused this session (Section 8), so the chat does not offer it again until the next launch. */
  consentAsked: boolean;
  markConsentAsked: () => void;
  /** Goes up by one after "delete my data": the chat reloads its own stores and drops anything still in flight. */
  dataEpoch: number;
  /**
   * "Миний өгөгдлийг устгах": cancels every scheduled notification, removes the secure token and every `nomi:` key, and resets
   * everything held in memory so the app is back at the first-launch welcome. Rejects when part of the deletion failed.
   */
  deleteAllData: () => Promise<void>;
  /** Every action Nomi took on the user's behalf, ids and counts only (Section 10). */
  activity: ActivityStore;
  recordActivity: (entry: ActivityEntry) => void;
  /** "Мэдээлэл буруу" reports kept on this device (Section 6). */
  reports: ReportStore;
  /** Saves a report, then its activity entry. Resolves false when the same place and reason was reported inside 24 hours; rejects when the save failed. */
  saveReport: (draft: Omit<ReportDraft, 'appVersion'>) => Promise<boolean>;
  /** A call tap on a card, once the dialer opened (Section 14): queues the follow-up question, unless this place was answered today. */
  recordCall: (placeId: string) => void;
  /** The one follow-up due on this trigger, marked as asked, or null. The chat posts its question and the answers. */
  takeFollowup: (trigger: FollowupTrigger) => PendingFollowup | null;
  /** Stores the tapped answer as feedback (`kind: 'followup'`, Section 6) with its activity entry and resolves with Nomi's reply; rejects when the save failed. */
  saveFollowupAnswer: (placeId: string, choice: FollowupChoice) => Promise<string>;
  /** A question left unanswered counts as "Дараа", without an outcome. */
  dismissFollowup: (placeId: string) => void;
};

const CHAT_KEY = 'nomi:chat:v1';
const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
const NomiContext = createContext<NomiState | null>(null);
let writing: Promise<void> = Promise.resolve();
let sequence = 0;

export function NomiProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const [settings, setSettings] = useState<LocalState>(emptyState);
  const [usage, setUsage] = useState<DailyUsage>(emptyUsage);
  const [notice, setNotice] = useState('');
  const [firstLaunch, setFirstLaunch] = useState(false);
  const [consentAsked, setConsentAsked] = useState(false);
  const [dataEpoch, setDataEpoch] = useState(0);
  const [activity, setActivity] = useState<ActivityStore>(emptyActivity);
  const [reports, setReports] = useState<ReportStore>(emptyReports);
  const usageRef = useRef(emptyUsage());
  const activityRef = useRef(emptyActivity());
  const reportsRef = useRef(emptyReports());
  /** Calls waiting for their follow-up question (Section 14). Nothing renders it, so it lives in the ref alone. */
  const followupsRef = useRef(emptyFollowups());

  useEffect(() => {
    Promise.all([
      loadState(),
      AsyncStorage.getItem(CHAT_KEY),
      loadUsage().catch(() => emptyUsage()),
      // A damaged history, report or follow-up store starts over rather than blocking the app.
      loadActivity().catch(() => emptyActivity()),
      loadReports().catch(() => emptyReports()),
      loadFollowups().catch(() => emptyFollowups()),
    ])
      .then(([state, raw, today, history, reported, followups]) => {
        usageRef.current = today;
        setUsage(today);
        activityRef.current = history;
        setActivity(history);
        reportsRef.current = reported;
        setReports(reported);
        followupsRef.current = followups;
        if (state.onboardedAt) {
          setSettings(state);
        } else {
          // First launch: remember it so the welcome principles show only once. A failed write just shows them again next time.
          const onboarded = { ...state, onboardedAt: new Date().toISOString() };
          setFirstLaunch(true);
          setSettings(onboarded);
          saveState(onboarded).catch(() => {});
        }
        // A conversation left over 2 hours ago is put away: the app opens on a fresh chat (Section 20).
        const restored = restoreMessages(raw);
        setMessages(chatExpired(restored) ? [] : restored);
      })
      .catch(() => setNotice('Өмнөх яриаг уншиж чадсангүй.'))
      .finally(() => {
        setReady(true);
        SplashScreen.hide();
      });
  }, []);

  useEffect(() => {
    if (!ready) return;
    // Distances from a located search are dropped here: the position never reaches storage (Section 7).
    const raw = JSON.stringify(messages.slice(-MESSAGE_CAP).map(storedMessage));
    // An empty conversation ("Шинэ яриа", "delete my data") leaves no key behind.
    writing = writing.catch(() => {}).then(() => (messages.length ? AsyncStorage.setItem(CHAT_KEY, raw) : AsyncStorage.removeItem(CHAT_KEY)));
    writing.catch(() => setNotice('Яриаг хадгалж чадсангүй.'));
  }, [messages, ready]);

  // The anonymous counters the place card sends (src/utils/events.ts) start only once the terms have been accepted, since the
  // Privacy Policy is where they are stated, and stop again after "delete my data".
  useEffect(() => {
    configureEvents(ready && !needsTerms(settings) ? { keys: installKeys } : null);
  }, [ready, settings]);

  function recordActivity(entry: ActivityEntry) {
    activityRef.current = addActivity(activityRef.current, entry);
    setActivity(activityRef.current);
    saveActivity(activityRef.current).catch(() => {});
  }

  /** Keeps the follow-up store when the planner changed it. A failed write only costs a question; nothing depends on it. */
  function keepFollowups(next: FollowupStore) {
    if (next === followupsRef.current) return;
    followupsRef.current = next;
    saveFollowups(next).catch(() => {});
  }

  const value: NomiState = {
    ready,
    messages,
    fresh,
    addMessage(message) {
      const id = `${Date.now().toString(36)}-${sequence++}`;
      setFresh((old) => new Set(old).add(id));
      setMessages((old) => [...old, { id, at: new Date().toISOString(), ...message }]);
    },
    clearMessages() {
      setMessages([]);
      setNotice('');
    },
    settings,
    async saveSettings(next) {
      await saveState(next);
      setSettings(next);
    },
    usage: todayUsage(usage),
    recordUsage(add) {
      usageRef.current = addUsage(usageRef.current, add);
      setUsage(usageRef.current);
      saveUsage(usageRef.current).catch(() => {});
    },
    notice,
    setNotice,
    firstLaunch,
    consentAsked,
    markConsentAsked() {
      setConsentAsked(true);
    },
    dataEpoch,
    async deleteAllData() {
      // The conversation's last write goes first, so it cannot land after the deletion.
      await writing.catch(() => {});
      try {
        await deleteDeviceData();
      } finally {
        // Nothing deleted stays on screen, even when part of the deletion failed and has to be tried again. No `delete_all` entry is
        // kept either: the user asked for everything to go, and a fresh history would be the first thing written back.
        usageRef.current = emptyUsage();
        setUsage(usageRef.current);
        activityRef.current = emptyActivity();
        setActivity(activityRef.current);
        reportsRef.current = emptyReports();
        setReports(reportsRef.current);
        followupsRef.current = emptyFollowups();
        setMessages([]);
        setFresh(new Set());
        setSettings({ ...emptyState });
        setNotice('');
        setFirstLaunch(true);
        setConsentAsked(false);
        setDataEpoch((epoch) => epoch + 1);
      }
    },
    activity,
    recordActivity,
    reports,
    async saveReport(draft) {
      const { store, report } = addReport(reportsRef.current, { ...draft, appVersion: APP_VERSION });
      if (!report) return false;
      // Nothing is shown as saved until the write has succeeded.
      await saveReports(store);
      reportsRef.current = store;
      setReports(store);
      recordActivity({ kind: 'report', placeId: report.placeId, refId: report.id });
      return true;
    },
    recordCall(placeId) {
      const now = new Date();
      keepFollowups(withCall(followupsRef.current, placeId, now, answeredToday(reportsRef.current.items, now)));
    },
    takeFollowup(trigger) {
      // A place that left the catalog since the call is dropped rather than asked about.
      const plan = planFollowup(followupsRef.current, trigger, new Date(), (id) => Boolean(placeById(id)));
      keepFollowups(plan.store);
      return plan.ask;
    },
    async saveFollowupAnswer(placeId, choice) {
      const now = new Date();
      // The answer is feedback in the reports store; the same answer inside 24 hours is already there (AC 6.3) and is not written again.
      const { store, report } = addReport(reportsRef.current, { kind: 'followup', placeId, outcome: choice, appVersion: APP_VERSION }, now);
      if (report) {
        await saveReports(store);
        reportsRef.current = store;
        setReports(store);
      }
      const answer = answerFollowup(followupsRef.current, placeId, choice);
      keepFollowups(answer.store);
      recordActivity({ kind: 'followup', placeId, ...(report ? { refId: report.id } : {}) });
      return answer.reply;
    },
    dismissFollowup(placeId) {
      keepFollowups(deferFollowup(followupsRef.current, placeId).store);
    },
  };

  return <NomiContext.Provider value={value}>{children}</NomiContext.Provider>;
}

export function useNomi() {
  const value = useContext(NomiContext);
  if (!value) throw new Error('useNomi must be used inside NomiProvider');
  return value;
}
