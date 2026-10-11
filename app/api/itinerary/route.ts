import { NextResponse } from 'next/server';
import {
  validateItineraryOutput,
  formatItineraryMarkdown,
  DayPlan,
} from './validator';

export interface ClientCosts {
  travel: number;
  accommodation: number;
  meals: number;
  activities: number;
  localTransport: number;
  total: number;
  isAccommodationIncluded: boolean;
  accommodationNeeded: boolean;
}

export interface AltResult {
  title: string;
  why_cheaper: string;
  totalCost: number;
  costs: {
    travel: number;
    accommodation: number;
    meals: number;
    activities: number;
    localTransport: number;
  };
  exceedsBudget: boolean;
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callOllama(prompt: string, signal: AbortSignal): Promise<string> {
  const ollamaRes = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma3:1b',
      prompt,
      format: 'json',
      stream: false,
      options: {
        num_predict: 1400,
        temperature: 0.3,
        repeat_penalty: 1.1,
      },
    }),
    signal,
  });

  if (!ollamaRes.ok) {
    let msg = `AI service returned error (${ollamaRes.status})`;
    try {
      const errBody = (await ollamaRes.json()) as { error?: unknown };
      if (typeof errBody?.error === 'string' && errBody.error.trim()) {
        msg = errBody.error.trim();
      }
    } catch {
      // ignore parse error
    }
    throw new Error(msg);
  }

  const raw = (await ollamaRes.json()) as { response?: unknown; error?: unknown };
  if (typeof raw?.error === 'string' && raw.error.trim()) {
    throw new Error(`Ollama model error: ${raw.error.trim()}`);
  }
  if (!raw || typeof raw.response !== 'string' || !raw.response.trim()) {
    throw new Error('AI model returned an empty response. Please try again.');
  }

  return raw.response;
}

function ensureDetailedDayPlan(days: DayPlan[], destination: string): DayPlan[] {
  const defaultTips = [
    `Start early to beat peak crowds at popular attractions in ${destination}.`,
    `Use verified local transport or walking routes for convenient transit.`,
    `Carry a reusable water bottle and modest attire for local cultural spots.`,
  ];

  return days.map((day, idx) => {
    let activities = [...day.activities];

    if (activities.length > 3) {
      activities = activities.slice(0, 3);
    } else if (activities.length === 2) {
      const hasEvening = activities.some((a) => /evening|night|sunset/i.test(a));
      if (!hasEvening) {
        activities.push(`Evening: Sunset stroll and authentic local dining in ${destination}`);
      }
    } else if (activities.length === 1) {
      const first = activities[0];
      activities = [
        first.toLowerCase().startsWith('morning') ? first : `Morning: ${first}`,
        `Afternoon: Explore local heritage sites and artisan markets in ${destination}`,
        `Evening: Sunset walk and authentic regional dinner in ${destination}`,
      ];
    } else if (activities.length === 0) {
      activities = [
        `Morning: Visit iconic landmarks and heritage sites in ${destination}`,
        `Afternoon: Explore local viewpoints and traditional bazaars in ${destination}`,
        `Evening: Relaxed sunset walk and regional cuisine in ${destination}`,
      ];
    }

    activities = activities.map((act, actIdx) => {
      const trimmed = act.trim();
      if (/^(morning|afternoon|evening|night):/i.test(trimmed)) {
        return trimmed;
      }
      const label = actIdx === 0 ? 'Morning: ' : actIdx === 1 ? 'Afternoon: ' : 'Evening: ';
      return `${label}${trimmed}`;
    });

    const travelTip = day.travelTip && day.travelTip.trim().length > 0
      ? day.travelTip.trim()
      : defaultTips[idx % defaultTips.length];

    return {
      ...day,
      day: day.day || idx + 1,
      activities: activities.slice(0, 3),
      travelTip,
    };
  });
}

