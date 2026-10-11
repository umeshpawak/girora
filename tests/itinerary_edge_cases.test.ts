import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCostField,
  validateItineraryOutput,
  formatItineraryMarkdown,
} from '../app/api/itinerary/validator.ts';

test('Cost Field Parser: never silently coerces missing or invalid cost fields to zero', () => {
  // Missing or non-numeric must return null
  assert.equal(parseCostField(undefined, false), null);
  assert.equal(parseCostField(null, false), null);
  assert.equal(parseCostField('cheap', false), null);
  assert.equal(parseCostField(NaN, false), null);

  // Negative values must return null
  assert.equal(parseCostField(-100, true), null);
  assert.equal(parseCostField(-50, false), null);

  // Zero allowed only when explicitly specified
  assert.equal(parseCostField(0, false), null);
  assert.equal(parseCostField(0, true), 0);

  // Valid positive values
  assert.equal(parseCostField(1200, false), 1200);
  assert.equal(parseCostField('1800', false), 1800);
});

test('Regression: Rejects output containing wrong destination (Manali vs Rishikesh)', () => {
  const invalidOutput = {
    destination: 'Rishikesh',
    duration_days: 3,
    costs: {
      travel_to_destination_round_trip: 1200,
      accommodation_total: 2400,
      meals_total: 1500,
      activities_total: 600,
      local_transport_total: 500,
    },
    days: [
      { day: 1, title: 'Arrival', activities: ['Arrive in Rishikesh and visit Laxman Jhula'] },
      { day: 2, title: 'Ghats', activities: ['Morning walk along Ganga ghats'] },
      { day: 3, title: 'Departure', activities: ['Cafes and return'] },
    ],
  };

  const result = validateItineraryOutput(invalidOutput, 'Manali', 3, true);
  assert.equal(result.ok, false);
  if (!result.ok) {
    const errorString = result.errors.join(' ');
    assert.ok(
      errorString.includes('does not match requested destination') ||
      errorString.includes('Rishikesh'),
      'Must flag mismatched destination or Rishikesh contamination'
    );
  }

  // Also test when destination field says Manali but day activities contain Rishikesh contamination
  const contaminatedOutput = {
    destination: 'Manali',
    duration_days: 1,
    costs: {
      travel_to_destination_round_trip: 1000,
      accommodation_total: 0,
      meals_total: 500,
      activities_total: 200,
      local_transport_total: 200,
    },
    days: [
      { day: 1, title: 'Manali Trip', activities: ['Take bus to Rishikesh and visit Ram Jhula'] },
    ],
  };

  const contamResult = validateItineraryOutput(contaminatedOutput, 'Manali', 1, true);
  assert.equal(contamResult.ok, false);
  if (!contamResult.ok) {
    assert.ok(contamResult.errors.some((e) => e.includes('Rishikesh')));
  }
});

test('Regression: Rejects output with extra days (1 day requested, multiple days returned)', () => {
  const extraDaysOutput = {
    destination: 'Manali',
    duration_days: 1,
    costs: {
      travel_to_destination_round_trip: 1000,
      accommodation_total: 0,
      meals_total: 500,
      activities_total: 200,
      local_transport_total: 200,
    },
    days: [
      { day: 1, title: 'Day 1 Arrival', activities: ['Visit Mall Road'] },
      { day: 2, title: 'Day 2 Solang Valley', activities: ['Day trip to Solang Valley'] },
    ],
  };

  const result = validateItineraryOutput(extraDaysOutput, 'Manali', 1, true);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.errors.some((e) => e.includes('Expected exactly 1 day(s)')),
      'Must reject extra day objects'
    );
  }
});

test('Regression: Rejects 1-day trip with overnight accommodation', () => {
  const overnightDayTrip = {
    destination: 'Jaipur',
    duration_days: 1,
    costs: {
      travel_to_destination_round_trip: 800,
      accommodation_total: 1200,
      meals_total: 400,
      activities_total: 200,
      local_transport_total: 200,
    },
    days: [
      { day: 1, title: 'Day Outing', activities: ['Sightseeing and check in for the night at hotel'] },
    ],
  };

  const result = validateItineraryOutput(overnightDayTrip, 'Jaipur', 1, true);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.errors.some((e) => e.includes('overnight accommodation')),
      'Must reject overnight accommodation on a 1-day trip'
    );
  }
});

