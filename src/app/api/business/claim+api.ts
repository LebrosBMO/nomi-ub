import { clientAddress } from '@/server/assistant';
import { portal } from '@/server/portal-hosted';

// POST /api/business/claim: an owner's correction, stored as a pending claim. Nomi calls the number it lists before anything changes.
export const POST = (request: Request) => portal()('claim', request, clientAddress(request));
export const OPTIONS = (request: Request) => portal()('claim', request, clientAddress(request));
