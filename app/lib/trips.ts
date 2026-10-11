export interface Trip {
  id: string;
  place: string;
  type: string;
  date: string;
  duration: number; // in days
  budget: number; // INR per person
  spotsTotal: number;
  spotsRemaining: number;
  emoji: string;
  color: string;
  description: string;
  tags: string[];
  creator: string;
  isUserCreated: boolean;
  createdAt: number;
}

export type JoinRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface JoinRequest {
  id: string;
  tripId: string;
  tripPlace: string;
  requesterName: string;
  message: string;
  status: JoinRequestStatus;
  createdAt: number;
}

export interface TripStoreState {
  trips: Trip[];
  interestedIds: string[];
  passedIds: string[];
  joinRequests: JoinRequest[];
}

export const DEMO_TRIPS: Trip[] = [
  {
    id: 'demo-1',
    place: 'Lansdowne, Uttarakhand',
    type: 'MOUNTAIN ESCAPE',
    date: 'Oct 24–26',
    duration: 3,
    budget: 3500,
    spotsTotal: 4,
    spotsRemaining: 3,
    emoji: '🏔️',
    color: '#e5e9dc',
    description: 'Pine forests, quiet ridge trails, and slow misty mornings.',
    tags: ['Hiking', 'Nature', 'Misty Trails'],
    creator: 'Rohan (Community Explorer)',
    isUserCreated: false,
    createdAt: 1729000000000,
  },
  {
    id: 'demo-2',
    place: 'Rishikesh, Uttarakhand',
    type: 'RIVER & ADVENTURE',
    date: 'Nov 1–3',
    duration: 3,
    budget: 2800,
    spotsTotal: 5,
    spotsRemaining: 2,
    emoji: '🌊',
    color: '#dcebe5',
    description: 'Riverside ghat walks, sunset café hangouts, and morning yoga sessions.',
    tags: ['River', 'Exploring', 'Yoga', 'Cafes'],
    creator: 'Priya (Outdoor Enthusiast)',
    isUserCreated: false,
    createdAt: 1729100000000,
  },
  {
    id: 'demo-3',
    place: 'Jaipur, Rajasthan',
    type: 'CULTURE & SLOW TRAVEL',
    date: 'Nov 8–10',
    duration: 3,
    budget: 4000,
    spotsTotal: 4,
    spotsRemaining: 4,
    emoji: '🌅',
    color: '#f1e2d3',
    description: 'Historic pink city alleys, stepwells, artisan bazaars, and regional street food.',
    tags: ['Culture', 'Food', 'Heritage'],
    creator: 'Aditya (Heritage Walker)',
    isUserCreated: false,
    createdAt: 1729200000000,
  },
  {
    id: 'demo-4',
    place: 'Hampi, Karnataka',
    type: 'BOULDERING & ANCIENT RUINS',
    date: 'Nov 20–23',
    duration: 4,
    budget: 5200,
    spotsTotal: 6,
    spotsRemaining: 3,
    emoji: '🏛️',
    color: '#ebdcd0',
    description: 'Coracle boat rides on the Tungabhadra, sunset atop Matanga Hill, and bicycle rides through ancient stone temples.',
    tags: ['Ruins', 'Cycling', 'Sunsets', 'History'],
    creator: 'Maya (Solo Backpacker)',
    isUserCreated: false,
    createdAt: 1729300000000,
  },
];

export const DEMO_JOIN_REQUESTS: JoinRequest[] = [
  {
    id: 'req-demo-1',
    tripId: 'demo-2',
    tripPlace: 'Rishikesh, Uttarakhand',
    requesterName: 'Kunal S.',
    message: 'Excited about the morning river walk and yoga! Would love to join your group.',
    status: 'pending',
    createdAt: 1729150000000,
  },
];

const STORAGE_KEY = 'girora_trip_store_v1';

export function getInitialStore(): TripStoreState {
  return {
    trips: DEMO_TRIPS,
    interestedIds: [],
    passedIds: [],
    joinRequests: DEMO_JOIN_REQUESTS,
  };
}

/**
 * Validates whether a loaded object matches the TripStoreState structure safely.
 */
