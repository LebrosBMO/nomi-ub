import { clientAddress, configFromEnv, createAssistant } from '@/server/assistant';

// The hosted assistant (EAS Hosting): POST /api/assistant. Built on first use so it reads the deployed environment.
let handle: ReturnType<typeof createAssistant> | undefined;
const assistant = () => (handle ??= createAssistant(configFromEnv(process.env)));

export const POST = (request: Request) => assistant()('assistant', request, clientAddress(request));
export const OPTIONS = (request: Request) => assistant()('assistant', request, clientAddress(request));
