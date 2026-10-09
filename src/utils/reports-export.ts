import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * Whether this platform can write the export file and open the system share sheet.
 * Web cannot share local files (expo-file-system has no web support), so the settings sheet shows the JSON in a text box there instead.
 */
export async function canShareFile() {
  if (Platform.OS === 'web') return false;
  try {
    return await Sharing.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Writes `name` with `text` into the cache directory and opens the share sheet. Only ever called from the user's tap on "Мэдэгдлүүдээ илгээх". */
export async function shareTextFile(name: string, text: string) {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true, intermediates: true });
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: name });
}
