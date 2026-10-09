import { LegalScreen } from '@/screens/legal';
import { PRIVACY } from '@/utils/legal';

export default function PrivacyRoute() {
  return <LegalScreen doc={PRIVACY} />;
}
