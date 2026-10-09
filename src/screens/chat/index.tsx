import { Ionicons } from '@expo/vector-icons';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Thinking } from '@/components/thinking';
import { Colors, MaxContentWidth } from '@/constants/theme';
import { useNomi } from '@/hooks/use-nomi';
import { useStores } from '@/hooks/use-stores';
import { ChoiceChips } from '@/screens/chat/choice-chips';
import { Composer } from '@/screens/chat/composer';
import { MessageView } from '@/screens/chat/message';
import { ResetDialog } from '@/screens/chat/reset-dialog';
import { Welcome } from '@/screens/chat/welcome';
import type { Intent } from '@/utils/core';
import { statusLine } from '@/utils/examples';
import { chatExpired } from '@/utils/messages';
import { tapFeedback } from '@/utils/feedback';
import { FOLLOWUP_CHOICES, FOLLOWUP_SAVE_FAILED, followupQuestion, type FollowupChoice, type FollowupTrigger } from '@/utils/followups';
import { LOCATION_CHOICES, LOCATION_DENIED_LINE, type Coordinates, type LocationChoice, type LocationMode } from '@/utils/location';
import { locateOnce, permissionState } from '@/utils/location-device';
import { notifications, subscribeReminders } from '@/utils/notifications';
import { placeById, places } from '@/utils/places';
import {
  answerReminder,
  attachNotification,
  markFired,
  REMINDER_CHOICES,
  REMINDER_DENIED_LINE,
  REMINDER_FAILED_LINE,
  REMINDER_SET_LINE,
  REMINDER_WEB_LINE,
  reminderQuestion,
  type ReminderChoice,
} from '@/utils/reminders';
import { reportedPlaces } from '@/utils/reports';
import { aiStatus } from '@/utils/storage';
import { installKeys } from '@/utils/storage-device';
import { assistantFor, CONSENT_CHOICES, MESSAGE_LIMIT, understand, type ConsentChoice, type Understanding } from '@/utils/understand';

const FAILED =
  'Хүсэлтийг гүйцэтгэж чадсангүй. Хадгалалт эсвэл холболтын алдаа гарлаа. “Миний ажлууд” эсвэл “Миний санамжууд” гэж шалгаад дахин оролдоорой.';

/**
 * Nomi's last question, answered with buttons: a nearby request waiting for the answer to the location question, a reminder
 * whose notification was tapped (Section 13), the follow-up after a call (Section 14), or the offer to open the AI disclosure
 * after an offline answer (Section 8). Only in this screen: a restart drops it and the user simply asks again (a follow-up comes
 * back on the next trigger by itself).
 */
type Pending =
  | { kind: 'location'; text: string; intent: Intent }
  | { kind: 'reminder'; id: string }
  | { kind: 'followup'; placeId: string }
  | { kind: 'consent' };
/** This session's answer about the phone's position: at most one system prompt per launch, and none after a refusal (Section 7). */
type SessionLocation = 'unasked' | 'granted' | 'declined';

