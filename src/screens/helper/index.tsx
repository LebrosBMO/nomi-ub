import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, MaxContentWidth } from '@/constants/theme';
import { useNomi } from '@/hooks/use-nomi';
import { useStores } from '@/hooks/use-stores';
import { placeById } from '@/utils/places';
import { addBox, addSpending, describeEntry, monthSummary, parseAmount, spendingBox, type Box } from '@/utils/boxes';
import { PlaceCard } from '@/screens/chat/place-card';
import { tapFeedback } from '@/utils/feedback';
import { attentionCount, doneTasks, openTasks, paymentRows, recentlyCalled, todayPlan } from '@/utils/helper';
import { formatAmount, monthInUB, setPaid, totalsLine, type Payment } from '@/utils/payments';
import { dayInUB, setTaskDone, type Memory, type Task } from '@/utils/personal';
import { formatAt, type Reminder } from '@/utils/reminders';

const SAVE_FAILED = 'Хадгалж чадсангүй. Дахин дарна уу.';

/**
 * "Миний" (Section 20): everything the user has given Nomi to hold — what is due today, the monthly payments, the tasks and the
 * memories — in one standing view. The chat stays for asking; this tab is for looking and ticking off. Every change goes through
 * the same pure functions the chat commands use (`setTaskDone`, `setPaid`), so a tap here and a typed command cannot disagree.
 */