test('Regression: Conflicting totals are eliminated (TypeScript sum is sole source of truth)', () => {
  const modelWithBogusTotal = {
    destination: 'Manali',
    duration_days: 2,
    total: 1570, // Bogus hallucinated model total
    costs: {
      travel_to_destination_round_trip: 1200,
      accommodation_total: 1500,
      meals_total: 1000,
      activities_total: 400,
      local_transport_total: 300,
    },
    days: [
      { day: 1, title: 'Arrival & Old Manali', activities: ['Explore Hadimba temple', 'Walk in pine forest'] },
      { day: 2, title: 'Vashisht & Cafes', activities: ['Hot springs and local cafe hopping'] },
    ],
  };

  const result = validateItineraryOutput(modelWithBogusTotal, 'Manali', 2, true);
  assert.equal(result.ok, true);
  if (result.ok) {
    // Expected TS sum: 1200 + 1500 + 1000 + 400 + 300 = 4400
    assert.equal(result.totalEstimate, 4400, 'TypeScript sum must be strictly 4400');
    assert.notEqual(result.totalEstimate, 1570, 'Must ignore model-provided bogus total');

    // Markdown generated from validated days must NOT contain conflicting totals
    const md = formatItineraryMarkdown('Manali', result.days);
    assert.equal(md.includes('1570'), false, 'Markdown must not contain conflicting total');
    assert.equal(md.includes('Total'), false, 'Markdown must not contain budget breakdown');
    assert.ok(md.includes('### Day 1: Arrival & Old Manali'));
    assert.ok(md.includes('### Day 2: Vashisht & Cafes'));
  }
});

test('Regression: Rejects missing cost fields (never silently replaced with zero)', () => {
  const missingMeals = {
    destination: 'Manali',
    duration_days: 2,
    costs: {
      travel_to_destination_round_trip: 1200,
      accommodation_total: 1500,
      // meals_total omitted
      activities_total: 400,
      local_transport_total: 300,
    },
    days: [
      { day: 1, title: 'Day 1', activities: ['Explore town'] },
      { day: 2, title: 'Day 2', activities: ['Scenic viewpoint'] },
    ],
  };

  const result1 = validateItineraryOutput(missingMeals, 'Manali', 2, true);
  assert.equal(result1.ok, false);
  if (!result1.ok) {
    assert.ok(result1.errors.some((e) => e.includes('meals_total')));
  }

  const missingAccomMultiDay = {
    destination: 'Manali',
    duration_days: 3,
    costs: {
      travel_to_destination_round_trip: 1200,
      // accommodation_total omitted
      meals_total: 1200,
      activities_total: 400,
      local_transport_total: 300,
    },
    days: [
      { day: 1, title: 'Day 1', activities: ['Explore'] },
      { day: 2, title: 'Day 2', activities: ['Trek'] },
      { day: 3, title: 'Day 3', activities: ['Market'] },
    ],
  };

  const result2 = validateItineraryOutput(missingAccomMultiDay, 'Manali', 3, true);
  assert.equal(result2.ok, false);
  if (!result2.ok) {
    assert.ok(result2.errors.some((e) => e.includes('accommodation_total')));
  }
});

test('Valid 1-day trip correctly validated and sets accommodation to 0', () => {
  const validOneDay = {
    destination: 'Agra',
    duration_days: 1,
    costs: {
      travel_to_destination_round_trip: 600,
      accommodation_total: 0,
      meals_total: 400,
      activities_total: 300,
      local_transport_total: 200,
    },
    days: [
      { day: 1, title: 'Day Excursion to Agra', activities: ['Morning express train from Delhi', 'Taj Mahal visit', 'Mehtab Bagh sunset and evening return'] },
    ],
  };

  const result = validateItineraryOutput(validOneDay, 'Agra', 1, true);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.days.length, 1);
    assert.equal(result.accommodation, 0);
    assert.equal(result.accommodationNeeded, false);
    assert.equal(result.totalEstimate, 600 + 0 + 400 + 300 + 200);
  }
});

