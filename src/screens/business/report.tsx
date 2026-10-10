import Head from 'expo-router/head';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { EVENT_KINDS, KIND_LABELS, summaryLine, type Counts } from '@/utils/counters';

import { apiMessage, callApi, Hint, Lede, Notice, Page, Section, Title } from './parts';
import { rememberReport } from './remember';

type ReportData = { placeId: string; name: string | null; month: string; previousMonth: string; counts: Counts; previousCounts: Counts };

const BAD_LINK = 'Холбоос хүчингүй болсон эсвэл хугацаа нь дууссан байна. Nomi-гаас шинэ холбоос авна уу.';
/** "2026-10" → "2026 оны 10 сар". */
const monthLabel = (month: string) => {
  const [year, m] = month.split('-');
  return `${year} оны ${Number(m)} сар`;
};

/**
 * /business/report?k=<token>: the read-only monthly report. The token is the place id and an expiry signed with
 * NOMI_SIGNING_SECRET, so the owner needs no account and the link stops working on its own.
 */
export function BusinessReport() {
  const { k } = useLocalSearchParams<{ k?: string }>();
  const token = typeof k === 'string' ? k : '';
  const [data, setData] = useState<ReportData | null>(null);
  const [problem, setProblem] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    // A link without a token is answered here; everything else is the route's answer, and either way nothing is shown until it is in.
    const read = async () => (token ? callApi<ReportData>('/business/report?k=' + encodeURIComponent(token)) : { ok: false, data: null, error: 'invalid_link' });
    read().then((result) => {
      if (!live) return;
      setLoading(false);
      setData(result.data);
      setProblem(result.ok ? '' : apiMessage(result.error, { invalid_link: BAD_LINK }));
      // A link that worked is kept in this browser, so the owner's home-screen icon opens their numbers next time.
      if (result.ok && result.data) rememberReport({ token, placeId: result.data.placeId, name: result.data.name });
    });
    return () => {
      live = false;
    };
  }, [token]);

  return (
    <Page>
      <Head>
        <title>Nomi бизнес — сарын тайлан</title>
      </Head>
      <Title>Сарын тайлан</Title>
      {loading && <Lede>Уншиж байна…</Lede>}
      {!!problem && <Notice>{problem}</Notice>}
      {!!data && (
        <>
          <Lede>{data.name ?? data.placeId}</Lede>
          <Section heading={monthLabel(data.month)}>
            <Lede>{summaryLine(data.counts)}</Lede>
            <View style={styles.table}>
              <View style={styles.row}>
                <Text style={[styles.cell, styles.head]}> </Text>
                <Text style={[styles.number, styles.head]}>{monthLabel(data.month)}</Text>
                <Text style={[styles.number, styles.head]}>{monthLabel(data.previousMonth)}</Text>
              </View>
              {EVENT_KINDS.map((kind) => (
                <View key={kind} style={styles.row}>
                  <Text style={styles.cell}>{KIND_LABELS[kind]}</Text>
                  <Text style={styles.number}>{data.counts[kind]}</Text>
                  <Text style={styles.number}>{data.previousCounts[kind]}</Text>
                </View>
              ))}
            </View>
            <Hint>“Харсан” гэдэг нь Nomi таны газрыг хүнд харуулсан тоо, “Залгасан” нь тэндээс таны дугаар дээр дарсан тоо.</Hint>
          </Section>
          <Hint>
            Тоолол нэргүй: хэн харсан, юу бичсэн, хаана байсан нь хаана ч хадгалагддаггүй. Зөвхөн таны газрын дугаар, сар, үйлдлийн төрөл л тоологддог.
          </Hint>
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  table: { marginTop: 14, borderTopWidth: 1, borderTopColor: Colors.border },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 40, borderBottomWidth: 1, borderBottomColor: Colors.border },
  cell: { flex: 1, fontSize: 14, color: Colors.text },
  number: { width: 92, textAlign: 'right', fontSize: 14, fontWeight: '600', color: Colors.ink },
  head: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
});
