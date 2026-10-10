import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { CATEGORY_DATA, GROUPS, type CategoryDef } from '@/data/categories';
import { CLAIM_ERRORS, LIMITS, PARTNER, readClaim, searchBusinesses, type ClaimDraft } from '@/utils/business';
import { CATEGORIES, categoryMode, categoryName, matchCategories, skeleton } from '@/utils/category-match';
import { districtNames, verificationLabel, type Place } from '@/utils/core';
import { defaultWeek, formatHours, type Week } from '@/utils/hours';
import { placeById, places } from '@/utils/places';

import { CopyToAll, HoursPicker } from './hours';
import { apiMessage, callApi, Check, Field, Hint, INSTALL_STEPS, Label, Lede, Notice, Page, Primary, Quiet, Section, Title, useInstallPrompt } from './parts';
import { forgetReport, rememberedReport, type RememberedReport } from './remember';

/** The address as the chat's card shows it, so the owner sees what the customer sees. */
const NO_ADDRESS = 'Нарийвчилсан хаяг дутуу';
const groupName = (id: string) => GROUPS.find((g) => g.id === id)?.mn ?? id;

/**
 * /business: the business-owner side. What Nomi is, a search for one's own listing, how it looks in the chat, a correction that
 * Nomi calls about before anything changes, an "add my business" path, and the partner offer. No account and no password: a claim
 * is only a request to be called back, so the owner's phone number is the one thing it must carry.
 */
