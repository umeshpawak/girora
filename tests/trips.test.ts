import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  Trip,
  JoinRequest,
  TripStoreState,
} from '../app/lib/trips.ts';
import {
  getInitialStore,
  validateStoreState,
  getTripSnapshot,
  getTripServerSnapshot,
  subscribeTripStore,
  setMemoryTripStore,
} from '../app/lib/trips.ts';

test('Initial trip store contains demo trips and requests', () => {
  const store = getInitialStore();
  assert.ok(store.trips.length >= 3, 'Must have at least 3 demo trips');
  assert.equal(store.interestedIds.length, 0);
  assert.equal(store.passedIds.length, 0);
  assert.ok(store.joinRequests.length >= 1, 'Must have initial demo join request');
});

test('Trip creation and spots tracking', () => {
  const store = getInitialStore();
  const newTrip: Trip = {
    id: 'test-trip-1',
    place: 'Spiti Valley, Himachal',
    type: 'MOUNTAIN ESCAPE',
    date: 'Dec 1–5',
    duration: 5,
    budget: 9500,
    spotsTotal: 4,
    spotsRemaining: 4,
    emoji: '🏔️',
    color: '#e5e9dc',
    description: 'High altitude roads and monastery stays.',
    tags: ['Mountains', 'Roadtrip'],
    creator: 'You (Trip Creator)',
    isUserCreated: true,
    createdAt: Date.now(),
  };

  const updatedTrips = [newTrip, ...store.trips];
  assert.equal(updatedTrips.length, store.trips.length + 1);
  assert.equal(updatedTrips[0].isUserCreated, true);
  assert.equal(updatedTrips[0].spotsRemaining, 4);
});

test('Browse actions: express interest and pass', () => {
  let store: TripStoreState = getInitialStore();
  const trip1 = store.trips[0].id;
  const trip2 = store.trips[1].id;

  // Pass trip1
  store = {
    ...store,
    passedIds: [...store.passedIds, trip1],
  };
  assert.ok(store.passedIds.includes(trip1));

  // Express interest in trip2
  store = {
    ...store,
    interestedIds: [...store.interestedIds, trip2],
  };
  assert.ok(store.interestedIds.includes(trip2));
  assert.equal(store.interestedIds.length, 1);

  // Available trips excludes passed trips
  const available = store.trips.filter((t) => !store.passedIds.includes(t.id));
  assert.equal(available.some((t) => t.id === trip1), false);
});

test('Submit join request with pending status', () => {
  let store = getInitialStore();
  const targetTrip = store.trips[0];

  const newRequest: JoinRequest = {
    id: 'req-test-101',
    tripId: targetTrip.id,
    tripPlace: targetTrip.place,
    requesterName: 'Aarav V.',
    message: 'Love hiking and excited to join!',
    status: 'pending',
    createdAt: Date.now(),
  };

  store = {
    ...store,
    interestedIds: [...store.interestedIds, targetTrip.id],
    joinRequests: [newRequest, ...store.joinRequests],
  };

  const foundReq = store.joinRequests.find((r) => r.id === 'req-test-101');
  assert.ok(foundReq);
  assert.equal(foundReq.status, 'pending');
  assert.equal(foundReq.tripPlace, targetTrip.place);
});

test('Creator accepts join request: decrements available spots', () => {
  let store = getInitialStore();
  const targetTrip = store.trips[0];
  const initialSpots = targetTrip.spotsRemaining;

  const testReq: JoinRequest = {
    id: 'req-accept-test',
    tripId: targetTrip.id,
    tripPlace: targetTrip.place,
    requesterName: 'Pooja K.',
    message: 'Looking forward to the trip!',
    status: 'pending',
    createdAt: Date.now(),
  };

  store = {
    ...store,
    joinRequests: [testReq, ...store.joinRequests],
  };

  // Accept the request
  const updatedRequests = store.joinRequests.map((r) =>
    r.id === testReq.id ? { ...r, status: 'accepted' as const } : r
  );
  const updatedTrips = store.trips.map((t) =>
    t.id === targetTrip.id
      ? { ...t, spotsRemaining: Math.max(0, t.spotsRemaining - 1) }
      : t
  );

  store = {
    ...store,
    trips: updatedTrips,
    joinRequests: updatedRequests,
  };

  const accepted = store.joinRequests.find((r) => r.id === testReq.id);
  assert.equal(accepted?.status, 'accepted');
  const modifiedTrip = store.trips.find((t) => t.id === targetTrip.id);
  assert.equal(modifiedTrip?.spotsRemaining, initialSpots - 1);
});

test('Creator declines join request: spots remain unchanged', () => {
  let store = getInitialStore();
  const targetTrip = store.trips[0];
  const initialSpots = targetTrip.spotsRemaining;

  const testReq: JoinRequest = {
    id: 'req-decline-test',
    tripId: targetTrip.id,
    tripPlace: targetTrip.place,
    requesterName: 'Rohan M.',
    message: 'Can I join?',
    status: 'pending',
    createdAt: Date.now(),
  };

  // Reject the request
  const updatedRequests = [
    { ...testReq, status: 'rejected' as const },
    ...store.joinRequests,
  ];

  store = {
    ...store,
    joinRequests: updatedRequests,
  };

  const rejected = store.joinRequests.find((r) => r.id === testReq.id);
  assert.equal(rejected?.status, 'rejected');
  const unchangedTrip = store.trips.find((t) => t.id === targetTrip.id);
  assert.equal(unchangedTrip?.spotsRemaining, initialSpots);
});

