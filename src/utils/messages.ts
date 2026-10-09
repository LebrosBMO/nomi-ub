import type { Intent } from './core.ts';

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** When it was written. Messages saved before this field existed carry their time in the id ("<base-36 ms>-<n>"). */
  at?: string;
  /** Catalog ids only; the card looks each one up in directory.json. */
  places?: string[];
  /** Up to five more matches, shown when "Дахиад N харах" is tapped. */
  more?: string[];
  /** Businesses that come to the customer, in their own section under the shops (tire repair). */
  comes?: string[];
  /** The whole answer is businesses that come to the customer: their cards lead with the call. */
  oncall?: boolean;
  intent?: Intent;
  steps?: string[];
  ms?: number;
  tokens?: number;
  /**
   * Kilometres from the phone to each card's place (null without coordinates) when the search used a position (Section 7).
   * Kept for this session only and never saved: three distances to known places would give the position away.
   */
  distances?: Record<string, number | null>;
};

/** The saved conversation keeps this many of the latest messages. */
export const MESSAGE_CAP = 100;
/** After this long away the chat starts fresh. Tasks, bills and spending live in "Миний", so nothing kept is lost. */
export const FRESH_CHAT_MS = 2 * 3600000;

/** When a message was written: its `at`, else the time in its id; NaN when neither can be read. */
export function messageTime(message: Pick<Message, 'id' | 'at'>): number {
  if (message.at) return Date.parse(message.at);
  const ms = parseInt(message.id.split('-')[0], 36);
  // Ids from before 2020 or from the future are not times this app wrote.
  return ms > Date.UTC(2020, 0, 1) && ms < Date.UTC(2100, 0, 1) ? ms : NaN;
}

/**
 * True when the conversation is old enough to put away: its last message is over 2 hours old. An empty chat, or one whose time
 * cannot be read, is kept as it is.
 */
export function chatExpired(messages: readonly Pick<Message, 'id' | 'at'>[], now = new Date()): boolean {
  const last = messages.at(-1);
  if (!last) return false;
  const t = messageTime(last);
  return Number.isFinite(t) && now.getTime() - t > FRESH_CHAT_MS;
}

/** The shape that goes into `nomi:chat:v1`: everything except the session-only distances. */
export function storedMessage(message: Message): Message {
  if (!('distances' in message)) return message;
  const { distances, ...stored } = message;
  return stored;
}

/** Reads the saved conversation (`nomi:chat:v1`). Malformed entries are dropped; unparseable JSON throws so the caller can say so. */
export function restoreMessages(raw: string | null): Message[] {
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (m) =>
        m &&
        typeof m.id === 'string' &&
        ['user', 'assistant'].includes(m.role) &&
        typeof m.text === 'string' &&
        (m.at === undefined || (typeof m.at === 'string' && Number.isFinite(Date.parse(m.at))))
    )
    .slice(-MESSAGE_CAP)
    .map(storedMessage);
}
