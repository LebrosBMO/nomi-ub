import { clientAddress } from '@/server/assistant';
import { portal } from '@/server/portal-hosted';

// GET /api/business/report?k=<signed token>: the read-only monthly counts behind /business/report. No account, and the link expires.
export const GET = (request: Request) => portal()('report', request, clientAddress(request));
export const OPTIONS = (request: Request) => portal()('report', request, clientAddress(request));