test('Storage validation: parses valid stored data', () => {
  const validData = {
    trips: [
      {
        id: 'stored-1',
        place: 'Gokarna, Karnataka',
        type: 'BEACH & COASTAL',
        date: 'Dec 20–23',
        duration: 4,
        budget: 4500,
        spotsTotal: 5,
        spotsRemaining: 3,
        emoji: '🌊',
        color: '#e5e9dc',
        description: 'Beach trekking and cliff cafes.',
        tags: ['Beach', 'Sunset'],
        creator: 'You',
        isUserCreated: true,
        createdAt: 1729000000000,
      },
    ],
    interestedIds: ['stored-1', 'demo-1'],
    passedIds: ['demo-2'],
    joinRequests: [
      {
        id: 'stored-req-1',
        tripId: 'stored-1',
        tripPlace: 'Gokarna, Karnataka',
        requesterName: 'Dev K.',
        message: 'Interested in the trek',
        status: 'pending',
        createdAt: 1729000000000,
      },
    ],
  };

  const validated = validateStoreState(validData);
  assert.ok(validated !== null);
  assert.equal(validated.trips.some((t) => t.id === 'stored-1'), true);
  assert.equal(validated.trips.some((t) => t.id === 'demo-1'), true, 'Should include demo trips');
  assert.equal(validated.interestedIds.length, 2);
  assert.equal(validated.passedIds.length, 1);
  assert.equal(validated.joinRequests.length, 1);
});

test('Storage validation: recovers safely from malformed or corrupted data', () => {
  // Non-object
  assert.equal(validateStoreState(null), null);
  assert.equal(validateStoreState('corrupted string'), null);
  assert.equal(validateStoreState(12345), null);

  // Missing arrays
  assert.equal(validateStoreState({ trips: 'not-an-array' }), null);
  assert.equal(validateStoreState({ trips: [], interestedIds: 'invalid' }), null);

  // Corrupted records inside arrays
  const partiallyCorrupt = {
    trips: [
      null,
      { id: 'corrupt-1' }, // missing place, budget, duration
      {
        id: 'valid-recovered',
        place: 'Kullu, HP',
        type: 'MOUNTAIN',
        date: 'Jan 5',
        duration: 2,
        budget: 3000,
        spotsTotal: 3,
        spotsRemaining: 2,
        emoji: '🏔️',
        color: '#e5e9dc',
        description: 'Valley walk',
        tags: ['Valley'],
        creator: 'Explorer',
        isUserCreated: false,
        createdAt: 1729000000000,
      },
    ],
    interestedIds: ['valid-recovered', 12345 as unknown as string],
    passedIds: [],
    joinRequests: [
      { id: 'bad-status', tripId: 'valid-recovered', status: 'unknown-status' }, // invalid status
      {
        id: 'good-req',
        tripId: 'valid-recovered',
        tripPlace: 'Kullu, HP',
        requesterName: 'User',
        message: 'Hello',
        status: 'pending',
        createdAt: 1729000000000,
      },
    ],
  };

  const recovered = validateStoreState(partiallyCorrupt);
  assert.ok(recovered !== null);
  assert.equal(recovered.trips.some((t) => t.id === 'valid-recovered'), true);
  assert.equal(recovered.trips.some((t) => t.id === 'corrupt-1'), false);
  assert.equal(recovered.interestedIds.includes('valid-recovered'), true);
  assert.equal(recovered.interestedIds.includes('12345'), false);
  assert.equal(recovered.joinRequests.length, 1);
  assert.equal(recovered.joinRequests[0].id, 'good-req');
});

test('Snapshot stability: getTripServerSnapshot returns a stable, cached reference across multiple calls', () => {
  const snapshot1 = getTripServerSnapshot();
  const snapshot2 = getTripServerSnapshot();
  const snapshot3 = getTripServerSnapshot();

  // Strict referential equality is required to avoid React useSyncExternalStore re-render loops
  assert.equal(snapshot1, snapshot2, 'getServerSnapshot must return the exact same reference on repeated calls');
  assert.equal(snapshot2, snapshot3, 'getServerSnapshot must be stably cached');
  assert.ok(Array.isArray(snapshot1.trips), 'Must contain trips array');
});

test('Snapshot stability: getTripSnapshot returns stable reference when unmodified, updates cleanly when dispatched', () => {
  const initialSnap1 = getTripSnapshot();
  const initialSnap2 = getTripSnapshot();
  assert.equal(initialSnap1, initialSnap2, 'getSnapshot must return stable cached reference between changes');

  let notified = false;
  const unsubscribe = subscribeTripStore(() => {
    notified = true;
  });

  try {
    // Dispatch an update to the store
    setMemoryTripStore((prev) => ({
      ...prev,
      passedIds: [...prev.passedIds, 'test-pass-id-999'],
    }));

    assert.equal(notified, true, 'Subscribers must be notified upon store update');

    const updatedSnap1 = getTripSnapshot();
    const updatedSnap2 = getTripSnapshot();
    assert.equal(updatedSnap1, updatedSnap2, 'Updated snapshot must remain referentially stable across reads');
    assert.ok(updatedSnap1.passedIds.includes('test-pass-id-999'));

    // Server snapshot must remain unchanged and intact
    const serverSnap = getTripServerSnapshot();
    assert.equal(serverSnap.passedIds.includes('test-pass-id-999'), false, 'Server snapshot must remain immutable');
  } finally {
    unsubscribe();
  }
});