export function Helper() {
  const { recordActivity, activity } = useNomi();
  const stores = useStores();
  const { personal, reminders, payments, ready, loadFailed } = stores;
  const [notice, setNotice] = useState('');
  const now = new Date();
  const plan = todayPlan(personal, reminders, payments, now);
  const waiting = attentionCount(plan);
  const month = monthInUB(now);

  async function toggleTask(task: Task) {
    tapFeedback();
    setNotice('');
    const next = setTaskDone(personal, task.id, !task.done);
    if (next === personal) return;
    try {
      await stores.savePersonal(next);
      recordActivity({ kind: task.done ? 'task_restore' : 'task_done', refId: task.id });
    } catch {
      setNotice(SAVE_FAILED);
    }
  }

  async function togglePayment(payment: Payment, paid: boolean) {
    tapFeedback();
    setNotice('');
    const next = setPaid(payments, payment.id, paid, month);
    if (next === payments) return;
    try {
      await stores.savePayments(next);
      recordActivity({ kind: paid ? 'payment_paid' : 'payment_unpaid', refId: payment.id });
    } catch {
      setNotice(SAVE_FAILED);
    }
  }

  /** The "+ Зардал" tile: adds the ready-made spending box. */
  async function addSpendingBox() {
    tapFeedback();
    setNotice('');
    const made = addBox(stores.boxes, 'spending');
    if (made.store === stores.boxes) return;
    try {
      await stores.saveBoxes(made.store);
    } catch {
      setNotice(SAVE_FAILED);
    }
  }

  /** The quick add form under "Зардал". Resolves true once saved, so the form can clear itself. */
  async function saveSpending(amount: number, category: string): Promise<boolean> {
    tapFeedback();
    setNotice('');
    const added = addSpending(stores.boxes, { amount, category });
    if ('error' in added) {
      setNotice(added.error);
      return false;
    }
    try {
      await stores.saveBoxes(added.store);
      recordActivity({ kind: 'entry_add', refId: added.entry.id });
      return true;
    } catch {
      setNotice(SAVE_FAILED);
      return false;
    }
  }

  const tasks = openTasks(personal);
  const finished = doneTasks(personal);
  const spending = spendingBox(stores.boxes);
  const called = recentlyCalled(activity.items, now, (id) => Boolean(placeById(id)));
  const bills = paymentRows(payments, now);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Миний</Text>
        <Link href="/settings" asChild>
          <Pressable accessibilityRole="button" accessibilityLabel="Тохиргоо" style={styles.iconButton}>
            <Ionicons name="ellipsis-horizontal" size={23} color="#202925" />
          </Pressable>
        </Link>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!!notice && <Text style={styles.notice}>{notice}</Text>}
        {loadFailed && <Text style={styles.notice}>Хувийн мэдээллийг уншиж чадсангүй. Аппыг дахин нээгээрэй.</Text>}

        <Section title="Өнөөдөр" hint={ready && !waiting ? 'Өнөөдөр хийх зүйл алга.' : undefined}>
          {plan.tasks.map((task) => (
            <Row
              key={'t' + task.id}
              icon="ellipse-outline"
              label={task.title}
              note={task.dueDate && task.dueDate < dayInUB(now) ? 'Хугацаа хэтэрсэн · ' + task.dueDate : undefined}
              onPress={() => toggleTask(task)}
              accessibilityLabel={`${task.title}. Дууссан гэж тэмдэглэх`}
            />
          ))}
          {plan.reminders.map((reminder: Reminder) => (
            <Row key={'r' + reminder.id} icon="alarm-outline" label={reminder.text} note={formatAt(reminder.at).slice(11)} />
          ))}
          {plan.payments.map((payment) => (
            <Row
              key={'p' + payment.id}
              icon="square-outline"
              label={payment.name}
              note={`${formatAmount(payment.amount)} · ${payment.day}-нд`}
              onPress={() => togglePayment(payment, true)}
              accessibilityLabel={`${payment.name}, ${formatAmount(payment.amount)}. Төлсөн гэж тэмдэглэх`}
            />
          ))}
        </Section>

        {called.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Сүүлд залгасан</Text>
            {called.map((id, i) => (
              <PlaceCard key={id} id={id} index={i} animate={false} />
            ))}
          </View>
        )}

        <Section
          title="Сарын төлбөр"
          hint={bills.length ? totalsLine(payments.items, month) : 'Чат руу очоод “Төлбөр нэм: түрээс 450000 5” гэж бичвэл энд гарна.'}>
          {bills.map(({ payment, paid }) => (
            <Row
              key={payment.id}
              icon={paid ? 'checkbox' : 'square-outline'}
              label={payment.name}
              note={`${formatAmount(payment.amount)} · сар бүр ${payment.day}-нд`}
              done={paid}
              onPress={() => togglePayment(payment, !paid)}
              accessibilityLabel={`${payment.name}, ${formatAmount(payment.amount)}. ${paid ? 'Төлөөгүй болгох' : 'Төлсөн гэж тэмдэглэх'}`}
            />
          ))}
        </Section>

        {spending && <Spending box={spending} now={now} onSave={saveSpending} />}

        <Section title="Ажил" hint={tasks.length ? undefined : 'Чат руу очоод “Ажил нэм: …” гэж бичвэл энд гарна.'}>
          {tasks.map((task) => (
            <Row
              key={task.id}
              icon="ellipse-outline"
              label={task.title}
              note={task.dueDate}
              onPress={() => toggleTask(task)}
              accessibilityLabel={`${task.title}. Дууссан гэж тэмдэглэх`}
            />
          ))}
          {finished.slice(0, 5).map((task) => (
            <Row
              key={task.id}
              icon="checkmark-circle"
              label={task.title}
              done
              onPress={() => toggleTask(task)}
              accessibilityLabel={`${task.title}. Хийх ажлуудад буцааж оруулах`}
            />
          ))}
        </Section>

        <Section title="Санамж" hint={personal.memories.length ? undefined : 'Чат руу очоод “Санаж ав: …” гэж бичвэл энд гарна.'}>
          {personal.memories.map((memory: Memory) => (
            <Row key={memory.id} icon="bookmark-outline" label={memory.text} />
          ))}
        </Section>

        {!spending && ready && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Бүртгэл нэмэх</Text>
            <Text style={styles.sectionHint}>Өөрт хэрэгтэй зүйлээ бүртгэ. Эрүүл мэнд, машин, гэр бүл удахгүй нэмэгдэнэ.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Зардлын бүртгэл нэмэх"
              onPress={addSpendingBox}
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
              <Ionicons name="receipt-outline" size={22} color={Colors.primary} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Зардал</Text>
                <Text style={styles.rowNote}>Өдрийн зардал, сарын нийт ангиллаар</Text>
              </View>
              <Ionicons name="add-circle" size={24} color={Colors.primary} />
            </Pressable>
          </View>
        )}

        <Text style={styles.footer}>Бүгд энэ утсанд хадгалагдана. Устгах, өөрчлөх бол чат руу очоод “Тусламж” гэж бичээрэй.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * The spending box (Section 21): this month's total and its split by category, a quick add (type the amount, tap a category,
 * "Нэмэх"), and the latest entries. Adding here and typing "Зардал: 15000 хоол" in the chat go through the same `addSpending`.
 */