export function validateStoreState(raw: unknown): TripStoreState | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.trips)) return null;
  if (!Array.isArray(obj.interestedIds)) return null;
  if (!Array.isArray(obj.passedIds)) return null;
  if (!Array.isArray(obj.joinRequests)) return null;

  // Validate each trip
  const validTrips: Trip[] = [];
  for (const t of obj.trips) {
    if (
      t &&
      typeof t === 'object' &&
      typeof t.id === 'string' &&
      typeof t.place === 'string' &&
      typeof t.budget === 'number' &&
      typeof t.duration === 'number'
    ) {
      validTrips.push({
        id: String(t.id),
        place: String(t.place),
        type: typeof t.type === 'string' ? t.type : 'EXPLORATION',
        date: typeof t.date === 'string' ? t.date : 'Flexible',
        duration: Math.max(1, Number(t.duration) || 1),
        budget: Math.max(1, Number(t.budget) || 1000),
        spotsTotal: Math.max(1, Number(t.spotsTotal) || 4),
        spotsRemaining: Math.max(0, Number(t.spotsRemaining) ?? 4),
        emoji: typeof t.emoji === 'string' ? t.emoji : '🎒',
        color: typeof t.color === 'string' ? t.color : '#e5e9dc',
        description: typeof t.description === 'string' ? t.description : '',
        tags: Array.isArray(t.tags) ? t.tags.map(String) : [],
        creator: typeof t.creator === 'string' ? t.creator : 'Community Member',
        isUserCreated: Boolean(t.isUserCreated),
        createdAt: Number(t.createdAt) || Date.now(),
      });
    }
  }

  // Ensure demo trips are present
  const existingIds = new Set(validTrips.map((t) => t.id));
  for (const demo of DEMO_TRIPS) {
    if (!existingIds.has(demo.id)) {
      validTrips.push(demo);
    }
  }

  const validRequests: JoinRequest[] = [];
  for (const r of obj.joinRequests) {
    if (
      r &&
      typeof r === 'object' &&
      typeof r.id === 'string' &&
      typeof r.tripId === 'string' &&
      ['pending', 'accepted', 'rejected'].includes(String(r.status))
    ) {
      validRequests.push({
        id: String(r.id),
        tripId: String(r.tripId),
        tripPlace: typeof r.tripPlace === 'string' ? r.tripPlace : 'Trip',
        requesterName: typeof r.requesterName === 'string' ? r.requesterName : 'Traveler',
        message: typeof r.message === 'string' ? r.message : '',
        status: r.status as JoinRequestStatus,
        createdAt: Number(r.createdAt) || Date.now(),
      });
    }
  }

  return {
    trips: validTrips,
    interestedIds: obj.interestedIds.filter((id): id is string => typeof id === 'string'),
    passedIds: obj.passedIds.filter((id): id is string => typeof id === 'string'),
    joinRequests: validRequests,
  };
}

export function loadTripStore(): TripStoreState {
  if (typeof window === 'undefined') {
    return getInitialStore();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getInitialStore();
    const parsed = JSON.parse(raw);
    const validated = validateStoreState(parsed);
    return validated || getInitialStore();
  } catch (err) {
    console.warn('Failed to parse trip store from localStorage, resetting:', err);
    return getInitialStore();
  }
}

export function saveTripStore(state: TripStoreState): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('Failed to save trip store to localStorage:', err);
    return false;
  }
}

// External store for React useSyncExternalStore
const INITIAL_STORE: TripStoreState = Object.freeze({
  trips: DEMO_TRIPS,
  interestedIds: [],
  passedIds: [],
  joinRequests: DEMO_JOIN_REQUESTS,
});

let memoryStore: TripStoreState = typeof window !== 'undefined' ? loadTripStore() : INITIAL_STORE;
const storeListeners = new Set<() => void>();

export function subscribeTripStore(onStoreChange: () => void) {
  storeListeners.add(onStoreChange);
  return () => {
    storeListeners.delete(onStoreChange);
  };
}

export function getTripSnapshot(): TripStoreState {
  return memoryStore;
}

export function getTripServerSnapshot(): TripStoreState {
  return INITIAL_STORE;
}

export function setMemoryTripStore(updater: (prev: TripStoreState) => TripStoreState) {
  memoryStore = updater(memoryStore);
  saveTripStore(memoryStore);
  for (const listener of storeListeners) {
    listener();
  }
}