function generateRealisticAlternatives(
  origin: string,
  destination: string,
  duration: number,
  budget: number,
  baseCosts: ClientCosts
): AltResult[] {
  const isOneDay = duration === 1;
  const shorterDays = Math.max(1, duration - 1);

  // 1. Shorter duration option (if multi-day) or public transit day excursion
  const alt1Duration = isOneDay ? 1 : shorterDays;
  const alt1Travel = Math.round(baseCosts.travel * 0.9);
  const alt1Accom = isOneDay ? 0 : Math.round((baseCosts.accommodation / duration) * alt1Duration * 0.85);
  const alt1Meals = Math.round((baseCosts.meals / duration) * alt1Duration * 0.8);
  const alt1Act = Math.round((baseCosts.activities / duration) * alt1Duration * 0.7);
  const alt1Local = Math.round((baseCosts.localTransport / duration) * alt1Duration * 0.8);
  const alt1Total = alt1Travel + alt1Accom + alt1Meals + alt1Act + alt1Local;

  // 2. Budget homestay & public transit
  const alt2Travel = Math.max(0, Math.round(baseCosts.travel * 0.6));
  const alt2Accom = isOneDay ? 0 : Math.max(400 * duration, Math.round(baseCosts.accommodation * 0.5));
  const alt2Meals = Math.max(250 * duration, Math.round(baseCosts.meals * 0.6));
  const alt2Act = Math.max(150 * duration, Math.round(baseCosts.activities * 0.5));
  const alt2Local = Math.max(100 * duration, Math.round(baseCosts.localTransport * 0.5));
  const alt2Total = alt2Travel + alt2Accom + alt2Meals + alt2Act + alt2Local;

  // 3. Nearby weekend getaway
  const alt3Travel = Math.max(0, Math.round(baseCosts.travel * 0.4));
  const alt3Accom = isOneDay ? 0 : Math.max(350 * duration, Math.round(baseCosts.accommodation * 0.45));
  const alt3Meals = Math.max(200 * duration, Math.round(baseCosts.meals * 0.5));
  const alt3Act = Math.max(100 * duration, Math.round(baseCosts.activities * 0.4));
  const alt3Local = Math.max(80 * duration, Math.round(baseCosts.localTransport * 0.4));
  const alt3Total = alt3Travel + alt3Accom + alt3Meals + alt3Act + alt3Local;

  return [
    {
      title: isOneDay
        ? `Day Excursion with Public Transit`
        : `${alt1Duration}-Day Shorter Trip to ${destination}`,
      why_cheaper: isOneDay
        ? 'Using regional trains or state buses substantially reduces travel expenses.'
        : `Reducing duration by ${duration - alt1Duration} day(s) lowers accommodation and daily expenses.`,
      totalCost: alt1Total,
      costs: {
        travel: alt1Travel,
        accommodation: alt1Accom,
        meals: alt1Meals,
        activities: alt1Act,
        localTransport: alt1Local,
      },
      exceedsBudget: alt1Total > budget,
    },
    {
      title: `Budget Homestay & Shared Transit in ${destination}`,
      why_cheaper: 'Staying in community homestays and using shared jeeps or walking tours cuts major costs.',
      totalCost: alt2Total,
      costs: {
        travel: alt2Travel,
        accommodation: alt2Accom,
        meals: alt2Meals,
        activities: alt2Act,
        localTransport: alt2Local,
      },
      exceedsBudget: alt2Total > budget,
    },
    {
      title: `Closer Nature & Heritage Getaway near ${origin || 'your city'}`,
      why_cheaper: 'Choosing a destination closer to home eliminates long-distance transit costs while keeping the adventure.',
      totalCost: alt3Total,
      costs: {
        travel: alt3Travel,
        accommodation: alt3Accom,
        meals: alt3Meals,
        activities: alt3Act,
        localTransport: alt3Local,
      },
      exceedsBudget: alt3Total > budget,
    },
  ];
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Request body must be a JSON object' },
        { status: 400 }
      );
    }

    const { origin, destination, duration, budget } = body as Record<string, unknown>;

    // 1. Validate destination
    if (typeof destination !== 'string' || destination.trim().length === 0) {
      return NextResponse.json(
        { error: 'Destination is required' },
        { status: 400 }
      );
    }
    const cleanDestination = destination.trim();

    // 2. Validate duration
    const numDuration = Number(duration);
    if (!Number.isFinite(numDuration) || !Number.isInteger(numDuration) || numDuration <= 0) {
      return NextResponse.json(
        { error: 'Duration must be a positive whole number of days' },
        { status: 400 }
      );
    }
    if (numDuration > 30) {
      return NextResponse.json(
        { error: 'Duration must not exceed 30 days' },
        { status: 400 }
      );
    }

    // 3. Validate budget
    const numBudget = Number(budget);
    if (!Number.isFinite(numBudget) || numBudget <= 0) {
      return NextResponse.json(
        { error: 'Budget must be a positive number' },
        { status: 400 }
      );
    }

    const cleanOrigin = typeof origin === 'string' && origin.trim().length > 0 ? origin.trim() : '';

    // Realistic floor check
    const absoluteMinCost = 450 * numDuration + (cleanOrigin ? 400 : 0);
    const isExtremelyUnrealisticBudget = numBudget < absoluteMinCost;

    const dayStructureDesc = Array.from({ length: numDuration }, (_, i) =>
      `{"day": ${i + 1}, "title": "Day ${i + 1} in ${cleanDestination}", "activities": ["Morning: Explore local heritage sites and viewpoints", "Afternoon: Visit traditional markets and regional food spots", "Evening: Relax with sunset viewpoints and authentic dinner"], "travel_tip": "Start early to avoid peak crowds and keep cash handy for local transit."}`
    ).join(',\n    ');

    const itineraryPrompt = `You are a realistic travel planner. Respond ONLY with a single valid JSON object — no markdown, no extra text.

Create a concise, practical ${numDuration}-day itinerary for a trip to "${cleanDestination}"${cleanOrigin ? ` starting from "${cleanOrigin}"` : ''}.

RULES:
- destination field MUST be exactly "${cleanDestination}".
- duration_days field MUST be exactly ${numDuration}.
- The "days" array MUST have EXACTLY ${numDuration} object(s), numbered day 1 through ${numDuration}. ${numDuration === 1 ? 'There is only 1 day: do NOT include Day 2 or Day 3.' : ''}
- For each day, include a short morning, afternoon, and evening plan with 2 to 3 practical activities and brief descriptions.
- Include a useful, brief local travel tip in "travel_tip" for each day.
- Sights and practical experiences only: NO prices or cost figures inside activity text or travel tips.
- ${numDuration === 1 ? 'This is a 1-day trip: set accommodation_total to 0. No overnight stays.' : 'Multi-day trip: set accommodation_total to realistic INR (₹800–₹2500 per night).'}
- All costs must go in the "costs" object as realistic positive INR integers.
- Do NOT mention unrelated cities or destinations.

Output this JSON structure filled in:
{
  "destination": "${cleanDestination}",
  "duration_days": ${numDuration},
  "costs": {
    "travel_to_destination_round_trip": ${cleanOrigin ? 1200 : 0},
    "accommodation_total": ${numDuration === 1 ? 0 : 1500 * (numDuration - 1)},
    "meals_total": ${500 * numDuration},
    "activities_total": ${300 * numDuration},
    "local_transport_total": ${200 * numDuration}
  },
  "is_accommodation_included": ${numDuration > 1 ? 'true' : 'false'},
  "days": [
    ${dayStructureDesc}
  ]
}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 75000);

    let validationResult;
    try {
      // First attempt
      let rawText = '';
      let parsedJson: unknown = null;
      try {
        rawText = await callOllama(itineraryPrompt, controller.signal);
        parsedJson = extractJson(rawText);
      } catch (firstErr) {
        console.warn('Initial Ollama call error, will retry once:', firstErr);
      }

      validationResult = validateItineraryOutput(
        parsedJson,
        cleanDestination,
        numDuration,
        Boolean(cleanOrigin)
      );

      // Retry invalid output once with clear skeleton
      if (!validationResult.ok) {
        console.warn('Initial itinerary validation failed, retrying once:', validationResult.errors);

        const correctionPrompt = `You must output valid JSON only. Previous attempt had errors: ${validationResult.errors.join('; ')}.

