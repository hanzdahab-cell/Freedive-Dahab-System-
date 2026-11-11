import { DailyActivity } from '../types';

export interface TodayActivityCapacity {
  activities: number;
  totalSlots: number;
  filledSlots: number;
  remainingSlots: number;
}

type CapacityActivity = Pick<DailyActivity, 'activity_date' | 'status' | 'max_pax' | 'current_pax'>;

export function getTodayActivityCapacity(
  activities: CapacityActivity[],
  today: string,
): TodayActivityCapacity {
  const activeActivities = activities.filter(
    (activity) =>
      activity.activity_date === today &&
      activity.status !== 'completed' &&
      activity.status !== 'cancelled_weather',
  );
  const totalSlots = activeActivities.reduce(
    (total, activity) => total + Math.max(0, Number.isFinite(activity.max_pax) ? activity.max_pax : 0),
    0,
  );
  const filledSlots = activeActivities.reduce((total, activity) => {
    const capacity = Math.max(0, Number.isFinite(activity.max_pax) ? activity.max_pax : 0);
    const participants = Number.isFinite(activity.current_pax) ? activity.current_pax : 0;
    return total + Math.min(capacity, Math.max(0, participants));
  }, 0);

  return {
    activities: activeActivities.length,
    totalSlots,
    filledSlots,
    remainingSlots: Math.max(0, totalSlots - filledSlots),
  };
}
