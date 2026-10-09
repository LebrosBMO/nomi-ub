import { clientAddress } from '@/server/assistant';
import { portal } from '@/server/portal-hosted';

// GET /api/admin/report-link?placeId=: a signed /business/report link for any place in the catalog. NOMI_ADMIN_TOKEN only.
export const GET = (request: Request) => portal()('admin-report-link', request, clientAddress(request));
export const OPTIONS = (request: Request) => portal()('admin-report-link', request, clientAddress(request));
