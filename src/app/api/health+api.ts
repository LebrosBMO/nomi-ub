import { configFromEnv, createAssistant } from '@/server/assistant';

// GET /api/health: whether the hosted assistant has its OpenAI key and access key, and which model it uses. Never the keys.
export const GET = (request: Request) => createAssistant(configFromEnv(process.env))('health', request, 'health');
