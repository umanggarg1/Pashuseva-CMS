/**
 * Standalone verification for Phase 32 B1: toWhatsappNumber / maskWhatsappNumber.
 *
 * This project has no test runner, so this is a plain script:
 *     npx ts-node src/utils/phone.verify.ts
 * Exits 0 when every case matches, 1 (listing the mismatches) otherwise.
 */
import { toWhatsappNumber, isValidWhatsappNumber, maskWhatsappNumber } from './phone';

const NBSP = '\u00A0';
const cases: [string, string | null | undefined, string | null][] = [
  // valid formats
  ['plain 10 digits', '9876543210', '919876543210'],
  ['starts with 6', '6123456789', '916123456789'],
  ['starts with 7', '7012345678', '917012345678'],
  ['starts with 8', '8901234567', '918901234567'],
  ['spaces 5+5', '98765 43210', '919876543210'],
  ['NON-BREAKING SPACE (U+00A0), as found in 6 real phones', `98765${NBSP}43210`, '919876543210'],
  ['NBSP at both ends', `${NBSP}9876543210${NBSP}`, '919876543210'],
  ['NBSP + 11-digit with trunk 0 (real A0 shape)', `098765${NBSP}43210`, '919876543210'],
  ['leading/trailing ordinary spaces', '  9876543210  ', '919876543210'],
  ['tab and newline', '98765\t43210\n', '919876543210'],
  ['dashes', '98765-43210', '919876543210'],
  ['brackets and dots', '(98765).43210', '919876543210'],
  ['trunk 0', '09876543210', '919876543210'],
  ['+91 with space', '+91 98765 43210', '919876543210'],
  ['+91 with dash', '+91-9876543210', '919876543210'],
  ['91 without plus', '919876543210', '919876543210'],
  ['0091 international', '0091 98765 43210', '919876543210'],
  ['091 prefix', '091 9876543210', '919876543210'],
  ['zero-width space pasted inside', '98765\u200B43210', '919876543210'],
  ['BOM at start', '\uFEFF9876543210', '919876543210'],
  ['zero-width JOINER pasted inside', '98765\u200D43210', '919876543210'],
  ['zero-width NON-joiner + word joiner', '98765\u200C432\u206010', '919876543210'],
  ['10 digits starting 91 is a NATIONAL number', '9198765432', '919198765432'],
  // invalid
  ['9 digits (as the 2 invalid real primaries)', '987654321', null],
  ['11 digits not starting 0', '98765432101', null],
  ['starts with 5 (not a mobile)', '5876543210', null],
  ['starts with 0 after trunk 0 removed', '00876543210', null],
  ['landline with STD code', '01662 234567', null],
  ['12 digits not starting 91', '449876543210', null],
  ['91 + non-mobile', '915876543210', null],
  ['91 + 11 digits', '9198765432101', null],
  ['Devanagari digits', '९८७६५४३२१०', null],
  ['mixed ASCII + Devanagari', '98765४३२१०', null],
  ['Arabic-Indic digits', '٩٨٧٦٥٤٣٢١٠', null],
  ['full-width digits', '９８７６５４３２１０', null],
  ['letters', '98765abcde', null],
  ['two numbers in one field', '9876543210 / 9123456789', null],
  ['slash separator', '98765/43210', null],
  ['empty', '', null],
  ['only spaces', `  ${NBSP} `, null],
  ['null', null, null],
  ['undefined', undefined, null],
];

let failures = 0;
for (const [name, input, expected] of cases) {
  const got = toWhatsappNumber(input);
  const valid = isValidWhatsappNumber(input);
  const ok = got === expected && valid === (expected !== null);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  — input ${JSON.stringify(input)} expected ${expected} got ${got}`}`);
}

const masks: [string, string][] = [
  ['9876543210', '98XXXX3210'],
  [`+91 98765${NBSP}43210`, '98XXXX3210'],
  ['987654321', ''],
];
for (const [input, expected] of masks) {
  const got = maskWhatsappNumber(input);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  mask ${JSON.stringify(input)} → ${JSON.stringify(got)}${ok ? '' : ` (expected ${expected})`}`);
}

const total = cases.length + masks.length;
console.log(`\n${total - failures}/${total} phone cases passed`);
process.exit(failures ? 1 : 0);
