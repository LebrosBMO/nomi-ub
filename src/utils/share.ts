import { mapsLink, type Place } from './core.ts';

/**
 * The message a place card's "Хуваалцах" sends to Messenger, Viber or SMS: the place as Nomi knows it, and where to find Nomi.
 * Never the distance: it would tell the recipient roughly where the sender is, and the position never leaves the phone (Section 7).
 */
export function shareText(place: Pick<Place, 'name' | 'address' | 'phones' | 'mapUrl' | 'latitude' | 'longitude'>, nomiUrl?: string) {
  const map = mapsLink(place as Place);
  return [
    'Nomi-гоор олсон: ' + place.name,
    place.address.trim(),
    place.phones.length ? 'Утас: ' + place.phones.slice(0, 3).join(', ') : '',
    map ? 'Газрын зураг: ' + map : '',
    nomiUrl ? 'Nomi: ' + nomiUrl : '',
  ]
    .filter(Boolean)
    .join('\n');
}