export function BusinessPortal() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Place | null>(null);
  const [adding, setAdding] = useState(false);
  const found = useMemo(() => (query.trim() ? searchBusinesses(places, query) : []), [query]);
  // The report link this device has already opened, so an owner with the app on their phone lands on their own numbers.
  const [saved, setSaved] = useState<RememberedReport | null>(null);
  useEffect(() => {
    let live = true;
    rememberedReport().then((report) => {
      if (live) setSaved(report);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Page>
      {/* The icon and the manifest for these pages are swapped in src/app/+html.tsx, before the browser reads them. */}
      <Head>
        <title>Nomi бизнес</title>
      </Head>
      <Title>Nomi дээрх таны бизнес</Title>
      <Lede>
        Nomi бол Улаанбаатарын үйлчилгээний газруудыг олдог монгол чат. Хүн “ойрхон эмийн сан” эсвэл “дугуй засвар” гэж бичихэд Nomi хамгийн таарах газруудын нэр, утас,
        хаяг, цагийг харуулдаг.
      </Lede>
      <Lede>Таны газар Nomi дээр үнэгүй байна. Бүртгүүлэх, төлбөр төлөх шаардлагагүй — мэдээллээ зөв болгуулахад л хангалттай.</Lede>

      {!!saved && (
        <Section heading="Таны сарын тайлан">
          <Lede>{saved.name ?? saved.placeId}</Lede>
          <Hint>Хэдэн хүн таныг харсан, хэдэн хүн залгасныг харах.</Hint>
          <Primary label="Тайлангаа харах" onPress={() => router.navigate({ pathname: '/business/report', params: { k: saved.token } })} />
          <Quiet
            label="Энэ бол миний газар биш"
            onPress={() => {
              void forgetReport();
              setSaved(null);
            }}
          />
        </Section>
      )}

      <InstallCard />

      <Section heading="Газраа хайх">
        <Field
          label="Нэр эсвэл утасны дугаар"
          placeholder="Жишээ: Монос эмийн сан, 99112233"
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setSelected(null);
          }}
          autoCorrect={false}
          inputMode="text"
        />
        {!!query.trim() && !selected && found.length === 0 && <Hint>Олдсонгүй. Нэрийг өөрөөр бичиж үзээрэй, эсвэл доороос Nomi-д нэмүүлээрэй.</Hint>}
        {!selected &&
          found.map((place) => (
            <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={place.name + ' сонгох'} onPress={() => setSelected(place)} style={styles.result}>
              <View style={styles.resultText}>
                <Text style={styles.resultName}>{place.name}</Text>
                <Text style={styles.resultMeta}>
                  {[categoryName(place.category), place.district, place.phones[0]].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </Pressable>
          ))}
        {!adding && (
          <Quiet
            label="Газраа олсонгүй — Nomi-д нэмүүлэх"
            onPress={() => {
              setSelected(null);
              setAdding(true);
            }}
          />
        )}
      </Section>

      {!!selected && <Preview place={selected} onClear={() => setSelected(null)} />}
      {(!!selected || adding) && <ClaimForm key={selected?.id ?? 'new'} place={selected} adding={adding && !selected} />}
      <PartnerOffer place={selected} />

      <Hint>
        Nomi мэдээллийг олон эх сурвалжаас цуглуулдаг тул хуучирсан байж болно. Бидэнд мэдэгдсэн мэдээллийг утсаар шалгаж батлуулсны дараа л оруулна. Nomi эмийн талаар
        зөвлөгөө өгөхгүй.
      </Hint>
    </Page>
  );
}

/**
 * "Утсандаа суулгах": the page offers the browser's own install where there is one (Android, Chrome), and explains the
 * Share menu where there is not (iPhone). In an already installed window it says nothing.
 */
function InstallCard() {
  const { prompt, installed, install } = useInstallPrompt();
  if (installed || Platform.OS !== 'web') return null;
  return (
    <Section heading="Утсандаа суулгах">
      <Lede>Nomi бизнесийг утсандаа апп шиг нэмээд, нэг товшилтоор мэдээллээ засаж, сарын тайлангаа харж болно.</Lede>
      <Hint>Апп дэлгүүрээс татах шаардлагагүй, бүртгүүлэх ч шаардлагагүй.</Hint>
      {prompt ? <Primary label="Утсандаа суулгах" onPress={install} /> : <Hint>{INSTALL_STEPS}</Hint>}
    </Section>
  );
}

/** "Nomi дээр ингэж харагдана": the same fields and the same words the chat's card uses. */
function Preview({ place, onClear }: { place: Place; onClear: () => void }) {
  const comes = categoryMode(place.category) !== 'visit' || place.qualityFlags.includes('mobile_service');
  return (
    <Section heading="Nomi дээр ингэж харагдана">
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.cardName}>{place.name}</Text>
          <View style={[styles.badge, place.verifiedAt ? styles.badgeOn : styles.badgeOff]}>
            <Text style={[styles.badgeText, place.verifiedAt ? styles.badgeTextOn : styles.badgeTextOff]}>{verificationLabel(place)}</Text>
          </View>
        </View>
        <Text style={styles.cardLine}>{place.address && place.address !== NO_ADDRESS ? place.address : 'Хаягийг утсаар лавлана уу.'}</Text>
        <Text style={styles.cardLine}>
          {place.verifiedAt ? 'Цаг: ' : 'Цаг (баталгаажаагүй): '}
          {place.hoursClaim}
        </Text>
        {!!place.phones.length && <Text style={styles.cardLine}>Утас: {place.phones.slice(0, 3).join(', ')}</Text>}
        <Text style={styles.cardLine}>Үйлчилгээ: {categoryName(place.category)}</Text>
        {comes && <Text style={styles.cardLine}>{place.serviceAreas?.length ? 'Очдог дүүрэг: ' + place.serviceAreas.join(', ') : 'Очдог дүүрэг бүртгэгдээгүй'}</Text>}
        {!place.phones.length && <Hint>Утасны дугаар байхгүй тул хүн тань руу залгаж чадахгүй. Доор нэмээрэй.</Hint>}
      </View>
      <Quiet label="Өөр газар сонгох" onPress={onClear} />
    </Section>
  );
}

