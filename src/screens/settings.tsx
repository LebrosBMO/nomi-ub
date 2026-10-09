import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Meter } from '@/components/meter';
import { Colors } from '@/constants/theme';
import { useNomi } from '@/hooks/use-nomi';
import { validServerUrl } from '@/utils/core';
import { groupDigits, tapFeedback } from '@/utils/feedback';
import { dayInUB, PERSONAL_HELP } from '@/utils/personal';
import { exportFileName, serializeReports } from '@/utils/reports';
import { canShareFile, shareTextFile } from '@/utils/reports-export';
import { aiStatus, DELETE_DONE, DELETED_DATA, validToken, WEB_TOKEN_LINE, withPairing } from '@/utils/storage';
import { tokenInSecureStore } from '@/utils/storage-device';

/** "Яриа, ажил, санамж, …, холболт". */
const DELETED_LIST = DELETED_DATA.join(', ').replace(/^./, (c) => c.toUpperCase());

/** The "delete my data" dialog: closed, asking "Бүгдийг устгах уу?", deleting, or done. */
type DeleteStep = 'closed' | 'confirm' | 'busy' | 'done';

export function Settings() {
  const { ready } = useNomi();
  // The form copies saved values into local state once, so wait until they have loaded.
  return ready ? <SettingsForm /> : <View style={styles.sheet} />;
}

