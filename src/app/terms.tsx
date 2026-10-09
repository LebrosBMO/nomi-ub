import { LegalScreen } from '@/screens/legal';
import { TERMS } from '@/utils/legal';

export default function TermsRoute() {
  return <LegalScreen doc={TERMS} />;
}
