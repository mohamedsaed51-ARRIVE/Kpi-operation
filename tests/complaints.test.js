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

import { latestMonth } from '../src/lib/complaints.js';
test('latestMonth uses the newest date, not calendar order', () => {
  assert.equal(latestMonth(rows), 'نوفمبر');
  assert.equal(latestMonth([{ month: 'ديسمبر', date: '2025-12-01' }, { month: 'يناير', date: '2026-01-02' }]), 'يناير');
  assert.equal(latestMonth([]), null);
});

import { overviewStats, isLost, isDamaged } from '../src/lib/complaints.js';
test('overviewStats follows complaints-dashboard rules', () => {
  const r = decodeComplaints([
    { 'رقم الشكوى': 1, 'تاريخ الأضافة': '2026-10-01', 'تاريخ نتيجة التحقيق': '2026-10-04', 'تاريخ التعويض': '2026-10-05', 'تصنيف المشكلة': 'شحنه مفقوده', 'وظيفه المتحمل': 'الشركة', 'مبلغ التعويض المستحق': 500, 'حالة الشكوى الحاليه': 'تم قبول التعويض' },
    { 'رقم الشكوى': 2, 'تاريخ الأضافة': '2026-10-01', 'تاريخ نتيجة التحقيق': '2026-10-08', 'تاريخ التعويض': '2026-10-12', 'تصنيف المشكلة': 'شحنه هالكه', 'وظيفه المتحمل': 'مندوب', 'مبلغ التعويض المستحق': 200, 'حالة الشكوى الحاليه': 'تم رفض التعويض' },
    { 'رقم الشكوى': 3, 'تاريخ الأضافة': '2026-10-05', 'تصنيف المشكلة': 'مرتجع مفقوده', 'حالة الشكوى الحاليه': 'جارى التحقيق' },
    { 'رقم الشكوى': 4, 'تاريخ الأضافة': '2026-10-06', 'تصنيف المشكلة': 'تأخير', 'نتيجه مراجعة التعويض': 'معلقة', 'حالة الشكوى الحاليه': 'التعويض مسبقا' },
  ]);
  const s = overviewStats(r);
  assert.equal(s.total, 4); assert.equal(s.accepted, 1); assert.equal(s.rejected, 1); assert.equal(s.acceptRate, 50);
  assert.equal(s.investigating, 1); assert.equal(s.open, 2);
  assert.deepEqual([s.resSla.count, s.resSla.pct, s.resSla.avg], [2, 50, 5]);
  assert.deepEqual([s.compSla.count, s.compSla.pct, s.compSla.avg], [2, 50, 2.5]);
  assert.equal(s.amount, 700); assert.equal(s.companyAmount, 500); assert.equal(s.companyCount, 1);
  assert.deepEqual(s.lost, { count: 2, amount: 500 }); assert.deepEqual(s.damaged, { count: 1, amount: 200 });
  assert.equal(isLost(r[3]), false); assert.equal(isDamaged(r[0]), false);
});