function SettingsForm() {
  const { settings, saveSettings, usage, addMessage, activity, reports, deleteAllData } = useNomi();
  const [url, setUrl] = useState(settings.apiUrl);
  const [token, setToken] = useState(settings.token);
  const [notice, setNotice] = useState('');
  /** The export shown as text: always on web, and on a phone when the share sheet is unavailable or failed. */
  const [exported, setExported] = useState('');
  const [exportNotice, setExportNotice] = useState('');
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('closed');
  const [deleteNotice, setDeleteNotice] = useState('');
  const reportCount = reports.items.length;
  const ai = aiStatus(settings);

  // Only on the user's tap. The file holds the listed report fields and nothing else (AC 6.2).
  async function exportReports() {
    if (!reportCount) return;
    tapFeedback();
    setExportNotice('');
    const text = serializeReports(reports);
    if (!(await canShareFile())) {
      setExported(text);
      return;
    }
    try {
      await shareTextFile(exportFileName(), text);
    } catch {
      setExportNotice('Хуваалцах цонх нээгдсэнгүй. Доорх текстийг хуулж аваарай.');
      setExported(text);
    }
  }

  /**
   * An empty URL unpairs and withdraws the AI consent. A URL saved without consent opens the AI disclosure next (Section 8); until
   * the user agrees there, requests are answered on the phone.
   */
  async function save() {
    const nextUrl = url.trim();
    const nextToken = token.trim();
    if (nextUrl && (!validServerUrl(nextUrl) || !validToken(nextToken))) {
      setNotice('Зөв серверийн хаяг болон холболтын код оруулна уу.');
      return;
    }
    const next = withPairing(settings, nextUrl, nextUrl ? nextToken : '');
    try {
      await saveSettings(next);
      if (aiStatus(next) === 'consent') router.replace('/ai-consent');
      else router.back();
    } catch {
      setNotice('Тохиргоог хадгалж чадсангүй.');
    }
  }

  /** Only after "Бүгдийг устгах". Every field on this sheet that showed deleted data is emptied too. */
  async function deleteData() {
    if (deleteStep === 'busy') return;
    tapFeedback();
    setDeleteStep('busy');
    setDeleteNotice('');
    let done = false;
    try {
      await deleteAllData();
      done = true;
    } catch {
      setDeleteNotice('Зарим өгөгдлийг устгаж чадсангүй. Дахин оролдоно уу.');
    }
    setUrl('');
    setToken('');
    setNotice('');
    setExported('');
    setExportNotice('');
    setDeleteStep(done ? 'done' : 'confirm');
  }

  function closeDelete() {
    const done = deleteStep === 'done';
    setDeleteStep('closed');
    setDeleteNotice('');
    // Back to the chat, which is at the first-launch welcome again (opened in place when Settings was loaded directly on web).
    if (done) router.dismissTo('/');
  }

  const counts = [
    ['Асуулт', usage.messages],
    ['AI хүсэлт', usage.aiRequests],
    ['Token', usage.tokens],
  ] as const;

  return (
    <ScrollView style={styles.sheet} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>Тохиргоо</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Хаах" style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="close" size={23} color="#202925" />
        </Pressable>
      </View>
      <Text style={styles.hint}>
        Яриа энэ төхөөрөмжид хадгалагдана. AI-г дараа холбоно. Холбож, зөвшөөрсний дараа л илгээсэн хүсэлт сервер рүү очно.
      </Text>

      <View style={styles.usage}>
        <Text style={styles.usageTitle}>Өнөөдрийн хэрэглээ</Text>
        <View style={styles.usageRow}>
          {counts.map(([label, value]) => (
            <View key={label} style={styles.usageCell}>
              <Text style={styles.usageValue}>{groupDigits(value)}</Text>
              <Text style={styles.usageLabel}>{label}</Text>
            </View>
          ))}
        </View>
        {usage.server ? (
          <>
            <Meter value={usage.server.used / usage.server.limit} />
            <Text style={styles.usageNote}>
              Серверийн өдрийн хязгаар: {groupDigits(usage.server.used)} / {groupDigits(usage.server.limit)}
            </Text>
          </>
        ) : (
          <Text style={styles.usageNote}>
            {ai === 'on'
              ? 'AI-аас хариу ирэхэд token энд тоологдоно.'
              : ai === 'consent'
                ? 'AI-г зөвшөөрөөгүй тул token зарцуулаагүй. Бүгд энэ утсан дээр ажилласан.'
                : 'AI холбогдоогүй тул token зарцуулаагүй. Бүгд энэ утсан дээр ажилласан.'}
          </Text>
        )}
      </View>

      <Link href="/activity" asChild>
        <Pressable accessibilityRole="button" style={styles.row}>
          <Ionicons name="time-outline" size={20} color={Colors.primary} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Үйлдлийн түүх</Text>
            <Text style={styles.rowHint}>{activity.items.length ? `${groupDigits(activity.items.length)} үйлдэл` : 'Nomi-гийн хийсэн үйлдлүүд'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>
      </Link>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !reportCount }}
        disabled={!reportCount}
        onPress={exportReports}
        style={styles.row}>
        <Ionicons name="share-outline" size={20} color={reportCount ? Colors.primary : Colors.textMuted} />
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, !reportCount && styles.rowDisabled]}>Мэдэгдлүүдээ илгээх</Text>
          <Text style={styles.rowHint}>
            {reportCount ? `${reportCount} мэдэгдэл · JSON файл. Байршил, яриа, санамж орохгүй.` : 'Мэдэгдэл алга. Картын “Мэдээлэл буруу”-г дарж мэдэгдэнэ.'}
          </Text>
        </View>
        {!!reportCount && <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />}
      </Pressable>
      {!!exportNotice && <Text style={styles.notice}>{exportNotice}</Text>}
      {!!exported && (
        <>
          <Text style={styles.label}>{exportFileName()}</Text>
          <TextInput
            accessibilityLabel="Мэдэгдлүүдийн JSON"
            value={exported}
            editable={false}
            multiline
            selectTextOnFocus
            style={[styles.field, styles.export]}
          />
          <Text style={styles.hint}>Текстийг сонгоод хуулж аваарай.</Text>
        </>
      )}

      <Pressable
        accessibilityRole="button"
        style={styles.secondary}
        onPress={() => {
          addMessage({ role: 'assistant', text: PERSONAL_HELP });
          router.back();
        }}>
        <Text style={styles.link}>Хувийн туслахыг яаж ашиглах вэ?</Text>
      </Pressable>

      <View style={styles.legal}>
        <Link href="/terms" style={styles.legalLink}>
          Үйлчилгээний нөхцөл
        </Link>
        <Text style={styles.hint}>·</Text>
        <Link href="/privacy" style={styles.legalLink}>
          Нууцлалын бодлого
        </Link>
      </View>

      {/* ODbL: part of the pharmacy catalog and the district borders come from OpenStreetMap (scripts/import-directory.py). */}
      <Text style={styles.hint}>Газрын мэдээллийн нэг хэсэг: © OpenStreetMap contributors (ODbL)</Text>

      {ai !== 'off' && (
        <Link href="/ai-consent" asChild>
          <Pressable accessibilityRole="button" style={styles.row}>
            <Ionicons name="sparkles-outline" size={20} color={Colors.primary} />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>AI-д юу явах вэ?</Text>
              <Text style={styles.rowHint}>
                {ai === 'on' && settings.aiConsentAt
                  ? `Зөвшөөрсөн · ${dayInUB(new Date(settings.aiConsentAt))}. Энд унтрааж болно.`
                  : 'Зөвшөөрөөгүй · хүсэлт энэ утсан дээр хариулагдана.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </Pressable>
        </Link>
      )}

      <Text style={styles.label}>Серверийн хаяг</Text>
      <TextInput
        accessibilityLabel="Серверийн хаяг"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        keyboardType="url"
        style={styles.field}
        placeholder="https://…"
      />
      <Text style={styles.label}>Холболтын код</Text>
      <TextInput
        accessibilityLabel="Холболтын код"
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        secureTextEntry
        style={styles.field}
      />
      <Text style={styles.hint}>OpenAI API түлхүүрээ энд оруулахгүй.</Text>
      {!tokenInSecureStore && <Text style={styles.hint}>{WEB_TOKEN_LINE}</Text>}
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      <Pressable accessibilityRole="button" onPress={save} style={styles.primary}>
        <Text style={styles.primaryText}>Хадгалах</Text>
      </Pressable>

      <Pressable accessibilityRole="button" onPress={() => setDeleteStep('confirm')} style={[styles.row, styles.dangerRow]}>
        <Ionicons name="trash-outline" size={20} color={Colors.warning} />
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, styles.danger]}>Миний өгөгдлийг устгах</Text>
          <Text style={styles.rowHint}>{DELETED_LIST}</Text>
        </View>
      </Pressable>

      <DeleteDialog step={deleteStep} notice={deleteNotice} onConfirm={deleteData} onClose={closeDelete} />
    </ScrollView>
  );
}

