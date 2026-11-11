import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTodayActivityCapacity } from '../src/utils/dashboardAnalytics.ts';

test('today activity capacity sums open slots and ignores other dates and closed activities', () => {
  const capacity = getTodayActivityCapacity([
    { activity_date: '2026-11-10', status: 'planned', max_pax: 8, current_pax: 5 },
    { activity_date: '2026-11-10', status: 'in_water', max_pax: 4, current_pax: 4 },
    { activity_date: '2026-11-10', status: 'completed', max_pax: 6, current_pax: 2 },
    { activity_date: '2026-11-10', status: 'cancelled_weather', max_pax: 10, current_pax: 0 },
    { activity_date: '2026-11-11', status: 'planned', max_pax: 12, current_pax: 0 },
  ], '2026-11-10');

  assert.deepEqual(capacity, {
    activities: 2,
    totalSlots: 12,
    filledSlots: 9,
    remainingSlots: 3,
  });
});

test('today activity capacity clamps invalid and over-capacity counts and handles no activities', () => {
  assert.deepEqual(
    getTodayActivityCapacity([
      { activity_date: '2026-11-10', status: 'planned', max_pax: 4, current_pax: 7 },
      { activity_date: '2026-11-10', status: 'planned', max_pax: -2, current_pax: 1 },
    ], '2026-11-10'),
    { activities: 2, totalSlots: 4, filledSlots: 4, remainingSlots: 0 },
  );
  assert.deepEqual(getTodayActivityCapacity([], '2026-11-10'), {
    activities: 0,
    totalSlots: 0,
    filledSlots: 0,
    remainingSlots: 0,
  });
});