export function Chat() {
  const {
    ready,
    messages,
    fresh,
    addMessage,
    clearMessages,
    settings,
    saveSettings,
    recordUsage,
    recordActivity,
    reports,
    notice,
    setNotice,
    firstLaunch,
    takeFollowup,
    saveFollowupAnswer,
    dismissFollowup,
    markConsentAsked,
    dataEpoch,
  } = useNomi();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const scroll = useRef<ScrollView>(null);
  // Until when growing content must not pull the view to the end (cards opened by "Дахиад N харах").
  const holdScrollUntil = useRef(0);
  const inFlight = useRef(false);
  // Tasks, reminders and payments live in the StoresProvider, shared with the "Миний" tab. `stores.ref` is read in the async
  // flow below so a request never works on a render's stale copy.
  const stores = useStores();
  const storesReady = stores.ready;
  const sessionLocation = useRef<SessionLocation>('unasked');
  /** The `dataEpoch` the stores in this screen belong to; a request that started before "delete my data" is dropped when it ends. */
  const epoch = useRef(dataEpoch);
  // 'consent': paired, but nothing is sent until the AI disclosure is agreed to (AC 8.2). The footer and status line say which.
  const aiState = aiStatus(settings);

  // After "delete my data" the provider reloads the (now empty) stores; this screen drops what it was in the middle of. The state
  // is reset while rendering, React's pattern for state that follows a changing value, and the refs in the effect.
  const [epochSeen, setEpochSeen] = useState(dataEpoch);
  if (epochSeen !== dataEpoch) {
    setEpochSeen(dataEpoch);
    setPending(null);
    setDraft('');
  }
  useEffect(() => {
    epoch.current = dataEpoch;
    if (dataEpoch > 0) sessionLocation.current = 'unasked';
  }, [dataEpoch]);
  useEffect(() => {
    if (stores.loadFailed) setNotice('Хувийн мэдээллийг уншиж чадсангүй. Аппыг дахин нээгээрэй.');
  }, [stores.loadFailed, setNotice]);

  /**
   * A reminder's notification arrived (`opened` false: while Nomi was open) or was tapped (`opened` true, including the tap that
   * launched the app). The reminder becomes `fired` once, with its activity entry, and a tap puts "Сануулга: …" with the two
   * answers into the chat. Ids only: the text comes from the store on this phone.
   */
  function reminderArrived(id: string, opened: boolean) {
    const item = stores.ref.current.reminders.items.find((r) => r.id === id);
    if (!item || item.status === 'done' || item.status === 'cancelled') return;
    const fired = markFired(stores.ref.current.reminders, id);
    if (fired.changed) {
      stores.saveReminders(fired.store).catch(() => setNotice('Сануулгыг хадгалж чадсангүй.'));
      recordActivity({ kind: 'reminder_fired', refId: id });
    }
    if (!opened) return;
    addMessage({ role: 'assistant', text: reminderQuestion(item) });
    setPending({ kind: 'reminder', id });
  }
  // The subscription is made once the stores are loaded and calls whichever `reminderArrived` the latest render produced.
  const arrived = useRef(reminderArrived);
  useEffect(() => {
    arrived.current = reminderArrived;
  });
  useEffect(() => {
    if (!storesReady) return;
    return subscribeReminders((id, opened) => arrived.current(id, opened));
  }, [storesReady]);

  /**
   * The follow-up after a call (Section 14): on launch and on each return to the foreground the planner names the one place due,
   * and its question goes into the chat with the five answers. While Nomi is busy or already waiting on a question the item
   * simply waits for the next trigger. Nothing is ever due without a call tap first.
   */
  function askFollowup(trigger: FollowupTrigger, cleared = false) {
    if (busy || (pending && !cleared)) return;
    const due = takeFollowup(trigger);
    const place = due && placeById(due.placeId);
    if (!place) return;
    addMessage({ role: 'assistant', text: followupQuestion(place) });
    setPending({ kind: 'followup', placeId: place.id });
  }
  const followup = useRef(askFollowup);
  useEffect(() => {
    followup.current = askFollowup;
  });

  /**
   * Back in the app. After more than 2 hours away the conversation is put away first, with whatever question it was waiting on
   * (Section 20; an unanswered follow-up counts as "Дараа" and comes back later), and the follow-up check runs on the fresh chat.
   */
  function returnToApp(awayMs: number) {
    const fresh = !busy && chatExpired(messages);
    if (fresh) {
      if (pending?.kind === 'followup') dismissFollowup(pending.placeId);
      clearMessages();
      setPending(null);
    }
    askFollowup({ kind: 'foreground', awayMs }, fresh);
  }
  const returned = useRef(returnToApp);
  useEffect(() => {
    returned.current = returnToApp;
  });
  useEffect(() => {
    if (!ready || !storesReady) return;
    followup.current({ kind: 'launch' });
    // When the app left the foreground; iOS passes through 'inactive' on the way out and the first change counts.
    let leftAt: number | null = null;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        leftAt ??= Date.now();
        return;
      }
      if (leftAt !== null) returned.current(Date.now() - leftAt);
      leftAt = null;
    });
    return () => subscription.remove();
  }, [ready, storesReady]);

  /**
   * What a nearby search may do, decided without any prompt. The question is asked once per session. After a "Зөвшөөрөх"
   * (remembered as `locationAsked`) the system's standing yes is enough in later sessions, and a refusal the system will not
   * ask about again gets the district line without a pointless question. `dismissed`: the user typed instead of answering,
   * which counts as "Дүүргээ хэлье" for that one request.
   */
  async function locationMode(dismissed: boolean): Promise<LocationMode> {
    const session = sessionLocation.current;
    if (session === 'declined' || dismissed) return 'off';
    if (session === 'granted') return 'use';
    if (settings.locationAsked) {
      const state = await permissionState();
      if (state === 'granted') return 'use';
      if (state === 'blocked') return 'off';
    }
    return 'ask';
  }

  /** One fix from the device, remembered only as the system's yes or no. The coordinates go into this one search and nowhere else. */
  async function position(): Promise<Coordinates | null> {
    const result = await locateOnce();
    sessionLocation.current = result.granted ? 'granted' : 'declined';
    return result.coords;
  }

  /** Runs one request and posts the reply. `resume` carries the parsed nearby intent and the user's answer, so nothing is understood or asked twice. */
  async function run(text: string, resume?: { intent: Intent; mode: LocationMode }) {
    if (inFlight.current || !ready) return;
    inFlight.current = true;
    setBusy(true);
    setStatus('');
    setNotice('');
    const dismissed = pending?.kind === 'location' && !resume;
    // Typing past the follow-up question counts as "Дараа": it comes back on a later trigger, twice at most.
    if (pending?.kind === 'followup') dismissFollowup(pending.placeId);
    setPending(null);
    const previous = [...messages].reverse().find((m) => m.intent)?.intent;
    const startedIn = epoch.current;
    let result: Understanding | undefined;

    try {
      if (!storesReady) throw new Error('personal_storage_not_ready');
      result = await understand(text, {
        places,
        personal: stores.ref.current.personal,
        savePersonal: stores.savePersonal,
        reminders: stores.ref.current.reminders,
        saveReminders: stores.saveReminders,
        payments: stores.ref.current.payments,
        savePayments: stores.savePayments,
        boxes: stores.ref.current.boxes,
        saveBoxes: stores.saveBoxes,
        notifications,
        onExplain: (line) => addMessage({ role: 'assistant', text: line }),
        // Only the request text and the previous intent go to the server, and only once the AI is agreed to; nothing else leaves the device.
        // The agreement is given on the first screen (terms-gate.tsx) or in Settings, never asked for in the chat.
        ask: assistantFor(settings, undefined, installKeys),
        previous,
        reported: reportedPlaces(reports),
        location: { mode: resume ? () => resume.mode : () => locationMode(dismissed), position },
        intent: resume?.intent,
        onStatus: setStatus,
      });
      // "Delete my data" ran meanwhile: nothing of this request may come back.
      if (epoch.current !== startedIn) return;
      // understand() saved whatever changed; these carry the final state (a reminder's notification id included) to both tabs.
      stores.setPersonal(result.personal);
      stores.setReminders(result.reminders);
      stores.setPayments(result.payments);
      stores.setBoxes(result.boxes);
      // The activity history (Section 10): what happened, never what was said or where the phone was.
      if (result.aiUsed) recordActivity({ kind: 'ai_request', tokens: result.tokens?.total });
      if (result.action) recordActivity({ kind: result.action.kind, refId: result.action.id });
      if (result.intent?.action === 'unsupported') recordActivity({ kind: 'unsupported' });
      if (result.distances) recordActivity({ kind: 'location' });
      addMessage({
        role: 'assistant',
        text: result.text,
        places: result.places,
        more: result.more,
        comes: result.comes,
        oncall: result.oncall,
        intent: result.intent,
        steps: result.steps,
        ms: result.ms,
        tokens: result.tokens?.total,
        distances: result.distances,
      });
      if (result.question === 'location' && result.intent) setPending({ kind: 'location', text, intent: result.intent });
      if (result.question === 'consent') {
        // Offered once per session; the disclosure itself is where the user agrees.
        markConsentAsked();
        setPending({ kind: 'consent' });
      }
    } catch {
      if (epoch.current === startedIn) addMessage({ role: 'assistant', text: FAILED });
    } finally {
      inFlight.current = false;
      setBusy(false);
      setStatus('');
      // A resumed request is the same question, already counted.
      if (!resume && epoch.current === startedIn) recordUsage({ ai: result?.aiUsed ?? false, tokens: result?.tokens, server: result?.daily });
    }
  }

  function send() {
    sendText(draft);
  }

  function sendText(raw: string) {
    const text = raw.trim();
    if (!text || text.length > MESSAGE_LIMIT || inFlight.current || !ready) return;
    setDraft('');
    tapFeedback();
    addMessage({ role: 'user', text });
    run(text);
  }

  // "Бүх ангилал" sends a category back here as ?ask=…&t=…: asked once per tap, once the chat has loaded.
  const { ask, t } = useLocalSearchParams<{ ask?: string; t?: string }>();
  const askedFor = useRef('');
  const onAsk = useEffectEvent((text: string, token: string) => {
    askedFor.current = token;
    sendText(text);
  });
  useEffect(() => {
    if (!ready || !ask || !t || askedFor.current === t) return;
    const id = setTimeout(() => onAsk(ask, t), 0);
    return () => clearTimeout(id);
  }, [ready, ask, t]);


  /**
   * The tap on one of the two answers; only "Зөвшөөрөх" goes on to the system prompt (AC 7.1). Either answer ends the
   * question for this session and is remembered as `locationAsked`. The tap is echoed as the user's message so the
   * conversation still reads right once the buttons are gone.
   */
  function answerLocation(choice: { key: LocationChoice; label: string }) {
    const request = pending;
    if (request?.kind !== 'location' || inFlight.current) return;
    tapFeedback();
    addMessage({ role: 'user', text: choice.label });
    saveSettings({ ...settings, locationAsked: true }).catch(() => {});
    if (choice.key === 'allow') {
      run(request.text, { intent: request.intent, mode: 'use' });
      return;
    }
    sessionLocation.current = 'declined';
    if (request.intent.district) {
      run(request.text, { intent: request.intent, mode: 'off' });
    } else {
      setPending(null);
      addMessage({ role: 'assistant', text: LOCATION_DENIED_LINE });
    }
  }

  /**
   * "Дууссан" or "30 мин дараа" under a fired reminder. Done closes it (and the task it came from); the snooze asks the phone
   * for a new notification 30 minutes ahead, without a second permission prompt: the one that fired was already allowed.
   */
  async function answerReminderChoice(choice: { key: ReminderChoice; label: string }) {
    const request = pending;
    if (request?.kind !== 'reminder' || inFlight.current) return;
    tapFeedback();
    setPending(null);
    addMessage({ role: 'user', text: choice.label });
    const answer = answerReminder(stores.ref.current.reminders, stores.ref.current.personal, request.id, choice.key);
    let store = answer.store;
    let text = answer.reply;
    try {
      const item = answer.schedule ? store.items.find((r) => r.id === answer.schedule) : undefined;
      if (item) {
        const allowed = notifications.supported && (await notifications.granted());
        const notificationId = allowed ? await notifications.schedule(item).catch(() => null) : null;
        store = attachNotification(store, item.id, notificationId);
        text += '\n' + (!notifications.supported ? REMINDER_WEB_LINE : !allowed ? REMINDER_DENIED_LINE : notificationId ? REMINDER_SET_LINE : REMINDER_FAILED_LINE);
      }
      await stores.saveReminders(store);
      if (answer.personal !== stores.ref.current.personal) await stores.savePersonal(answer.personal);
      for (const action of answer.actions) recordActivity({ kind: action.kind, refId: action.id });
      addMessage({ role: 'assistant', text });
    } catch {
      addMessage({ role: 'assistant', text: FAILED });
    }
  }

  /**
   * One of the five answers under the follow-up question. The tap is echoed as the user's message; the answer is feedback on this
   * device (Section 6, `kind: 'followup'`) and Nomi replies in one line. "Дараа" keeps the question for a later trigger, twice at
   * most. A failed save puts the question back so the tap can be repeated.
   */
  async function answerFollowupChoice(choice: { key: FollowupChoice; label: string }) {
    const request = pending;
    if (request?.kind !== 'followup' || inFlight.current) return;
    tapFeedback();
    setPending(null);
    addMessage({ role: 'user', text: choice.label });
    try {
      addMessage({ role: 'assistant', text: await saveFollowupAnswer(request.placeId, choice.key) });
    } catch {
      addMessage({ role: 'assistant', text: FOLLOWUP_SAVE_FAILED });
      setPending(request);
    }
  }

  /** "AI-г холбох" opens the disclosure, where "Зөвшөөрч холбох" is the actual consent; "Одоо биш" keeps answering on the phone. */
  function answerConsent(choice: { key: ConsentChoice; label: string }) {
    if (pending?.kind !== 'consent' || inFlight.current) return;
    tapFeedback();
    setPending(null);
    if (choice.key === 'open') router.push('/ai-consent');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <Text style={styles.brandText}>nomi</Text>
            <View style={styles.brandDot} />
          </View>
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Шинэ яриа"
              disabled={busy || !ready}
              onPress={() => messages.length && setConfirmReset(true)}
              style={styles.iconButton}>
              <Ionicons name="create-outline" size={23} color="#202925" />
            </Pressable>
            <Link href="/settings" asChild>
              <Pressable accessibilityRole="button" accessibilityLabel="Тохиргоо" style={styles.iconButton}>
                <Ionicons name="ellipsis-horizontal" size={23} color="#202925" />
              </Pressable>
            </Link>
          </View>
        </View>

        <ScrollView
          ref={scroll}
          style={[styles.fill, WEB_NO_ANCHOR]}
          contentContainerStyle={[styles.conversation, !messages.length && styles.emptyConversation]}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            // A new message scrolls to the end; cards opened with "Дахиад N харах" stay where the finger is.
            if (Date.now() < holdScrollUntil.current) return;
            scroll.current?.scrollToEnd({ animated: true });
          }}>
          {!messages.length
            ? ready && (
                <Welcome status={statusLine(places, aiState === 'on')} firstLaunch={firstLaunch} onExample={setDraft} onHelp={() => setDraft('Тусламж')} />
              )
            : messages.map((m) => (
                <MessageView
                  key={m.id}
                  message={m}
                  animate={fresh.has(m.id)}
                  onExpand={() => {
                    holdScrollUntil.current = Date.now() + 1500;
                  }}
                />
              ))}
          {pending?.kind === 'location' && !busy && <ChoiceChips choices={LOCATION_CHOICES} onChoose={answerLocation} />}
          {pending?.kind === 'reminder' && !busy && <ChoiceChips choices={REMINDER_CHOICES} onChoose={answerReminderChoice} />}
          {pending?.kind === 'followup' && !busy && <ChoiceChips choices={FOLLOWUP_CHOICES} onChoose={answerFollowupChoice} />}
          {pending?.kind === 'consent' && !busy && <ChoiceChips choices={CONSENT_CHOICES} onChoose={answerConsent} />}
          {busy && <Thinking label={status || 'Хүсэлтийг ойлгож байна'} />}
        </ScrollView>

        <Composer
          value={draft}
          onChangeText={setDraft}
          onSend={send}
          canSend={Boolean(draft.trim()) && draft.length <= MESSAGE_LIMIT && !busy && ready}
          notice={notice}
          footer={FOOTERS[aiState]}
        />
      </KeyboardAvoidingView>

      <ResetDialog
        visible={confirmReset}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          // A follow-up question the new conversation leaves behind counts as "Дараа".
          if (pending?.kind === 'followup') dismissFollowup(pending.placeId);
          clearMessages();
          setDraft('');
          setPending(null);
          setConfirmReset(false);
        }}
      />
    </SafeAreaView>
  );
}

/** The footer states whether requests actually reach the AI. */
const FOOTERS = {
  on: 'Мэдээллийг давхар нягтлаарай.',
  consent: 'Туршилтын хувилбар · AI-г зөвшөөрөөгүй',
  off: 'Туршилтын хувилбар · AI хараахан холбогдоогүй',
} as const;

/**
 * Browsers keep a visible element in place when content above or around it grows (scroll anchoring), which would slide the view
 * past cards opened by "Дахиад N харах". The chat manages its own scrolling, so the web version turns that off.
 */
const WEB_NO_ANCHOR = Platform.OS === 'web' ? ({ overflowAnchor: 'none' } as unknown as ViewStyle) : undefined;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  fill: { flex: 1 },
  row: { flexDirection: 'row' },
  header: { height: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  brandText: { fontSize: 27, fontWeight: '700', letterSpacing: -1, color: Colors.ink },
  brandDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  conversation: { padding: 20, paddingBottom: 32, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: 26 },
  emptyConversation: { flexGrow: 1, justifyContent: 'center' },
});
