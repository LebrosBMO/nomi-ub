import { clientAddress } from '@/server/assistant';
import { portal } from '@/server/portal-hosted';

// POST /api/events: one anonymous count for a business that was shown, called, mapped or shared. Same auth as /api/assistant.
export const POST = (request: Request) => portal()('events', request, clientAddress(request));
export const OPTIONS = (request: Request) => portal()('events', request, clientAddress(request));
