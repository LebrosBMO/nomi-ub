// Runs searches in the Nomi app on a plugged-in Pixel 6 Pro (1440×3120) and saves a screenshot of each answer for review.
// Nomi's screen keeps a gentle animation running, so Android's UI reader never sees it idle: this taps fixed positions instead.
// Queries are typed in Latin (adb cannot type Cyrillic); Nomi reads both.
//   node scripts/phone-check.mjs <out-dir> "bgd shudnii emneleg" "chd notariat" ...
// It refuses to type unless Nomi is the app in front.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ADB = 'C:/Users/Handashka/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const POS = { box: [335, 2460], send: [1282, 2457], fresh: [1136, 257], confirm: [720, 1632] };
const [outDir, ...queries] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tap = ([x, y]) => adb('shell', 'input', 'tap', String(x), String(y));
const front = () => /mn\.nomi\.pilot/.test(adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=.*/)?.[0] ?? '');
const shot = (file) => fs.writeFileSync(file, execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 1 << 26 }));

for (const [i, q] of queries.entries()) {
  if (!front()) throw new Error('Nomi is not the app in front; stopping so nothing is typed into another app.');
  if (process.env.FRESH) {
    tap(POS.fresh);
    await sleep(1200);
    tap(POS.confirm);
    await sleep(1200);
  }
  tap(POS.box);
  await sleep(700);
  adb('shell', 'input', 'text', q.replace(/ /g, '%s'));
  await sleep(400);
  adb('shell', 'input', 'keyevent', '4'); // hide the keyboard so the send button is back in place
  await sleep(700);
  tap(POS.send);
  await sleep(Number(process.env.WAIT ?? 9000));
  const file = path.join(outDir, `${String(i + 1).padStart(2, '0')}-${q.replace(/[^a-z0-9]+/gi, '_')}.png`);
  shot(file);
  console.log(file);
}
