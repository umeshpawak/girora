import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:3000/api/itinerary';

test('Input Validation: Malformed JSON request body returns 400', async () => {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'this is not valid json',
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, 'Invalid JSON request body');
});

test('Input Validation: Missing destination returns 400', async () => {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration: 3, budget: 5000 }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, 'Destination is required');
});

test('Input Validation: Empty whitespace destination returns 400', async () => {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination: '   ', duration: 3, budget: 5000 }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, 'Destination is required');
});

test('Input Validation: Zero, negative, non-integer, or >30 duration returns 400', async () => {
  const testCases = [
    { duration: 0, msg: 'Duration must be a positive whole number of days' },
    { duration: -3, msg: 'Duration must be a positive whole number of days' },
    { duration: 2.5, msg: 'Duration must be a positive whole number of days' },
    { duration: 45, msg: 'Duration must not exceed 30 days' },
  ];

  for (const tc of testCases) {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: 'Manali', duration: tc.duration, budget: 5000 }),
    });
    assert.equal(res.status, 400, `Expected 400 for duration: ${tc.duration}`);
    const data = await res.json();
    assert.equal(data.error, tc.msg);
  }
});

test('Input Validation: Non-positive or invalid budget returns 400', async () => {
  const testCases = [0, -500, 'invalid'];

  for (const b of testCases) {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: 'Manali', duration: 3, budget: b }),
    });
    assert.equal(res.status, 400, `Expected 400 for budget: ${b}`);
    const data = await res.json();
    assert.equal(data.error, 'Budget must be a positive number');
  }
});

test('Budget Handling: Extremely low budget (₹100) returns insufficientBudget warning, no itinerary', async () => {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: 'Delhi',
      destination: 'Rishikesh',
      duration: 3,
      budget: 100,
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.insufficientBudget, true, 'insufficientBudget must be true');
  assert.equal(data.isExtremelyUnrealistic, true, 'isExtremelyUnrealistic must be true');
  assert.equal(data.itinerary_markdown, undefined, 'itinerary_markdown must not be returned');

  // Verify costs arithmetic: total equals sum of individual components
  if (data.costs) {
    const { travel, accommodation, meals, activities, localTransport, total } = data.costs;
    const computedSum = travel + accommodation + meals + activities + localTransport;
    assert.equal(total, computedSum, 'Total cost must strictly equal sum of cost components');
    assert.ok(total > 100, 'Total realistic cost must exceed ₹100');
  }

  // Verify alternatives
  if (data.alternatives && data.alternatives.length > 0) {
    for (const alt of data.alternatives) {
      assert.ok(typeof alt.title === 'string' && alt.title.length > 0);
      assert.ok(typeof alt.why_cheaper === 'string');
      const { travel, accommodation, meals, activities, localTransport } = alt.costs;
      const altSum = travel + accommodation + meals + activities + localTransport;
      assert.equal(alt.totalCost, altSum, 'Alternative totalCost must strictly equal sum of components');
      assert.equal(alt.exceedsBudget, alt.totalCost > 100, 'exceedsBudget flag must be accurate');
    }
  }
});

test('Budget Handling: Plausible budget (Delhi to Rishikesh, 2 days, ₹50,000) generates within-budget itinerary', async () => {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: 'Delhi',
      destination: 'Rishikesh',
      duration: 2,
      budget: 50000,
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.insufficientBudget, false, 'insufficientBudget should be false for ₹50,000');
  assert.ok(typeof data.itinerary_markdown === 'string', 'itinerary_markdown must be present');
  assert.ok(data.itinerary_markdown.length > 50, 'itinerary_markdown must have content');

  if (data.costs) {
    const { travel, accommodation, meals, activities, localTransport, total } = data.costs;
    const computedSum = travel + accommodation + meals + activities + localTransport;
    assert.equal(total, computedSum, 'Total cost must strictly equal sum of cost components');
    // Ensure flights contradiction was not present or total is sensible
    assert.ok(total < 50000, 'Total should be well within ₹50,000');
  }
});

test('Integration: Manali request generates itinerary without Rishikesh contamination', async () => {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: 'Delhi',
      destination: 'Manali',
      duration: 2,
      budget: 50000,
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.insufficientBudget, false);
  const text = JSON.stringify(data).toLowerCase();
  assert.equal(text.includes('rishikesh'), false, 'Manali response must not contain Rishikesh');
  if (data.days) {
    assert.equal(data.days.length, 2, 'Must have exactly 2 day objects');
  }
});

test('Integration: 1-Day trip request returns exactly 1 day and 0 accommodation', async () => {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: 'Delhi',
      destination: 'Agra',
      duration: 1,
      budget: 25000,
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.insufficientBudget, false);
  assert.equal(data.costs.accommodation, 0, 'Accommodation must be 0 for 1-day trip');
  assert.equal(data.costs.accommodationNeeded, false);
  if (data.days) {
    assert.equal(data.days.length, 1, 'Must have exactly 1 day object');
  }
  if (data.itinerary_markdown) {
    assert.ok(data.itinerary_markdown.includes('### Day 1'));
    assert.equal(data.itinerary_markdown.includes('### Day 2'), false, 'Must not include Day 2');
  }
});
