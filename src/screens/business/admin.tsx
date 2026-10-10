import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { SERVICE_STYLE_LABELS, STATUS_LABELS, type Claim, type ClaimStatus } from '@/utils/business';
import { categoryName } from '@/utils/category-match';
import { dayInUB } from '@/utils/personal';

import { apiMessage, callApi, Check, Field, Hint, Label, Lede, Notice, Page, Primary, Section, Title } from './parts';

const ERRORS = {
  admin_token_required: 'Токен буруу байна.',
  admin_not_configured: 'Сервер дээр NOMI_ADMIN_TOKEN тохируулаагүй байна.',
  links_unavailable: 'Сервер дээр NOMI_SIGNING_SECRET тохируулаагүй байна.',
  unknown_place: 'Энэ id каталогид байхгүй.',
  not_found: 'Хүсэлт олдсонгүй.',
};
const KIND_LABELS: Record<Claim['kind'], string> = { claim: 'Мэдээлэл засах', partner: 'Түнш болох' };
const MARKS: [ClaimStatus, string][] = [
  ['approved', 'Зөвшөөрөх'],
  ['rejected', 'Татгалзах'],
  ['called', 'Залгасан'],
];

/**
 * /admin: the founder's page. The token is typed in and kept in memory only — nothing is saved on the device, so a shared or
 * forgotten browser keeps nothing. Every call carries it as a bearer header and the server compares it with NOMI_ADMIN_TOKEN.
 */
export function AdminPage() {
  const [token, setToken] = useState('');
  const [items, setItems] = useState<Claim[] | null>(null);
  const [onlyPending, setOnlyPending] = useState(true);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [placeId, setPlaceId] = useState('');
  const [link, setLink] = useState('');
  const auth = { Authorization: 'Bearer ' + token.trim() };

  async function load() {
    setBusy(true);
    setProblem('');
    const result = await callApi<{ items: Claim[] }>('/admin/claims?limit=200', { headers: auth });
    setBusy(false);
    if (!result.ok) {
      setItems(null);
      setProblem(apiMessage(result.error, ERRORS));
      return;
    }
    setItems(result.data?.items ?? []);
  }

  async function mark(claim: Claim, status: ClaimStatus) {
    setProblem('');
    const result = await callApi<{ claim: Claim }>('/admin/claims', { method: 'POST', headers: auth, body: JSON.stringify({ id: claim.id, status }) });
    if (!result.ok) {
      setProblem(apiMessage(result.error, ERRORS));
      return;
    }
    const updated = result.data?.claim;
    if (updated) setItems((old) => (old ?? []).map((c) => (c.id === updated.id ? updated : c)));
  }

  async function makeLink() {
    setProblem('');
    setLink('');
    const result = await callApi<{ link: string; expiresAt: string }>('/admin/report-link?placeId=' + encodeURIComponent(placeId.trim()), { headers: auth });
    if (!result.ok) {
      setProblem(apiMessage(result.error, ERRORS));
      return;
    }
    setLink(result.data ? `${result.data.link}\n(хүчинтэй: ${result.data.expiresAt.slice(0, 10)})` : '');
  }

  const shown = (items ?? []).filter((c) => !onlyPending || c.status === 'pending');

  return (
    <Page>
      <Title>Nomi админ</Title>
      <Lede>Эздийн хүсэлт, түншийн хүсэлтүүд. Токен зөвхөн энэ хуудсан дээр, санах ойд л байна.</Lede>
      <Section heading="Токен">
        <Field label="NOMI_ADMIN_TOKEN" value={token} onChangeText={setToken} secureTextEntry autoCorrect={false} autoCapitalize="none" placeholder="…" />
        <Primary label={busy ? 'Уншиж байна…' : 'Жагсаалт харах'} onPress={load} disabled={busy || token.trim().length < 8} />
        {!!problem && <Notice>{problem}</Notice>}
      </Section>

      {!!items && (
        <Section heading={`Хүсэлтүүд (${shown.length})`}>
          <Check label="Зөвхөн хүлээгдэж байгаа" checked={onlyPending} onToggle={() => setOnlyPending(!onlyPending)} />
          {shown.length === 0 && <Hint>Юу ч байхгүй.</Hint>}
          {shown.map((claim) => (
            <View key={claim.id} style={styles.claim}>
              <Text style={styles.claimTop}>
                {KIND_LABELS[claim.kind]} · {STATUS_LABELS[claim.status]} · {dayInUB(new Date(claim.createdAt))}
              </Text>
              <Text style={styles.claimName}>{claim.businessName || claim.placeId || '—'}</Text>
              <Text style={styles.claimLine}>
                Залгах: {claim.contactPhone} ({claim.ownerName})
                {claim.kind === 'claim' ? (claim.isOwner ? ' · эзэн/менежер гэж тэмдэглэсэн' : ' · эзэн гэж тэмдэглээгүй') : ''}
              </Text>
              {!!claim.placeId && <Text style={styles.claimMeta}>id: {claim.placeId}</Text>}
              {!claim.placeId && !!claim.category && <Text style={styles.claimLine}>Шинэ газар · {categoryName(claim.category)}</Text>}
              {!!claim.phones.length && <Text style={styles.claimLine}>Утас: {claim.phones.join(', ')}</Text>}
              {!!claim.hours && <Text style={styles.claimLine}>Цаг: {claim.hours}</Text>}
              {!!claim.addressNote && <Text style={styles.claimLine}>Хаяг: {claim.addressNote}</Text>}
              {!!claim.serviceStyle && <Text style={styles.claimLine}>Үйлчилгээ: {SERVICE_STYLE_LABELS[claim.serviceStyle]}</Text>}
              {!!claim.serviceAreas.length && <Text style={styles.claimLine}>Очдог дүүрэг: {claim.serviceAreas.join(', ')}</Text>}
              {!!claim.note && <Text style={styles.claimLine}>Тайлбар: {claim.note}</Text>}
              <View style={styles.marks}>
                {MARKS.map(([status, label]) => (
                  <Pressable
                    key={status}
                    accessibilityRole="button"
                    accessibilityState={{ selected: claim.status === status }}
                    onPress={() => mark(claim, status)}
                    style={[styles.mark, claim.status === status && styles.markOn]}>
                    <Text style={[styles.markText, claim.status === status && styles.markTextOn]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </Section>
      )}

      <Section heading="Тайлангийн холбоос">
        <Field label="Газрын id" placeholder="Жишээ: apteka:2086" value={placeId} onChangeText={setPlaceId} autoCorrect={false} autoCapitalize="none" />
        <Primary label="Холбоос гаргах" onPress={makeLink} disabled={!placeId.trim() || token.trim().length < 8} />
        {!!link && (
          <View style={styles.link}>
            <Label>Эзэнд илгээх холбоос</Label>
            <Text selectable style={styles.linkText}>
              {link}
            </Text>
          </View>
        )}
      </Section>
    </Page>
  );
}

const styles = StyleSheet.create({
  claim: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, gap: 2 },
  claimTop: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  claimName: { fontSize: 16, fontWeight: '600', color: Colors.ink, marginTop: 2 },
  claimLine: { fontSize: 13, color: Colors.text, lineHeight: 20 },
  claimMeta: { fontSize: 11, color: Colors.textMuted },
  marks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  mark: { borderRadius: 18, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  markOn: { backgroundColor: Colors.tint, borderColor: Colors.primary },
  markText: { fontSize: 13, color: Colors.text },
  markTextOn: { color: Colors.primary, fontWeight: '700' },
  link: { marginTop: 14 },
  linkText: { fontSize: 13, color: Colors.primary, lineHeight: 20 },
});
