import type { Category } from './core.ts';

/** Requests a new user can tap instead of guessing the syntax. Each one works offline (see examples.test.ts). */
export const EXAMPLES = [
  'БЗД эмийн сан',
  'Ойрхон дугуй засвар',
  'СБД шүдний эмнэлэг',
  'БГД нотариат',
  'Маргааш хийх: дугуй засвар руу залгах',
  'Төлбөр нэм: түрээс 450000 5',
  'Өнөөдрийн төлөвлөгөө',
] as const;

/** Shown once, on the very first launch. */
export const PRINCIPLES = ['Бодит мэдээлэл, зохиомол газар байхгүй', 'Залгах, илгээхээс өмнө асууна', 'Ажил, санамж энэ утсанд үлдэнэ'] as const;

/** "444 газар · 3 төрөл · AI холбогдоогүй": both counts come from the catalog, never from a typed number. */
export function statusLine(places: readonly { category: Category; alsoCategories?: Category[] }[], aiConnected: boolean) {
  const kinds = new Set(places.flatMap((p) => [p.category, ...(p.alsoCategories ?? [])])).size;
  return `${places.length} газар · ${kinds} төрөл · AI ${aiConnected ? 'холбогдсон' : 'холбогдоогүй'}`;
}