Fix and output exactly this JSON (replace sample numbers with realistic positive integers):
{
  "destination": "${cleanDestination}",
  "duration_days": ${numDuration},
  "costs": {
    "travel_to_destination_round_trip": ${cleanOrigin ? 1200 : 0},
    "accommodation_total": ${numDuration === 1 ? 0 : 1500 * (numDuration - 1)},
    "meals_total": ${500 * numDuration},
    "activities_total": ${300 * numDuration},
    "local_transport_total": ${200 * numDuration}
  },
  "is_accommodation_included": ${numDuration > 1 ? 'true' : 'false'},
  "days": [
    ${Array.from({ length: numDuration }, (_, i) =>
      `{"day": ${i + 1}, "title": "Day ${i + 1} in ${cleanDestination}", "activities": ["Morning: Explore local heritage landmarks", "Afternoon: Visit traditional markets and cultural spots", "Evening: Scenic sunset viewpoint and regional dinner"], "travel_tip": "Keep modest attire handy for cultural landmarks and carry a refillable water bottle."}`
    ).join(',\n    ')}
  ]
}
Rules: destination must be "${cleanDestination}". days array must have EXACTLY ${numDuration} item(s). Each day must have 2 to 3 activities for Morning, Afternoon, Evening. No prices in activity text.`;

        const retryRaw = await callOllama(correctionPrompt, controller.signal);
        parsedJson = extractJson(retryRaw);

        validationResult = validateItineraryOutput(
          parsedJson,
          cleanDestination,
          numDuration,
          Boolean(cleanOrigin)
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return NextResponse.json(
          { error: 'AI request timed out. Please try again.' },
          { status: 504 }
        );
      }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json(
        { error: `AI service error: ${msg}` },
        { status: 503 }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // If still invalid after 1 retry, return a friendly error
    if (!validationResult.ok) {
      return NextResponse.json(
        {
          error: `Unable to generate a reliable itinerary for ${cleanDestination} right now. Please try again in a moment.`,
        },
        { status: 502 }
      );
    }

    const {
      travel,
      accommodation,
      meals,
      activities,
      localTransport,
      totalEstimate,
      isAccommodationIncluded,
      accommodationNeeded,
      days,
    } = validationResult;

    // Ensure 2 to 3 activities per day with practical morning, afternoon, and evening coverage
    const finalizedDays = ensureDetailedDayPlan(days, cleanDestination);

    const overageAmount = totalEstimate - numBudget;
    const overagePct = Math.round((overageAmount / numBudget) * 100);

    const isHardlyAffordable = totalEstimate > numBudget * 1.1 || isExtremelyUnrealisticBudget;
    const isExtremelyUnrealistic = numBudget < totalEstimate * 0.5 || isExtremelyUnrealisticBudget;

    // All totals calculated strictly in TypeScript — never trust or render AI totals
    const costsPayload: ClientCosts = {
      travel,
      accommodation,
      meals,
      activities,
      localTransport,
      total: totalEstimate,
      isAccommodationIncluded,
      accommodationNeeded,
    };

    if (isHardlyAffordable) {
      // Over budget: do not return full itinerary, return validated costs and alternatives
      const alternatives = generateRealisticAlternatives(
        cleanOrigin,
        cleanDestination,
        numDuration,
        numBudget,
        costsPayload
      );

      return NextResponse.json({
        insufficientBudget: true,
        isExtremelyUnrealistic,
        overageAmount: Math.max(overageAmount, totalEstimate - numBudget),
        overagePct: Math.max(overagePct, Math.round(((totalEstimate - numBudget) / numBudget) * 100)),
        costs: costsPayload,
        hasOrigin: Boolean(cleanOrigin),
        alternatives,
      });
    }

    const slightOverage = totalEstimate > numBudget;

    // Render markdown itinerary exclusively from validated days without any AI totals
    const formattedMarkdown = formatItineraryMarkdown(cleanDestination, finalizedDays);

    return NextResponse.json({
      insufficientBudget: false,
      slightOverage,
      overageAmount: slightOverage ? overageAmount : 0,
      overagePct: slightOverage ? overagePct : 0,
      costs: costsPayload,
      hasOrigin: Boolean(cleanOrigin),
      days: finalizedDays,
      itinerary_markdown: formattedMarkdown,
    });
  } catch (error) {
    console.error('Error generating itinerary:', error);
    return NextResponse.json(
      { error: 'An unexpected internal error occurred while generating the itinerary.' },
      { status: 500 }
    );
  }
}
