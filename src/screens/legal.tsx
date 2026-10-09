import { ScrollView, StyleSheet } from 'react-native';

import { LegalDocView } from '@/components/legal-doc';
import { Colors } from '@/constants/theme';
import type { LegalDoc } from '@/utils/legal';

/** /terms and /privacy: a sheet from Settings in the app, and the public pages at nomi-ub.expo.app the store listing links to. */
export function LegalScreen({ doc }: { doc: LegalDoc }) {
  return (
    <ScrollView style={styles.sheet} contentContainerStyle={styles.content}>
      <LegalDocView doc={doc} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, paddingBottom: 48, width: '100%', maxWidth: 640, alignSelf: 'center' },
});