function Spending({ box, now, onSave }: { box: Box; now: Date; onSave: (amount: number, category: string) => Promise<boolean> }) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(box.def.categories[0]);
  const [saving, setSaving] = useState(false);
  const summary = monthSummary(box, now);
  const value = parseAmount(amount);
  const valid = Number.isFinite(value) && value > 0;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    if (await onSave(value, category)) setAmount('');
    setSaving(false);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{box.def.name}</Text>
      <Text style={styles.sectionHint}>
        Энэ сар: {formatAmount(summary.total)}
        {summary.count ? ` · ${summary.count} удаа` : ''}
      </Text>

      <View style={styles.card}>
        <View style={styles.form}>
          <TextInput
            value={amount}
            onChangeText={(text) => setAmount(text.replace(/[^\d.,кk]/gi, ''))}
            placeholder="Дүн, ₮"
            placeholderTextColor={Colors.textMuted}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={save}
            accessibilityLabel="Зардлын дүн"
            style={styles.input}
            maxLength={12}
          />
          <View style={styles.chips}>
            {box.def.categories.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityState={{ selected: c === category }}
                onPress={() => setCategory(c)}
                style={[styles.chip, c === category && styles.chipOn]}>
                <Text style={[styles.chipText, c === category && styles.chipTextOn]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={valid ? `${formatAmount(value)}, ${category}. Нэмэх` : 'Нэмэх'}
            accessibilityState={{ disabled: !valid || saving }}
            disabled={!valid || saving}
            onPress={save}
            style={[styles.add, (!valid || saving) && styles.addDisabled]}>
            <Text style={styles.addText}>{valid ? `${formatAmount(value)} · ${category} нэмэх` : 'Нэмэх'}</Text>
          </Pressable>
        </View>

        {summary.categories.map((c) => (
          <View key={c.category} style={styles.split}>
            <Text style={styles.rowLabel}>{c.category}</Text>
            <Text style={styles.splitAmount}>{formatAmount(c.amount)}</Text>
          </View>
        ))}
      </View>

      {summary.latest.length > 0 && (
        <>
          <Text style={styles.subTitle}>Сүүлийнх</Text>
          {summary.latest.map((e) => (
            <Text key={e.id} style={styles.latest}>
              {describeEntry(e, now)}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const rows = Array.isArray(children) ? children.flat().filter(Boolean) : children;
  const empty = Array.isArray(rows) ? rows.length === 0 : !rows;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!hint && <Text style={styles.sectionHint}>{hint}</Text>}
      {empty ? null : <View style={styles.card}>{rows}</View>}
    </View>
  );
}

function Row({
  icon,
  label,
  note,
  done,
  onPress,
  accessibilityLabel,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  note?: string;
  done?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const body = (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={done ? Colors.textMuted : Colors.primary} />
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, done && styles.rowDone]}>{label}</Text>
        {!!note && <Text style={styles.rowNote}>{note}</Text>}
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 24,
    paddingRight: 12,
    paddingBottom: 4,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: 24, paddingTop: 8, paddingBottom: 48, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  notice: { fontSize: 13, color: Colors.warning, marginBottom: 12 },
  section: { marginTop: 22 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  sectionHint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 8 },
  card: { backgroundColor: Colors.surface, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 56 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15, color: Colors.text },
  rowDone: { color: Colors.textMuted, textDecorationLine: 'line-through' },
  rowNote: { fontSize: 12, color: Colors.textSecondary },
  pressed: { backgroundColor: Colors.tint },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  form: { padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  input: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.text,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.panel,
    fontVariant: ['tabular-nums'],
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, minHeight: 40, justifyContent: 'center', borderRadius: 999, backgroundColor: Colors.bubble },
  chipOn: { backgroundColor: Colors.primary },
  chipText: { fontSize: 14, color: Colors.text },
  chipTextOn: { color: '#FFF', fontWeight: '600' },
  add: { borderRadius: 14, backgroundColor: Colors.primary, paddingVertical: 13, alignItems: 'center' },
  addDisabled: { backgroundColor: Colors.primaryDisabled },
  addText: { color: '#FFF', fontWeight: '600', fontSize: 15 },
  split: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  splitAmount: { fontSize: 15, color: Colors.text, fontVariant: ['tabular-nums'] },
  subTitle: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginTop: 14, marginBottom: 4 },
  latest: { fontSize: 13, color: Colors.textSecondary, lineHeight: 22, fontVariant: ['tabular-nums'] },
  footer: { fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginTop: 28 },
});
