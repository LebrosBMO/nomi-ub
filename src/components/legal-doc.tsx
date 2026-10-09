import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { TERMS_VERSION, type LegalDoc } from '@/utils/legal';

/** The Terms of Use or the Privacy Policy as plain sections: on the first screen, in Settings and on the web (/terms, /privacy). */
export function LegalDocView({ doc }: { doc: LegalDoc }) {
  return (
    <View>
      <Text accessibilityRole="header" style={styles.title}>
        {doc.title}
      </Text>
      <Text style={styles.version}>Хувилбар {TERMS_VERSION} · туршилтын хувилбар</Text>
      {doc.sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>
            {section.heading}
          </Text>
          <Text style={styles.body}>{section.body}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: Colors.ink },
  version: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  section: { marginTop: 18 },
  heading: { fontSize: 15, fontWeight: '600', color: Colors.text },
  body: { fontSize: 14, lineHeight: 22, color: Colors.text, marginTop: 4 },
});
