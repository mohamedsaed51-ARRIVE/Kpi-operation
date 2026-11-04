import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeComplaints, bearerSummary, countBy, filterMonth, monthsOf, sumAmount, isOpen, NO_BEARER, csvText } from '../src/lib/complaints.js';

const raw = [
  { 'رقم الشكوى': 1, 'تاريخ الأضافة': '2026-10-03', 'الفرع المتسبب': 'الهرم', 'نوع الشكوى': 'شكوى تخص فرع', 'وظيفه المتحمل': 'مندوب', 'مبلغ التعويض المستحق': '1,200', 'حالة الشكوى الحاليه': 'تم قبول التعويض' },
  { 'رقم الشكوى': 2, 'تاريخ الأضافة': '03-11-2026', 'الفرع المتسبب': 'الهرم', 'وظيفه المتحمل': 'مندوب', 'مبلغ التعويض المستحق': 300, 'حالة الشكوى الحاليه': 'جارى التحقيق' },
  { 'رقم الشكوى': 3, 'تاريخ الأضافة': '2026-10-05', 'الفرع المتسبب': 'المعادي', 'وظيفه المتحمل': '', 'مبلغ التعويض المستحق': '' },
  { 'رقم الشكوى': 3, 'تاريخ الأضافة': '2026-10-06', 'مبلغ التعويض المستحق': 999 }, // duplicate id
  { 'تاريخ الأضافة': '2026-10-07', 'مبلغ التعويض المستحق': 50 },                    // no id
  { 'رقم الشكوى': 4, 'تاريخ الأضافة': '2026-10-08', 'وظيفه المتحمل': 'الشركه', 'مبلغ التعويض المستحق': 0 },
];
const rows = decodeComplaints(raw);

test('decode: drops no-id and duplicate ids, parses numbers and dates', () => {
  assert.equal(rows.length, 4);
  assert.equal(rows[0].amount, 1200);
  assert.equal(rows[1].date, '2026-11-03');
  assert.equal(rows[1].month, 'نوفمبر');
  assert.equal(rows[2].amount, null);
  assert.equal(rows[0].type, 'فرع');
});

test('bearer summary: totals tie to sum, blank bearer grouped, compensated counts amount>0', () => {
  const s = bearerSummary(rows);
  assert.equal(s.reduce((t, o) => t + o.amount, 0), sumAmount(rows));
  assert.equal(s.reduce((t, o) => t + o.complaints, 0), rows.length);
  assert.deepEqual(s[0], { bearer: 'مندوب', amount: 1500, complaints: 2, compensated: 2 });
  assert.equal(s.find((o) => o.bearer === NO_BEARER).complaints, 1);
  assert.equal(s.find((o) => o.bearer === 'الشركه').compensated, 0);
});

test('countBy / month filter / open status', () => {
  assert.deepEqual(countBy(rows, 'branch')[0], { name: 'الهرم', count: 2 });
  assert.equal(countBy(rows, 'branch').reduce((t, x) => t + x.count, 0), rows.length);
  assert.deepEqual(monthsOf(rows), ['أكتوبر', 'نوفمبر']);
  assert.equal(filterMonth(rows, 'أكتوبر').length, 3);
  assert.equal(filterMonth(rows, 'all').length, 4);
  assert.equal(rows.filter(isOpen).length, 1);
});

test('csv escapes quotes and has BOM', () => {
  assert.equal(csvText(['a'], [['x"y']]), '﻿"a"\r\n"x""y"');
});
