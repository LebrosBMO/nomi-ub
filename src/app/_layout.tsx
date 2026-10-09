import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { Colors } from '@/constants/theme';
import { NomiProvider, useNomi } from '@/hooks/use-nomi';
import { StoresProvider } from '@/hooks/use-stores';
import { TermsGate } from '@/screens/terms-gate';
import { needsTerms } from '@/utils/legal';
import { prepareNotifications } from '@/utils/notifications';

// Hidden by NomiProvider once the saved conversation has loaded.
SplashScreen.preventAutoHideAsync();
// A reminder that comes due while Nomi is open is still shown (Section 13).
prepareNotifications();

/** Settings, the activity history, the report form and the AI disclosure all open as the same form sheet (a plain screen on web). */
const sheet = { presentation: 'formSheet' as const, sheetGrabberVisible: true, sheetAllowedDetents: [0.92], sheetCornerRadius: 24 };

export default function RootLayout() {
  return (
    <NomiProvider>
      {/* Inside NomiProvider: the stores reload when "delete my data" moves its dataEpoch. */}
      <StoresProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
          {/* "Асуух" (the chat) and "Миний" (the personal helper) are the two tabs; everything else opens over them. */}
          <Stack.Screen name="(tabs)" options={{ title: 'Nomi' }} />
          <Stack.Screen name="settings" options={{ title: 'Тохиргоо', ...sheet }} />
          <Stack.Screen name="activity" options={{ title: 'Үйлдлийн түүх', ...sheet }} />
          <Stack.Screen name="report/[placeId]" options={{ title: 'Мэдээлэл буруу', ...sheet }} />
          <Stack.Screen name="ai-consent" options={{ title: 'AI-г холбох', ...sheet }} />
          <Stack.Screen name="categories" options={{ title: 'Бүх ангилал', ...sheet }} />
          <Stack.Screen name="terms" options={{ title: 'Үйлчилгээний нөхцөл', ...sheet }} />
          <Stack.Screen name="privacy" options={{ title: 'Нууцлалын бодлого', ...sheet }} />
          {/* The business-owner side: plain web pages with no store install and no account. */}
          <Stack.Screen name="business/index" options={{ title: 'Nomi дээрх таны бизнес' }} />
          <Stack.Screen name="business/report" options={{ title: 'Сарын тайлан' }} />
          <Stack.Screen name="admin" options={{ title: 'Nomi админ' }} />
        </Stack>
        <FirstScreen />
      </StoresProvider>
    </NomiProvider>
  );
}

/**
 * The terms screen over everything until accepted. Not over the public web pages: /terms and /privacy, and the business-owner
 * side (/business, /business/report, /admin), which is for owners rather than for people using the app.
 */
const PUBLIC_PAGES = (path: string) => path === '/terms' || path === '/privacy' || path === '/admin' || path.startsWith('/business');

function FirstScreen() {
  const { ready, settings } = useNomi();
  const path = usePathname();
  if (!ready || !needsTerms(settings) || PUBLIC_PAGES(path)) return null;
  return <TermsGate />;
}
