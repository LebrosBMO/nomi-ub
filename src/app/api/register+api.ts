import { clientAddress, configFromEnv, createAssistant } from '@/server/assistant';

// POST /api/register: a new install key for a phone that has not been paired by hand. No sign-up and nothing stored.
let handle: ReturnType<typeof createAssistant> | undefined;
const assistant = () => (handle ??= createAssistant(configFromEnv(process.env)));

export const POST = (request: Request) => assistant()('register', request, clientAddress(request));
export const OPTIONS = (request: Request) => assistant()('register', request, clientAddress(request));
