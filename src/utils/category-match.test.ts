import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_DATA, GROUPS } from '../data/categories.ts';
import { categoryName, isCategory, matchCategories, skeleton } from './category-match.ts';

test('Cyrillic and the usual Latin spellings reduce to the same skeleton', () => {
  assert.equal(skeleton('засвар'), skeleton('zaswar'));
  assert.equal(skeleton('шүдний эмнэлэг'), skeleton('shudnii emneleg'));
  assert.equal(skeleton('эмийн сан'), skeleton('emiiin san'));
  assert.equal(skeleton('Хувцас'), skeleton('khuvtsas'));
  assert.equal(skeleton('Дугуй!!'), 'dugui');
});

test('A message names a category by any of its words, a longer phrase wins over a shorter one it shares words with, and two separate ones are both reported', () => {
  assert.deepEqual(matchCategories('БЗД эмийн сангаас'), ['pharmacy']);
  assert.deepEqual(matchCategories('bgd dugui zaswar'), ['tire']);
  assert.deepEqual(matchCategories('унадаг дугуй засвар хаана вэ'), ['bicycle_repair']);
  assert.deepEqual(matchCategories('эмийн сан биш дугуй засвар'), ['pharmacy', 'tire']);
  assert.deepEqual(matchCategories('сайн байна уу'), []);
});

test('Every category has a group, a Mongolian name and words, and ids are unique', () => {
  const groups = new Set(GROUPS.map((g) => g.id));
  assert.equal(new Set(CATEGORY_DATA.map((c) => c.id)).size, CATEGORY_DATA.length);
  for (const c of CATEGORY_DATA) {
    assert.ok(groups.has(c.group), c.id + ' group ' + c.group);
    assert.ok(c.mn && c.words.length, c.id);
    assert.ok(isCategory(c.id));
    assert.equal(categoryName(c.id), c.mn);
    // Each category is found by its own name.
    assert.ok(matchCategories(c.mn).includes(c.id), c.id + ': ' + c.mn);
  }
});

test('An empty category points to a related one with places only when its name starts with the same specific word, or to its group\x27s general place', async () => {
  const { relatedCategory } = await import('./category-match.ts');
  const counts = { phone_repair: 3, dentist: 60, car_repair: 286, car_wash: 189, court: 5 };
  assert.equal(relatedCategory('phone_screen', counts) ?? relatedCategory('phone_battery', counts), 'phone_repair');
  // Car work without a garage of its own goes to car repair, never to the car wash because both say "машин".
  assert.equal(relatedCategory('ecu_programming', counts), 'car_repair');
  assert.equal(relatedCategory('forensic', counts), null);
  // Families: the general business that does the specialised job, in the order listed when a service has two.
  const more = { ...counts, plumber: 3, language_school: 2, private_hospital: 100, ent_doctor: 2, banquet_hall: 2, restaurant: 500 };
  assert.equal(relatedCategory('pipe_thawing', more), 'plumber');
  assert.equal(relatedCategory('dental_cleaning', more), 'dentist');
  assert.equal(relatedCategory('russian_course', more), 'language_school');
  assert.equal(relatedCategory('wedding_venue', more), 'banquet_hall');
  assert.equal(relatedCategory('wedding_venue', { ...more, banquet_hall: 0 }), 'restaurant');
  // "Чихрийн шижин" (diabetes) and "Чих хамар хоолой" (ENT) share their first letters, not their subject.
  assert.equal(relatedCategory('diabetes_care', more), 'private_hospital');
  assert.equal(relatedCategory('no_such_category', counts), null);
});

test('Every category name finds that category alone, and everyday words find none', () => {
  for (const c of CATEGORY_DATA) {
    assert.deepEqual(matchCategories(c.mn), [c.id], c.mn);
    assert.ok(matchCategories(`БЗД ${c.mn} хаана байна`).includes(c.id), c.mn);
  }
  // "хийдэг" (does) must not read as "хийд" (monastery); the rest are the filler around most questions.
  for (const text of ['хийдэг газар', 'hiideg gazar', 'засдаг хүн байна уу', 'хаана байна', 'ойрхон', 'сайн байна уу', 'хэдэн цагт хаадаг вэ', 'үнэ хэд вэ', 'нээлттэй юу', 'маргааш', 'утасны дугаар'])
    assert.deepEqual(matchCategories(text), [], text);
});

test("A general AI answer gives way to the one specific category the user's words name", async () => {
  const { preferNamed } = await import('./category-match.ts');
  assert.equal(preferNamed('car_repair', 'приус засвар хэрэгтэй байна'), 'hybrid_repair');
  assert.equal(preferNamed('plumber', 'хөлдсөн шугам гэсгээх хүн'), 'pipe_thawing');
  // Not the same kind, two named, or nothing named: the AI's choice stands.
  assert.equal(preferNamed('car_repair', 'шүдний эмнэлэг'), 'car_repair');
  assert.equal(preferNamed('tire', 'БЗД'), 'tire');
  assert.equal(preferNamed('pharmacy', 'эмийн сан'), 'pharmacy');
});