test('Regression: Multi-day trip validates all cost components and requires exact day count', () => {
  const validMultiDay = {
    destination: 'Udaipur',
    duration_days: 3,
    costs: {
      travel_to_destination_round_trip: 2200,
      accommodation_total: 3600,
      meals_total: 2100,
      activities_total: 900,
      local_transport_total: 600,
    },
    days: [
      { day: 1, title: 'Lakes & City Palace', activities: ['Morning City Palace tour', 'Sunset boat ride on Lake Pichola'] },
      { day: 2, title: 'Monsoon Palace & Ghats', activities: ['Sajjangarh panoramic view', 'Ambrai Ghat dinner'] },
      { day: 3, title: 'Old City & Bazaars', activities: ['Jagdish Temple visit', 'Artisan shopping at Hathi Pol'] },
    ],
  };

  // Valid 3-day trip
  const result = validateItineraryOutput(validMultiDay, 'Udaipur', 3, true);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.days.length, 3, 'Must have exactly 3 days');
    assert.equal(result.totalEstimate, 2200 + 3600 + 2100 + 900 + 600);
    assert.equal(result.accommodationNeeded, true);
  }

  // Reject when duration is requested as 4 days but payload only contains 3 days
  const mismatchResult = validateItineraryOutput(validMultiDay, 'Udaipur', 4, true);
  assert.equal(mismatchResult.ok, false);
  if (!mismatchResult.ok) {
    assert.ok(
      mismatchResult.errors.some((e) => e.includes('Expected exactly 4 day(s)')),
      'Must reject mismatched day count'
    );
  }
});

test('Regression: Markdown formatter sanitizes activity text and never displays prices or conflicting totals', () => {
  const daysWithPrices = [
    {
      day: 1,
      title: 'City Tour',
      activities: [
        'Visit Palace (Cost: ₹500)',
        'Local market walk (approx. ₹200)',
        'Evening sunset viewpoint',
      ],
      travelTip: 'Carry cash for small vendors (approx. ₹100).',
    },
  ];

  const md = formatItineraryMarkdown('Jaipur', daysWithPrices);
  assert.equal(md.includes('₹500'), false, 'Prices must be stripped from activity text');
  assert.equal(md.includes('₹200'), false, 'Approximate prices must be stripped');
  assert.equal(md.includes('₹100'), false, 'Prices must be stripped from travel tip');
  assert.ok(md.includes('Visit Palace'));
  assert.ok(md.includes('Local market walk'));
  assert.ok(md.includes('Evening sunset viewpoint'));
  assert.ok(md.includes('💡 Local Tip:'));
  assert.equal(md.includes('Total'), false, 'Markdown must never contain budget summary or total');
});

test('Regression: Destination consistency strictly prevents cross-city contamination', () => {
  const contaminated = {
    destination: 'Udaipur',
    duration_days: 2,
    costs: {
      travel_to_destination_round_trip: 1500,
      accommodation_total: 2000,
      meals_total: 1000,
      activities_total: 500,
      local_transport_total: 400,
    },
    days: [
      { day: 1, title: 'Arrival', activities: ['Morning City Palace tour', 'Afternoon bus to Haridwar for evening ghats'] },
      { day: 2, title: 'Departure', activities: ['Morning walk', 'Departure'] },
    ],
  };

  const res = validateItineraryOutput(contaminated, 'Udaipur', 2, true);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.ok(
      res.errors.some((e) => e.includes('Haridwar')),
      'Must reject output containing unrelated transit location Haridwar'
    );
  }
});

test('Regression: Cost totals strictly calculated in TypeScript and ignore AI model total', () => {
  const bogusModelTotal = {
    destination: 'Goa',
    duration_days: 2,
    total: 99999, // Bogus hallucinated total
    costs: {
      travel_to_destination_round_trip: 2000,
      accommodation_total: 2500,
      meals_total: 1600,
      activities_total: 800,
      local_transport_total: 600,
    },
    days: [
      { day: 1, title: 'North Goa', activities: ['Morning: Fort Aguada', 'Afternoon: Anjuna Beach', 'Evening: Local seafood dinner'] },
      { day: 2, title: 'South Goa', activities: ['Morning: Old Goa Churches', 'Afternoon: Spice plantation walk', 'Evening: Sunset at Palolem'] },
    ],
  };

  const res = validateItineraryOutput(bogusModelTotal, 'Goa', 2, true);
  assert.equal(res.ok, true);
  if (res.ok) {
    // 2000 + 2500 + 1600 + 800 + 600 = 7500
    assert.equal(res.totalEstimate, 7500);
    assert.notEqual(res.totalEstimate, 99999);
    assert.equal(res.isAccommodationIncluded, false);
    assert.equal(res.accommodationNeeded, true);
    assert.equal(res.days.length, 2);
  }
});
