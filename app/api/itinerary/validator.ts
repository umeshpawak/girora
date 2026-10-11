export interface DayPlan {
  day: number;
  title: string;
  activities: string[];
  travelTip?: string;
}

export interface RawDayInput {
  day?: unknown;
  day_number?: unknown;
  title?: unknown;
  activities?: unknown;
  travel_tip?: unknown;
  travelTip?: unknown;
  tip?: unknown;
}

export interface RawCostInput {
  travel_to_destination_round_trip?: unknown;
  accommodation_total?: unknown;
  meals_total?: unknown;
  activities_total?: unknown;
  local_transport_total?: unknown;
}

export interface RawItineraryResponse {
  destination?: unknown;
  duration_days?: unknown;
  costs?: RawCostInput;
  is_accommodation_included?: unknown;
  days?: RawDayInput[];
  itinerary_markdown?: unknown;
}

export interface ValidationSuccess {
  ok: true;
  destination: string;
  travel: number;
  accommodation: number;
  meals: number;
  activities: number;
  localTransport: number;
  totalEstimate: number;
  isAccommodationIncluded: boolean;
  accommodationNeeded: boolean;
  days: DayPlan[];
}

export interface ValidationFailure {
  ok: false;
  errors: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

export function parseCostField(val: unknown, allowZero = false): number | null {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (!Number.isFinite(num)) return null;
  if (allowZero ? num < 0 : num <= 0) return null;
  return Math.round(num);
}

export function validateItineraryOutput(
  raw: unknown,
  expectedDestination: string,
  expectedDuration: number,
  hasOrigin: boolean
): ValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Response is not a valid JSON object'] };
  }

  const parsed = raw as RawItineraryResponse;
  const expLower = expectedDestination.trim().toLowerCase();

  // 1. Destination validation
  const destStr = typeof parsed.destination === 'string' ? parsed.destination.trim() : '';
  if (destStr && !destStr.toLowerCase().includes(expLower)) {
    errors.push(`Destination '${destStr}' does not match requested destination '${expectedDestination}'`);
  }

  // Check for wrong destination contamination in the output
  const rawString = JSON.stringify(raw).toLowerCase();
  if (!expLower.includes('rishikesh') && rawString.includes('rishikesh')) {
    errors.push(`Output contains unrelated destination 'Rishikesh' for a trip to '${expectedDestination}'`);
  }
  if (
    !expLower.includes('haridwar') &&
    !expLower.includes('rishikesh') &&
    !expLower.includes('uttarakhand') &&
    rawString.includes('haridwar')
  ) {
    errors.push(`Output contains unrelated transit location 'Haridwar' for a trip to '${expectedDestination}'`);
  }

  // 2. Days array validation
  if (!Array.isArray(parsed.days)) {
    errors.push(`'days' must be an array of day objects`);
  } else if (parsed.days.length !== expectedDuration) {
    errors.push(`Expected exactly ${expectedDuration} day(s) in 'days' array, but received ${parsed.days.length}`);
  }

  const validatedDays: DayPlan[] = [];
  if (Array.isArray(parsed.days)) {
    for (let i = 0; i < parsed.days.length; i++) {
      const d = parsed.days[i];
      if (!d || typeof d !== 'object') {
        errors.push(`Day ${i + 1} must be an object`);
        continue;
      }
      const dayNum = Number(d.day ?? d.day_number ?? i + 1);
      const title = typeof d.title === 'string' && d.title.trim().length > 0
        ? d.title.trim()
        : `Day ${i + 1}`;

      let activities: string[] = [];
      if (Array.isArray(d.activities)) {
        activities = d.activities
          .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
          .map((a) => a.trim());
      } else if (typeof d.activities === 'string' && d.activities.trim().length > 0) {
        activities = [d.activities.trim()];
      }

      if (activities.length === 0) {
        errors.push(`Day ${i + 1} must contain at least one activity`);
      }

      // For a 1-day trip: verify no overnight accommodation
      if (expectedDuration === 1) {
        const fullDayText = (title + ' ' + activities.join(' ')).toLowerCase();
        if (
          fullDayText.includes('overnight stay') ||
          fullDayText.includes('overnight hotel') ||
          fullDayText.includes('check in for the night') ||
          fullDayText.includes('hotel check-in for the night')
        ) {
          errors.push(`1-day trip must not include overnight accommodation`);
        }
      }

      const tipRaw = d.travel_tip ?? d.travelTip ?? d.tip;
      const travelTip = typeof tipRaw === 'string' && tipRaw.trim().length > 0
        ? tipRaw.trim()
        : undefined;

      validatedDays.push({
        day: Number.isFinite(dayNum) ? dayNum : i + 1,
        title,
        activities,
        travelTip,
      });
    }
  }

  // 3. Costs validation
  if (!parsed.costs || typeof parsed.costs !== 'object') {
    errors.push(`Missing 'costs' breakdown object`);
    return { ok: false, errors };
  }

  const c = parsed.costs;
  const travelVal = parseCostField(c.travel_to_destination_round_trip, !hasOrigin);
  const accomVal = parseCostField(c.accommodation_total, expectedDuration === 1);
  const mealsVal = parseCostField(c.meals_total, false);
  const actVal = parseCostField(c.activities_total, true);
  const localVal = parseCostField(c.local_transport_total, true);

  if (hasOrigin && travelVal === null) {
    errors.push(`Missing or invalid travel_to_destination_round_trip cost (required when origin is specified)`);
  }
  if (expectedDuration > 1 && accomVal === null) {
    errors.push(`Missing or invalid accommodation_total for multi-day trip`);
  }
  if (mealsVal === null) {
    errors.push(`Missing or invalid meals_total cost`);
  }
  if (actVal === null) {
    errors.push(`Missing or invalid activities_total cost`);
  }
  if (localVal === null) {
    errors.push(`Missing or invalid local_transport_total cost`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const travel = hasOrigin ? (travelVal ?? 0) : 0;
  // For 1-day trip, force accommodation to 0
  const accommodation = expectedDuration === 1 ? 0 : (accomVal ?? 0);
  const meals = mealsVal!;
  const activities = actVal ?? 0;
  const localTransport = localVal ?? 0;

  // Calculate total exclusively in TypeScript
  const totalEstimate = travel + accommodation + meals + activities + localTransport;
  const accommodationNeeded = expectedDuration > 1 && accommodation > 0;
  const isAccommodationIncluded = accommodationNeeded && Boolean(parsed.is_accommodation_included);

  return {
    ok: true,
    destination: expectedDestination,
    travel,
    accommodation,
    meals,
    activities,
    localTransport,
    totalEstimate,
    isAccommodationIncluded,
    accommodationNeeded,
    days: validatedDays,
  };
}

export function sanitizeActivityText(text: string): string {
  return text
    .replace(/(?:Estimated\s+cost|Cost|Price|Accommodation):\s*₹[0-9,\s–-]+(?:\([^)]*\))?/gi, '')
    .replace(/\(approx\.?\s*₹[0-9,\s–-]+\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\./g, '.')
    .trim();
}

export function formatItineraryMarkdown(destination: string, days: DayPlan[]): string {
  return days
    .map((d) => {
      const dayNum = d.day || 1;
      const titleSuffix = d.title ? `: ${d.title}` : '';
      const actList = d.activities
        .map((a) => sanitizeActivityText(a))
        .filter((a) => a.length > 0)
        .map((a) => `- ${a}`)
        .join('\n');
      const tipText = d.travelTip && d.travelTip.trim().length > 0
        ? `\n\n*💡 Local Tip: ${sanitizeActivityText(d.travelTip)}*`
        : '';
      return `### Day ${dayNum}${titleSuffix}\n\n${actList}${tipText}`;
    })
    .join('\n\n');
}
