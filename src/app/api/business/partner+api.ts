import { clientAddress } from '@/server/assistant';
import { portal } from '@/server/portal-hosted';

// POST /api/business/partner: "Түнш болох хүсэлт илгээх" — the business, a contact name and a phone. No online payment.
export const POST = (request: Request) => portal()('partner', request, clientAddress(request));
export const OPTIONS = (request: Request) => portal()('partner', request, clientAddress(request));
