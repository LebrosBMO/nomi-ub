import data from '@/data/directory.json';
import type { Category, Place } from '@/utils/core';

export const places = data as Place[];

const byId = new Map(places.map((place) => [place.id, place]));
export const placeById = (id: string) => byId.get(id);

export const countByCategory = places.reduce(
  (counts, place) => {
    for (const c of [place.category, ...(place.alsoCategories ?? [])]) counts[c] = (counts[c] ?? 0) + 1;
    return counts;
  },
  {} as Partial<Record<Category, number>>
);