/** "Бүгдийг устгах уу?" and then "Бүх өгөгдөл устлаа.". A Modal rather than Alert so it also works on web. */
function DeleteDialog({ step, notice, onConfirm, onClose }: { step: DeleteStep; notice: string; onConfirm: () => void; onClose: () => void }) {
  const busy = step === 'busy';
  return (
    <Modal visible={step !== 'closed'} transparent animationType="fade" onRequestClose={busy ? () => {} : onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          {step === 'done' ? (
            <>
              <Text accessibilityRole="alert" style={styles.title}>
                {DELETE_DONE}
              </Text>
              <Text style={styles.hint}>Nomi эхнээсээ эхэлнэ.</Text>
              <Pressable accessibilityRole="button" style={styles.primary} onPress={onClose}>
                <Text style={styles.primaryText}>Хаах</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Бүгдийг устгах уу?</Text>
              <Text style={styles.hint}>
                {DELETED_LIST} энэ утаснаас бүрмөсөн устана. Товлосон сануулга ирэхгүй болно. Буцааж сэргээх боломжгүй.
              </Text>
              {!!notice && <Text style={[styles.notice, styles.dialogNotice]}>{notice}</Text>}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                style={[styles.primary, styles.dangerButton, busy && styles.dangerBusy]}
                onPress={onConfirm}>
                <Text style={styles.primaryText}>{busy ? 'Устгаж байна…' : 'Бүгдийг устгах'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={styles.secondary} onPress={onClose}>
                <Text style={styles.secondaryText}>Болих</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  legal: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 18 },
  legalLink: { fontSize: 13, color: Colors.primary, textDecorationLine: 'underline', paddingVertical: 10 },
  sheet: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, paddingBottom: 40, width: '100%', maxWidth: 480, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  usage: { marginTop: 16, padding: 16, borderRadius: 18, backgroundColor: Colors.panel },
  usageTitle: { fontSize: 13, fontWeight: '600', color: Colors.text },
  usageRow: { flexDirection: 'row', marginTop: 10 },
  usageCell: { flex: 1 },
  usageValue: { fontSize: 22, fontWeight: '600', letterSpacing: -0.5, color: Colors.ink },
  usageLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  usageNote: { fontSize: 12, lineHeight: 18, color: Colors.textSecondary, marginTop: 8 },
  secondary: { alignItems: 'center', padding: 15, marginTop: 6 },
  secondaryText: { color: Colors.text },
  link: { fontSize: 13, color: Colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, marginTop: 10, paddingHorizontal: 4 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, color: Colors.text },
  rowDisabled: { color: Colors.textMuted },
  rowHint: { fontSize: 12, lineHeight: 17, color: Colors.textSecondary, marginTop: 2 },
  export: { minHeight: 120, maxHeight: 240, fontSize: 12, color: Colors.text, fontFamily: 'monospace' },
  label: { fontSize: 13, marginTop: 16, marginBottom: 6, color: Colors.text },
  field: {
    borderWidth: 1,
    borderColor: '#DDE3D9',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    backgroundColor: Colors.surface,
    marginBottom: 6,
  },
  notice: { fontSize: 12, color: Colors.warning, paddingBottom: 8 },
  primary: { marginTop: 20, borderRadius: 14, backgroundColor: Colors.primary, padding: 15, alignItems: 'center' },
  primaryText: { color: '#FFF', fontWeight: '600' },
  dangerRow: { marginTop: 28, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  danger: { color: Colors.warning },
  dangerButton: { backgroundColor: Colors.warning },
  dangerBusy: { opacity: 0.6 },
  overlay: { flex: 1, backgroundColor: Colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 22 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: 24, padding: 24, backgroundColor: Colors.background },
  dialogNotice: { marginTop: 12, paddingBottom: 0 },
});
