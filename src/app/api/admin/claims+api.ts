import { clientAddress } from '@/server/assistant';
import { portal } from '@/server/portal-hosted';

// GET /api/admin/claims lists the pending claims and partner requests; POST marks one approved, rejected or called. NOMI_ADMIN_TOKEN only.
export const GET = (request: Request) => portal()('admin-claims', request, clientAddress(request));
export const POST = (request: Request) => portal()('admin-claims', request, clientAddress(request));
export const OPTIONS = (request: Request) => portal()('admin-claims', request, clientAddress(request));