/** The correction, and for a business that is not in the catalog yet its name and category too. */
function ClaimForm({ place, adding }: { place: Place | null; adding: boolean }) {
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [phones, setPhones] = useState<string[]>(() => [...(place?.phones ?? []), '', '', ''].slice(0, LIMITS.phones));
  // Hours are chosen, not typed (src/utils/hours.ts). `setting` off means the owner is not changing them, so nothing is sent
  // and whatever the catalog holds stays as it is.
  const [setting, setSetting] = useState(false);
  const [week, setWeek] = useState<Week>(defaultWeek);
  const hours = setting ? formatHours(week) : '';
  const [addressNote, setAddressNote] = useState('');
  const [areas, setAreas] = useState<string[]>(place?.serviceAreas ?? []);
  const [ownerName, setOwnerName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [sent, setSent] = useState(false);

  // A business that comes to the customer is asked about its districts first; a shop is asked quietly, in case it also comes.
  const mode = categoryMode(place?.category ?? category ?? '');
  const comesToYou = mode !== 'visit';

  async function submit() {
    const draft: ClaimDraft = {
      kind: 'claim',
      placeId: place?.id ?? null,
      businessName: place ? place.name : businessName,
      category: place ? null : category,
      phones: phones.map((p) => p.trim()).filter(Boolean),
      hours,
      addressNote,
      serviceAreas: areas,
      ownerName,
      contactPhone,
      isOwner,
      note,
    };
    // The same check the route runs, so a mistake is said here instead of coming back as a 400.
    const checked = readClaim(draft, (id) => Boolean(placeById(id)));
    if ('error' in checked) {
      setProblem(CLAIM_ERRORS[checked.error]);
      return;
    }
    setBusy(true);
    setProblem('');
    const result = await callApi<{ id: string }>('/business/claim', { method: 'POST', body: JSON.stringify(draft) });
    setBusy(false);
    if (result.ok) setSent(true);
    else setProblem(apiMessage(result.error, CLAIM_ERRORS));
  }

  if (sent)
    return (
      <Section heading="Хүсэлтийг хүлээж авлаа">
        <Lede>
          Nomi {contactPhone} дугаар луу залгаж батлуулсны дараа л мэдээлэл өөрчлөгдөнө. Түүнийг хүртэл хуучин мэдээлэл хэвээр харагдана. Ажлын 1–3 өдөрт залгана.
        </Lede>
        <Hint>Хэрэв өөр газрын мэдээллийг бас засуулах бол хуудсаа дахин нээгээрэй.</Hint>
      </Section>
    );

  return (
    <Section heading={adding ? 'Газраа Nomi-д нэмүүлэх' : 'Мэдээллээ зөв болгох'}>
      {adding && (
        <>
          <Field label="Газрын нэр" placeholder="Жишээ: Хүслэн дугуй засвар" value={businessName} onChangeText={setBusinessName} maxLength={LIMITS.businessName} />
          <CategoryPicker chosen={category} onChoose={setCategory} />
        </>
      )}
      {phones.map((phone, index) => (
        <Field
          key={index}
          label={`Утас ${index + 1}${index ? ' (заавал биш)' : ''}`}
          placeholder="99112233"
          value={phone}
          onChangeText={(text) => setPhones(phones.map((p, i) => (i === index ? text : p)))}
          inputMode="tel"
          maxLength={20}
        />
      ))}
      <View style={styles.hours}>
        <Check label="Ажиллах цагаа зөв болгох" checked={setting} onToggle={() => setSetting(!setting)} />
        {!setting && <Hint>{place?.hoursClaim ? `Одоо: ${place.hoursClaim}` : 'Одоогоор ажиллах цаг бүртгэгдээгүй.'}</Hint>}
        {setting && (
          <>
            <CopyToAll week={week} onChange={setWeek} />
            <HoursPicker week={week} onChange={setWeek} />
            <Hint>Nomi утсаар шалгах хүртэл “баталгаажаагүй” гэж харуулна.</Hint>
          </>
        )}
      </View>
      <Field
        label="Хаягийн тэмдэглэл"
        placeholder="Жишээ: 3-р хороолол, Их дэлгүүрийн баруун талд, 1-р давхар"
        value={addressNote}
        onChangeText={setAddressNote}
        maxLength={LIMITS.addressNote}
        multiline
      />
      <DistrictPicker areas={areas} onToggle={(d) => setAreas(areas.includes(d) ? areas.filter((a) => a !== d) : [...areas, d])} prominent={comesToYou} />
      <Field label="Таны нэр" placeholder="Жишээ: Б. Ганбат" value={ownerName} onChangeText={setOwnerName} maxLength={LIMITS.ownerName} />
      <Field label="Холбоо барих утас" placeholder="99112233" value={contactPhone} onChangeText={setContactPhone} inputMode="tel" maxLength={20} hint="Nomi энэ дугаар луу залгаж батлуулна." />
      <Field label="Нэмэлт тайлбар (заавал биш)" placeholder="Өөр зүйл хэлэх бол бичээрэй" value={note} onChangeText={setNote} maxLength={LIMITS.note} multiline />
      <View style={styles.ownerCheck}>
        <Check label="Би энэ газрын эзэн/менежер" checked={isOwner} onToggle={() => setIsOwner(!isOwner)} />
      </View>
      {!!problem && <Notice>{problem}</Notice>}
      <Primary label={busy ? 'Илгээж байна…' : 'Хүсэлт илгээх'} onPress={submit} disabled={busy} />
      <Hint>Nomi мэдээллийг шууд өөрчлөхгүй: та бичсэн дугаар луу залгаж батлуулсны дараа оруулна.</Hint>
    </Section>
  );
}

/** The nine districts. A business that comes to the customer is asked first and plainly; a shop is asked under a quieter line. */
function DistrictPicker({ areas, onToggle, prominent }: { areas: string[]; onToggle: (district: string) => void; prominent: boolean }) {
  return (
    <View style={[styles.districts, prominent && styles.districtsProminent]}>
      <Label>{prominent ? 'Та аль дүүрэгт очиж үйлчилдэг вэ?' : 'Очиж үйлчилдэг дүүрэг (хэрэв очдог бол)'}</Label>
      {prominent && <Hint>Nomi таны үйлчилгээг “танай хаяг дээр очиж үйлчилдэг” гэж харуулдаг тул очдог дүүргээ тэмдэглэх нь хамгийн чухал.</Hint>}
      <View style={styles.districtGrid}>
        {districtNames.map((district) => (
          <View key={district} style={styles.districtCell}>
            <Check label={district} checked={areas.includes(district)} onToggle={() => onToggle(district)} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** The category of a business that is not in the catalog yet: the registry's 1,000 categories, by name or by the words people type. */
function CategoryPicker({ chosen, onChoose }: { chosen: string | null; onChoose: (id: string) => void }) {
  const [text, setText] = useState('');
  const suggestions = useMemo(() => {
    const words = skeleton(text).split(' ').filter(Boolean);
    if (!words.length) return [];
    // What the words name first (the chat's own matcher, so "цоож" finds the locksmith), then every name they start.
    const named = matchCategories(text).map((id) => CATEGORIES.get(id));
    const byName = CATEGORY_DATA.filter((c) => {
      const name = ' ' + skeleton(c.mn) + ' ';
      return words.every((word) => name.includes(' ' + word));
    });
    const suggested = new Map<string, CategoryDef>();
    for (const c of [...named, ...byName]) if (c) suggested.set(c.id, c);
    return [...suggested.values()].slice(0, 8);
  }, [text]);

  return (
    <View>
      <Field label="Үйлчилгээний төрөл" placeholder="Жишээ: дугуй засвар, цоож, гэрийн цэвэрлэгээ" value={text} onChangeText={setText} autoCorrect={false} />
      {!!chosen && <Hint>Сонгосон: {categoryName(chosen)}</Hint>}
      {suggestions.map((c) => (
        <Pressable key={c.id} accessibilityRole="button" accessibilityState={{ selected: chosen === c.id }} onPress={() => onChoose(c.id)} style={styles.result}>
          <View style={styles.resultText}>
            <Text style={styles.resultName}>{c.mn}</Text>
            <Text style={styles.resultMeta}>{groupName(c.group)}</Text>
          </View>
          <Ionicons name={chosen === c.id ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={chosen === c.id ? Colors.primary : Colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

/** The partner offer: the recommended slot, the verified badge and the monthly report. Nomi calls; nothing is paid online. */
function PartnerOffer({ place }: { place: Place | null }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [sent, setSent] = useState(false);

  async function send() {
    if (!place) return;
    const draft: ClaimDraft = {
      kind: 'partner',
      placeId: place.id,
      businessName: place.name,
      category: null,
      phones: [],
      hours: '',
      addressNote: '',
      serviceAreas: [],
      ownerName: name,
      contactPhone: phone,
      // The owner checkbox belongs to a correction; a partner request is answered by a call either way.
      isOwner: false,
      note: '',
    };
    const checked = readClaim(draft, (id) => Boolean(placeById(id)));
    if ('error' in checked) {
      setProblem(CLAIM_ERRORS[checked.error]);
      return;
    }
    setBusy(true);
    setProblem('');
    const result = await callApi<{ id: string }>('/business/partner', { method: 'POST', body: JSON.stringify(draft) });
    setBusy(false);
    if (result.ok) setSent(true);
    else setProblem(apiMessage(result.error, CLAIM_ERRORS));
  }

  return (
    <Section heading="Түнш болох">
      <Text style={styles.offer}>Түнш болсон газар:</Text>
      {[
        'Хайлтын хариунд “Санал болгож буй” хэсэгт эхэнд гарна.',
        'Nomi утсаар шалгаж “Баталгаажсан” тэмдэг авна.',
        'Сар бүр тайлан: хэдэн хүн харсан, хэдэн хүн залгасан.',
      ].map((line) => (
        <View key={line} style={styles.bullet}>
          <Ionicons name="checkmark" size={16} color={Colors.primary} />
          <Text style={styles.bulletText}>{line}</Text>
        </View>
      ))}
      <Text style={styles.price}>
        {PARTNER.months} сар {PARTNER.price.toLocaleString('en-US')}₮
      </Text>
      <Hint>Урьдчилж нэг удаа төлнө. Нэг ч залгалт гараагүй сарын дараагийн сар үнэгүй. Нэг дүүрэгт нэг төрлөөр {PARTNER.perCategoryPerDistrict} түншээс олон болохгүй.</Hint>
      <Hint>Онлайн төлбөр байхгүй: Nomi өөрөө залгаж тохирно. Төлбөр төлсөн газар илүү ойр эсвэл илүү баталгаатай газраас дээгүүр гарахгүй.</Hint>
      {sent ? (
        <Lede>Хүсэлтийг хүлээж авлаа. Nomi {phone} дугаар луу залгаж нөхцөлийг тайлбарлана.</Lede>
      ) : (
        <>
          {!place && <Hint>Эхлээд дээрээс газраа хайж сонгоно уу.</Hint>}
          {/* Named apart from the correction form's own fields, so a screen reader and the owner both know which pair they are in. */}
          <Field label="Холбоо барих хүний нэр" placeholder="Жишээ: Б. Ганбат" value={name} onChangeText={setName} maxLength={LIMITS.ownerName} />
          <Field label="Залгах утас" placeholder="99112233" value={phone} onChangeText={setPhone} inputMode="tel" maxLength={20} />
          {!!problem && <Notice>{problem}</Notice>}
          <Primary label={busy ? 'Илгээж байна…' : 'Түнш болох хүсэлт илгээх'} onPress={send} disabled={busy || !place} />
        </>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderTopWidth: 1, borderTopColor: Colors.border },
  resultText: { flex: 1, paddingVertical: 8 },
  resultName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  resultMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  card: { borderLeftWidth: 2, borderLeftColor: Colors.line, paddingLeft: 12, gap: 2 },
  cardTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 15, fontWeight: '600', color: Colors.text, flexShrink: 1 },
  badge: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2 },
  badgeOn: { backgroundColor: Colors.tint },
  badgeOff: { borderWidth: 1, borderColor: Colors.border },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextOn: { color: Colors.primary },
  badgeTextOff: { color: Colors.textSecondary },
  cardLine: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  districts: { marginTop: 16 },
  districtsProminent: { backgroundColor: Colors.panel, borderRadius: 12, padding: 12 },
  districtGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  districtCell: { width: '50%', minWidth: 130 },
  hours: { marginTop: 16 },
  ownerCheck: { marginTop: 16 },
  offer: { fontSize: 14, color: Colors.text, marginBottom: 6 },
  bullet: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 4 },
  bulletText: { fontSize: 14, color: Colors.text, lineHeight: 21, flexShrink: 1 },
  price: { fontSize: 20, fontWeight: '700', color: Colors.ink, marginTop: 14 },
});
