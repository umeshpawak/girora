"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import logoImg from "./logo.png";
import {
  Trip,
  JoinRequest,
  TripStoreState,
  subscribeTripStore,
  getTripSnapshot,
  getTripServerSnapshot,
  setMemoryTripStore,
} from "./lib/trips";

function parseInline(text: string) {
  let html = text.replace(
    /\*\*(.*?)\*\*/g,
    '<strong style="color: #294735; font-weight: 600;">$1</strong>'
  );
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  return html;
}

function RenderMarkdown({ content }: { content: string }) {
  if (!content) return null;

  const blocks = content.split(/\n\n+/);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith("### ")) {
          return (
            <h4
              key={index}
              dangerouslySetInnerHTML={{
                __html: parseInline(trimmed.replace("### ", "")),
              }}
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 18,
                color: "#294735",
                margin: "10px 0 0",
              }}
            />
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3
              key={index}
              dangerouslySetInnerHTML={{
                __html: parseInline(trimmed.replace("## ", "")),
              }}
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 20,
                color: "#253d30",
                margin: "15px 0 5px",
              }}
            />
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h2
              key={index}
              dangerouslySetInnerHTML={{
                __html: parseInline(trimmed.replace("# ", "")),
              }}
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 24,
                color: "#253d30",
                margin: "20px 0 10px",
              }}
            />
          );
        }

        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const lines = trimmed.split("\n");
          return (
            <ul
              key={index}
              style={{
                paddingLeft: 20,
                margin: 0,
                color: "#4a5d4e",
                lineHeight: 1.8,
              }}
            >
              {lines.map((line, i) => {
                const isBullet =
                  line.trim().startsWith("- ") || line.trim().startsWith("* ");
                const textContent = isBullet
                  ? line.trim().replace(/^[-*]\s+/, "")
                  : line.trim();
                return (
                  <li
                    key={i}
                    style={{ listStyleType: isBullet ? "disc" : "none" }}
                    dangerouslySetInnerHTML={{
                      __html: parseInline(textContent),
                    }}
                  />
                );
              })}
            </ul>
          );
        }

        if (/^\d+\.\s/.test(trimmed)) {
          const lines = trimmed.split("\n");
          return (
            <ol
              key={index}
              style={{
                paddingLeft: 20,
                margin: 0,
                color: "#4a5d4e",
                lineHeight: 1.8,
              }}
            >
              {lines.map((line, i) => {
                const isNumbered = /^\d+\.\s/.test(line.trim());
                const textContent = isNumbered
                  ? line.trim().replace(/^\d+\.\s+/, "")
                  : line.trim();
                return (
                  <li
                    key={i}
                    style={{ listStyleType: isNumbered ? "decimal" : "none" }}
                    dangerouslySetInnerHTML={{
                      __html: parseInline(textContent),
                    }}
                  />
                );
              })}
            </ol>
          );
        }

        const lines = trimmed.split("\n");
        return (
          <p key={index} style={{ margin: 0, color: "#4a5d4e", lineHeight: 1.8 }}>
            {lines.map((line, i) => (
              <span key={i}>
                <span dangerouslySetInnerHTML={{ __html: parseInline(line) }} />
                {i < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

interface AltCosts {
  travel: number;
  accommodation: number;
  meals: number;
  activities: number;
  localTransport: number;
}

interface AltResult {
  title: string;
  why_cheaper: string;
  totalCost: number;
  costs: AltCosts;
  exceedsBudget: boolean;
}

interface ClientCosts {
  travel: number;
  accommodation: number;
  meals: number;
  activities: number;
  localTransport: number;
  total: number;
  isAccommodationIncluded: boolean;
  accommodationNeeded: boolean;
}

interface ItineraryResult {
  insufficientBudget: boolean;
  isExtremelyUnrealistic?: boolean;
  slightOverage?: boolean;
  overageAmount?: number;
  overagePct?: number;
  costs?: ClientCosts;
  hasOrigin?: boolean;
  alternatives?: AltResult[];
  itinerary_markdown?: string;
}

export default function Home() {
  // Store & Discovery state synced from external store (localStorage)
  const store = useSyncExternalStore(
    subscribeTripStore,
    getTripSnapshot,
    getTripServerSnapshot
  );
  const [currentTripIndex, setCurrentTripIndex] = useState(0);

  // Join modal / request form state
  const [activeJoinTrip, setActiveJoinTrip] = useState<Trip | null>(null);
  const [joinNote, setJoinNote] = useState("");
  const [joinRequesterName, setJoinRequesterName] = useState("");
  const [joinSuccessMsg, setJoinSuccessMsg] = useState<string | null>(null);

  // Create Trip form state
  const [createForm, setCreateForm] = useState({
    place: "",
    type: "MOUNTAIN ESCAPE",
    date: "",
    duration: "3",
    budget: "3500",
    spots: "4",
    description: "",
    selectedTags: ["Hiking", "Nature"] as string[],
  });
  const [createSuccessMsg, setCreateSuccessMsg] = useState<string | null>(null);

  // My Trips active tab
  const [myTripsTab, setMyTripsTab] = useState<"created" | "interested">("created");

  // AI Planner state
  const [plannerForm, setPlannerForm] = useState({
    origin: "",
    destination: "",
    duration: "3",
    budget: "5000",
  });
  const [result, setResult] = useState<ItineraryResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);

  // Update store via external store dispatch
  function updateStore(updater: (prev: TripStoreState) => TripStoreState) {
    setMemoryTripStore(updater);
  }

  // Browse deck trips (exclude explicitly passed ones, or let user browse all)
  const availableTrips = store.trips.filter((t) => !store.passedIds.includes(t.id));
  const currentTrip: Trip | undefined = availableTrips[currentTripIndex];

  function handlePass(tripId: string) {
    updateStore((prev) => ({
      ...prev,
      passedIds: prev.passedIds.includes(tripId) ? prev.passedIds : [...prev.passedIds, tripId],
    }));
  }

  function handleInterested(tripId: string) {
    updateStore((prev) => ({
      ...prev,
      interestedIds: prev.interestedIds.includes(tripId)
        ? prev.interestedIds
        : [...prev.interestedIds, tripId],
    }));
    // Advance deck
    if (currentTripIndex < availableTrips.length - 1) {
      setCurrentTripIndex((idx) => idx + 1);
    }
  }

  function handleRemoveInterested(tripId: string) {
    updateStore((prev) => ({
      ...prev,
      interestedIds: prev.interestedIds.filter((id) => id !== tripId),
    }));
  }

  function resetBrowseDeck() {
    updateStore((prev) => ({
      ...prev,
      passedIds: [],
    }));
    setCurrentTripIndex(0);
  }

  // Open Join Request Modal
  function openJoinModal(trip: Trip) {
    setActiveJoinTrip(trip);
    setJoinNote("");
    setJoinRequesterName("");
    setJoinSuccessMsg(null);
  }

  // Submit Join Request
  function submitJoinRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!activeJoinTrip) return;

    const newRequest: JoinRequest = {
      id: `req-${Date.now()}`,
      tripId: activeJoinTrip.id,
      tripPlace: activeJoinTrip.place,
      requesterName: joinRequesterName.trim() || "Local Explorer",
      message: joinNote.trim() || "Hi! I would love to join your travel group.",
      status: "pending",
      createdAt: Date.now(),
    };

    updateStore((prev) => ({
      ...prev,
      // Automatically mark interested too
      interestedIds: prev.interestedIds.includes(activeJoinTrip.id)
        ? prev.interestedIds
        : [...prev.interestedIds, activeJoinTrip.id],
      joinRequests: [newRequest, ...prev.joinRequests],
    }));

    setJoinSuccessMsg("Request sent! Check the status anytime under 'My Trips'.");
    setTimeout(() => {
      setActiveJoinTrip(null);
      setJoinSuccessMsg(null);
    }, 1500);
  }

  // Trip Creator accepts or rejects request
  function handleRespondRequest(requestId: string, newStatus: "accepted" | "rejected") {
    updateStore((prev) => {
      const targetReq = prev.joinRequests.find((r) => r.id === requestId);
      if (!targetReq) return prev;

      const updatedRequests = prev.joinRequests.map((r) =>
        r.id === requestId ? { ...r, status: newStatus } : r
      );

      // If accepted, decrement available spots for that trip
      let updatedTrips = prev.trips;
      if (newStatus === "accepted" && targetReq.status !== "accepted") {
        updatedTrips = prev.trips.map((t) =>
          t.id === targetReq.tripId
            ? { ...t, spotsRemaining: Math.max(0, t.spotsRemaining - 1) }
            : t
        );
      }

      return {
        ...prev,
        trips: updatedTrips,
        joinRequests: updatedRequests,
      };
    });
  }

  // Create Trip
  const AVAILABLE_TAGS = [
    "Hiking",
    "Nature",
    "River",
    "Yoga",
    "Food",
    "Culture",
    "Photography",
    "Backpacking",
    "Camping",
  ];

  function toggleTag(tag: string) {
    setCreateForm((prev) => {
      const exists = prev.selectedTags.includes(tag);
      return {
        ...prev,
        selectedTags: exists
          ? prev.selectedTags.filter((t) => t !== tag)
          : [...prev.selectedTags, tag],
      };
    });
  }

  function handleCreateTrip(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.place.trim()) return;

    const dur = Math.max(1, parseInt(createForm.duration) || 3);
    const bud = Math.max(100, parseInt(createForm.budget) || 3000);
    const sp = Math.max(1, parseInt(createForm.spots) || 4);

    const newTrip: Trip = {
      id: `trip-${Date.now()}`,
      place: createForm.place.trim(),
      type: createForm.type,
      date: createForm.date.trim() || "Upcoming Weekend",
      duration: dur,
      budget: bud,
      spotsTotal: sp,
      spotsRemaining: sp,
      emoji: createForm.type.includes("RIVER")
        ? "🌊"
        : createForm.type.includes("MOUNTAIN")
        ? "🏔️"
        : createForm.type.includes("CULTURE")
        ? "🌅"
        : "🎒",
      color: "#e5e9dc",
      description:
        createForm.description.trim() ||
        "A mindful getaway with like-minded outdoor lovers.",
      tags: createForm.selectedTags.length > 0 ? createForm.selectedTags : ["Exploring"],
      creator: "You (Trip Creator)",
      isUserCreated: true,
      createdAt: Date.now(),
    };

    updateStore((prev) => ({
      ...prev,
      trips: [newTrip, ...prev.trips],
    }));

    setCreateSuccessMsg("🎉 Your trip has been created and saved!");
    setCreateForm({
      place: "",
      type: "MOUNTAIN ESCAPE",
      date: "",
      duration: "3",
      budget: "3500",
      spots: "4",
      description: "",
      selectedTags: ["Hiking", "Nature"],
    });

    setTimeout(() => {
      setCreateSuccessMsg(null);
      setMyTripsTab("created");
      document.getElementById("my-trips")?.scrollIntoView({ behavior: "smooth" });
    }, 1200);
  }

  // Pre-fill AI Planner from any trip card
  function prefillAiPlanner(trip: Trip) {
    setPlannerForm({
      origin: "New Delhi",
      destination: trip.place.split(",")[0].trim(),
      duration: String(trip.duration),
      budget: String(trip.budget),
    });
    document.getElementById("ai-planner")?.scrollIntoView({ behavior: "smooth" });
  }

  // AI Itinerary submission
  async function generateItinerary(e: React.FormEvent) {
    e.preventDefault();
    setIsGenerating(true);
    setResult(null);
    setPlannerError(null);

    try {
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plannerForm),
      });
      const data = (await res.json()) as ItineraryResult & { error?: string };

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate itinerary");
      }
      setResult(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setPlannerError(err.message);
      } else {
        setPlannerError("An unexpected error occurred.");
      }
    } finally {
      setIsGenerating(false);
    }
  }

  function focusBudgetAndReset() {
    setResult(null);
    setTimeout(() => document.getElementById("budget")?.focus(), 50);
  }

  function explore() {
    document.getElementById("adventures")?.scrollIntoView({
      behavior: "smooth",
    });
  }

  // Filter lists for My Trips
  const myCreatedTrips = store.trips.filter((t) => t.isUserCreated);
  const myInterestedTrips = store.trips.filter((t) =>
    store.interestedIds.includes(t.id)
  );

  return (
    <main style={{ background: "#faf9f5", color: "#253d30", minHeight: "100vh" }}>
      {/* Navigation */}
      <nav
        style={{
          maxWidth: 1120,
          margin: "auto",
          padding: "25px 6%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <a
          href="#"
          style={{
            fontSize: 27,
            fontWeight: 700,
            letterSpacing: "-1.5px",
            color: "#294735",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Image
            src={logoImg}
            alt="Girora Logo"
            width={34}
            height={34}
            style={{ borderRadius: 8, objectFit: "contain" }}
            priority
          />
          <span>girora<span style={{ color: "#bc8e67" }}>.</span></span>
        </a>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            fontSize: 14,
            flexWrap: "wrap",
          }}
        >
          <a href="#adventures" style={{ color: "inherit", textDecoration: "none" }}>
            Explore
          </a>
          <a href="#my-trips" style={{ color: "inherit", textDecoration: "none" }}>
            My Trips
          </a>
          <a href="#create-trip" style={{ color: "inherit", textDecoration: "none" }}>
            Create Trip
          </a>
          <a href="#ai-planner" style={{ color: "inherit", textDecoration: "none" }}>
            AI Planner
          </a>
          <button
            onClick={explore}
            style={{
              background: "#294735",
              color: "white",
              padding: "10px 18px",
              border: 0,
              borderRadius: 30,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Find a trip ↗
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section
        style={{
          maxWidth: 1120,
          margin: "auto",
          padding: "65px 6% 85px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
          gap: 45,
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              display: "inline-block",
              border: "1px solid #dce2d5",
              borderRadius: 30,
              padding: "8px 14px",
              fontSize: 12,
              letterSpacing: 1,
              color: "#58745d",
            }}
          >
            ✳ A LITTLE MORE OUTSIDE
          </div>
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "clamp(48px, 6.5vw, 76px)",
              lineHeight: 1.06,
              fontWeight: 400,
              letterSpacing: -2,
              margin: "25px 0",
            }}
          >
            The world feels
            <br />
            better{" "}
            <span style={{ color: "#8b9d78", fontStyle: "italic" }}>together.</span>
          </h1>
          <p
            style={{
              maxWidth: 440,
              lineHeight: 1.9,
              color: "#6e776e",
              fontSize: 16,
            }}
          >
            Find your kind of people, discover little adventures, and make memories beyond
            your screen.
          </p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 24 }}>
            <button
              onClick={explore}
              style={{
                background: "#294735",
                color: "#fffdf8",
                border: 0,
                borderRadius: 30,
                padding: "15px 25px",
                fontSize: 15,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Discover adventures ↗
            </button>
            <a
              href="#create-trip"
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "#f0f4ec",
                color: "#294735",
                border: "1px solid #d4e0cc",
                borderRadius: 30,
                padding: "15px 22px",
                fontSize: 15,
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              + Create a trip
            </a>
          </div>
          <p style={{ fontSize: 12, color: "#8b9187", marginTop: 20 }}>
            Less scrolling. More living.
          </p>
        </div>

        <div
          style={{
            minHeight: 390,
            borderRadius: 220,
            background:
              "linear-gradient(145deg, #e5e9dc, #d6e3d7 55%, #f0e6d6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ textAlign: "center", padding: 25 }}>
            <div style={{ fontSize: "clamp(95px, 16vw, 155px)", lineHeight: 1.25 }}>
              🌄
            </div>
            <div
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 25,
                fontStyle: "italic",
                color: "#385541",
              }}
            >
              Somewhere quieter.
            </div>
            <div style={{ fontSize: 13, marginTop: 10, color: "#637565" }}>
              Your next story is out there.
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 35,
              left: 22,
              background: "#faf9f1",
              padding: "12px 16px",
              borderRadius: 14,
              fontSize: 12,
              boxShadow: "0 8px 25px #52654b18",
            }}
          >
            🌿 &nbsp; Take the scenic route
          </div>
        </div>
      </section>

      {/* Discovery / Browse Section */}
      <section id="adventures" style={{ background: "#f0f1e9", padding: "75px 6%" }}>
        <div style={{ maxWidth: 540, margin: "auto" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, letterSpacing: 2, color: "#7b8b70" }}>
              YOUR NEXT LITTLE ESCAPE
            </div>
            <h2
              style={{
                fontFamily: "Georgia, serif",
                fontWeight: 400,
                fontSize: 42,
                margin: "12px 0",
              }}
            >
              Discover your next trip
            </h2>
            <p style={{ color: "#778075", lineHeight: 1.7 }}>
              Browse real community adventures, express interest, or request to join.
            </p>
          </div>

          {/* Single-browser disclaimer */}
          <div
            style={{
              background: "#faf9f1",
              border: "1px solid #dce2d5",
              borderRadius: 12,
              padding: "10px 14px",
              fontSize: 12,
              color: "#5f7362",
              textAlign: "center",
              margin: "20px 0 30px",
            }}
          >
            ℹ️ Single-Browser Demo: Trips and join requests are stored locally in your
            browser&apos;s localStorage for interactive demonstration.
          </div>

          <div style={{ marginTop: 25 }}>
            {currentTrip ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Progress bar */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      flexGrow: 1,
                      height: 4,
                      background: "#dce2d5",
                      borderRadius: 2,
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        background: "#294735",
                        borderRadius: 2,
                        width: `${
                          ((currentTripIndex + 1) / availableTrips.length) * 100
                        }%`,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#7b8b70",
                      fontWeight: 600,
                    }}
                  >
                    {currentTripIndex + 1} / {availableTrips.length}
                  </div>
                </div>

                {/* Trip Card */}
                <article
                  style={{
                    background: "#fffefa",
                    borderRadius: 18,
                    overflow: "hidden",
                    border: "1px solid #e8e9df",
                    boxShadow: "0 10px 30px #29473510",
                  }}
                >
                  <div
                    style={{
                      height: 200,
                      background: currentTrip.color,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      fontSize: 85,
                      position: "relative",
                    }}
                  >
                    {currentTrip.emoji}
                    <span
                      style={{
                        position: "absolute",
                        top: 14,
                        left: 14,
                        background: "#fffef0e8",
                        borderRadius: 20,
                        padding: "6px 12px",
                        fontSize: 11,
                        letterSpacing: 1,
                        color: "#50664f",
                        fontWeight: 600,
                      }}
                    >
                      {currentTrip.type}
                    </span>
                    <span
                      style={{
                        position: "absolute",
                        bottom: 12,
                        right: 14,
                        background: "#294735dd",
                        color: "white",
                        borderRadius: 14,
                        padding: "4px 10px",
                        fontSize: 11,
                      }}
                    >
                      👤 {currentTrip.creator}
                    </span>
                  </div>

                  <div style={{ padding: 25 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        marginBottom: 8,
                      }}
                    >
                      <h3
                        style={{
                          fontFamily: "Georgia, serif",
                          fontSize: 25,
                          fontWeight: 400,
                          margin: 0,
                          color: "#253d30",
                        }}
                      >
                        {currentTrip.place}
                      </h3>
                      <span
                        style={{
                          fontSize: 13,
                          color:
                            currentTrip.spotsRemaining > 0 ? "#58745d" : "#a05000",
                          fontWeight: 600,
                        }}
                      >
                        {currentTrip.spotsRemaining > 0
                          ? `🟢 ${currentTrip.spotsRemaining} spots left`
                          : "🔴 Trip full"}
                      </span>
                    </div>

                    <p
                      style={{
                        fontSize: 14,
                        lineHeight: 1.7,
                        color: "#737b70",
                        minHeight: 44,
                        margin: "8px 0 14px",
                      }}
                    >
                      {currentTrip.description}
                    </p>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 7,
                        margin: "12px 0",
                      }}
                    >
                      {currentTrip.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: 12,
                            border: "1px solid #e1e5da",
                            background: "#fafbf7",
                            borderRadius: 20,
                            padding: "5px 12px",
                            color: "#4a5d4e",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        color: "#6f796d",
                        padding: "14px 0",
                        borderTop: "1px solid #edf0e7",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>
                        📅 {currentTrip.date} ({currentTrip.duration} days)
                      </span>
                      <strong style={{ fontSize: 17, color: "#253d30" }}>
                        ~₹{currentTrip.budget.toLocaleString()}
                        <span style={{ fontWeight: 400, fontSize: 12, color: "#7e8579" }}>
                          {" "}
                          / person
                        </span>
                      </strong>
                    </div>

                    {/* AI plan shortcut */}
                    <div style={{ marginTop: 8 }}>
                      <button
                        onClick={() => prefillAiPlanner(currentTrip)}
                        style={{
                          width: "100%",
                          padding: "10px",
                          borderRadius: 12,
                          border: "1px dashed #b5c7b1",
                          background: "#f7f9f4",
                          color: "#3f5e46",
                          fontSize: 13,
                          cursor: "pointer",
                          fontWeight: 500,
                        }}
                      >
                        ✨ Plan this trip with AI Itinerary Planner ↓
                      </button>
                    </div>
                  </div>
                </article>

                {/* Primary Card Actions */}
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button
                    onClick={() => handlePass(currentTrip.id)}
                    style={{
                      flex: 1,
                      padding: "15px",
                      borderRadius: 30,
                      border: "1px solid #dce2d5",
                      background: "white",
                      color: "#6f796d",
                      fontSize: 15,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    ✕ Pass
                  </button>
                  <button
                    onClick={() => handleInterested(currentTrip.id)}
                    style={{
                      flex: 1,
                      padding: "15px",
                      borderRadius: 30,
                      border: "1px solid #c0d1bb",
                      background: store.interestedIds.includes(currentTrip.id)
                        ? "#e2ecd9"
                        : "#f3f7ee",
                      color: "#294735",
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {store.interestedIds.includes(currentTrip.id)
                      ? "♥ Interested ✓"
                      : "♥ Interested"}
                  </button>
                  <button
                    onClick={() => openJoinModal(currentTrip)}
                    style={{
                      flex: 1.2,
                      padding: "15px",
                      borderRadius: 30,
                      border: 0,
                      background: "#294735",
                      color: "white",
                      fontSize: 15,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    🙋 Request Join
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "50px 20px",
                  background: "#fffefa",
                  borderRadius: 18,
                  border: "1px solid #e8e9df",
                }}
              >
                <div style={{ fontSize: 46, marginBottom: 15 }}>🎉</div>
                <h3
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: 24,
                    margin: "0 0 10px",
                    color: "#294735",
                  }}
                >
                  You&apos;ve seen all current trips!
                </h3>
                <p style={{ color: "#778075", marginBottom: 20 }}>
                  You have marked interest in {store.interestedIds.length}{" "}
                  {store.interestedIds.length === 1 ? "trip" : "trips"}.
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    justifyContent: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    onClick={resetBrowseDeck}
                    style={{
                      background: "#294735",
                      color: "white",
                      padding: "12px 24px",
                      borderRadius: 30,
                      border: 0,
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    Reset Browse Deck
                  </button>
                  <a
                    href="#create-trip"
                    style={{
                      background: "#eef2e7",
                      color: "#294735",
                      padding: "12px 24px",
                      borderRadius: 30,
                      border: "1px solid #c9d6c1",
                      textDecoration: "none",
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    + Create a Trip
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Join Request Modal */}
      {activeJoinTrip && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(37, 61, 48, 0.45)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fffefa",
              borderRadius: 20,
              maxWidth: 480,
              width: "100%",
              padding: 30,
              border: "1px solid #e1e7da",
              boxShadow: "0 20px 40px rgba(0,0,0,0.12)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h3
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: 22,
                  color: "#294735",
                  margin: 0,
                }}
              >
                Join {activeJoinTrip.place}
              </h3>
              <button
                onClick={() => setActiveJoinTrip(null)}
                style={{
                  background: "transparent",
                  border: 0,
                  fontSize: 20,
                  cursor: "pointer",
                  color: "#6e776e",
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, color: "#6e776e", lineHeight: 1.6, margin: "0 0 18px" }}>
              Send a join request to <strong>{activeJoinTrip.creator}</strong>. Keep
              personal details safe — please do not share private addresses or phone
              numbers.
            </p>

            {joinSuccessMsg ? (
              <div
                style={{
                  background: "#eef6eb",
                  border: "1px solid #b8dab0",
                  color: "#35662a",
                  padding: "14px 18px",
                  borderRadius: 12,
                  fontSize: 14,
                  textAlign: "center",
                }}
              >
                {joinSuccessMsg}
              </div>
            ) : (
              <form onSubmit={submitJoinRequest} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label
                    htmlFor="requesterName"
                    style={{ fontSize: 13, fontWeight: 600, color: "#425744" }}
                  >
                    Your Name / Handle
                  </label>
                  <input
                    id="requesterName"
                    type="text"
                    required
                    placeholder="e.g. Maya R."
                    value={joinRequesterName}
                    onChange={(e) => setJoinRequesterName(e.target.value)}
                    style={{
                      padding: "11px 14px",
                      borderRadius: 10,
                      border: "1px solid #dce2d5",
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label
                    htmlFor="joinNote"
                    style={{ fontSize: 13, fontWeight: 600, color: "#425744" }}
                  >
                    Short Intro Note
                  </label>
                  <textarea
                    id="joinNote"
                    rows={3}
                    placeholder="Tell the group a bit about your travel style or what you're excited for..."
                    value={joinNote}
                    onChange={(e) => setJoinNote(e.target.value)}
                    style={{
                      padding: "11px 14px",
                      borderRadius: 10,
                      border: "1px solid #dce2d5",
                      fontSize: 14,
                      outline: "none",
                      resize: "vertical",
                    }}
                  />
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setActiveJoinTrip(null)}
                    style={{
                      flex: 1,
                      padding: "12px",
                      borderRadius: 25,
                      border: "1px solid #dce2d5",
                      background: "white",
                      color: "#6e776e",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      flex: 1.5,
                      padding: "12px",
                      borderRadius: 25,
                      border: 0,
                      background: "#294735",
                      color: "white",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Submit Request
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* My Trips Section */}
      <section id="my-trips" style={{ maxWidth: 960, margin: "auto", padding: "75px 6%" }}>
        <div style={{ textAlign: "center", marginBottom: 35 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: "#7b8b70" }}>
            YOUR TRIPS &amp; INVITATIONS
          </div>
          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontWeight: 400,
              fontSize: 38,
              margin: "12px 0",
              color: "#253d30",
            }}
          >
            My Trips
          </h2>
          <p style={{ color: "#778075", lineHeight: 1.7 }}>
            Track the trips you have created, see join requests, and manage adventures you
            like.
          </p>

          {/* Sub-tabs */}
          <div
            style={{
              display: "inline-flex",
              background: "#eceee5",
              borderRadius: 30,
              padding: 4,
              marginTop: 20,
            }}
          >
            <button
              onClick={() => setMyTripsTab("created")}
              style={{
                padding: "10px 22px",
                borderRadius: 25,
                border: 0,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                background: myTripsTab === "created" ? "#294735" : "transparent",
                color: myTripsTab === "created" ? "white" : "#5a6b5d",
              }}
            >
              Created by Me ({myCreatedTrips.length})
            </button>
            <button
              onClick={() => setMyTripsTab("interested")}
              style={{
                padding: "10px 22px",
                borderRadius: 25,
                border: 0,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                background: myTripsTab === "interested" ? "#294735" : "transparent",
                color: myTripsTab === "interested" ? "white" : "#5a6b5d",
              }}
            >
              Interested &amp; Requests ({myInterestedTrips.length})
            </button>
          </div>
        </div>

        {/* Tab 1: Created by Me */}
        {myTripsTab === "created" && (
          <div>
            {myCreatedTrips.length === 0 ? (
              <div
                style={{
                  background: "#f9faf5",
                  border: "1px dashed #dce2d5",
                  borderRadius: 16,
                  padding: "45px 25px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 12 }}>⛺</div>
                <h4
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: 20,
                    color: "#294735",
                    margin: "0 0 8px",
                  }}
                >
                  No trips created yet
                </h4>
                <p style={{ fontSize: 14, color: "#6f796d", marginBottom: 20 }}>
                  Have a mountain trek or weekend getaway in mind? Create a trip to invite
                  fellow travelers.
                </p>
                <a
                  href="#create-trip"
                  style={{
                    display: "inline-block",
                    background: "#294735",
                    color: "white",
                    padding: "12px 24px",
                    borderRadius: 30,
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  + Create Your First Trip
                </a>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {myCreatedTrips.map((trip) => {
                  const incoming = store.joinRequests.filter(
                    (r) => r.tripId === trip.id
                  );
                  return (
                    <div
                      key={trip.id}
                      style={{
                        background: "#fffefa",
                        border: "1px solid #e1e7da",
                        borderRadius: 16,
                        padding: "24px 28px",
                        boxShadow: "0 4px 16px #29473508",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          flexWrap: "wrap",
                          gap: 12,
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontSize: 11,
                              letterSpacing: 1,
                              fontWeight: 600,
                              color: "#5f7964",
                              background: "#eef3ea",
                              padding: "4px 10px",
                              borderRadius: 15,
                            }}
                          >
                            {trip.type}
                          </span>
                          <h3
                            style={{
                              fontFamily: "Georgia, serif",
                              fontSize: 22,
                              color: "#253d30",
                              margin: "8px 0 4px",
                            }}
                          >
                            {trip.emoji} {trip.place}
                          </h3>
                          <div style={{ fontSize: 13, color: "#6f796d" }}>
                            📅 {trip.date} ({trip.duration} days) · ~₹
                            {trip.budget.toLocaleString()} / person · Spots:{" "}
                            <strong>
                              {trip.spotsRemaining} / {trip.spotsTotal} available
                            </strong>
                          </div>
                        </div>

                        <button
                          onClick={() => prefillAiPlanner(trip)}
                          style={{
                            padding: "8px 16px",
                            borderRadius: 20,
                            border: "1px solid #d4dfce",
                            background: "#f6f9f3",
                            color: "#294735",
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          Plan with AI
                        </button>
                      </div>

                      {/* Incoming join requests */}
                      <div
                        style={{
                          marginTop: 20,
                          paddingTop: 16,
                          borderTop: "1px solid #edf1e8",
                        }}
                      >
                        <h5
                          style={{
                            margin: "0 0 12px",
                            fontSize: 13,
                            color: "#546a58",
                            letterSpacing: 0.5,
                          }}
                        >
                          INCOMING JOIN REQUESTS ({incoming.length})
                        </h5>

                        {incoming.length === 0 ? (
                          <p style={{ fontSize: 13, color: "#8a9486", margin: 0 }}>
                            No join requests yet. Share your trip or check back soon!
                          </p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {incoming.map((req) => (
                              <div
                                key={req.id}
                                style={{
                                  background: "#f9faf6",
                                  border: "1px solid #e7ece1",
                                  borderRadius: 12,
                                  padding: "12px 16px",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  gap: 12,
                                }}
                              >
                                <div>
                                  <div
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 600,
                                      color: "#253d30",
                                    }}
                                  >
                                    👤 {req.requesterName}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 13,
                                      color: "#657364",
                                      marginTop: 2,
                                    }}
                                  >
                                    &ldquo;{req.message}&rdquo;
                                  </div>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  {req.status === "pending" ? (
                                    <>
                                      <button
                                        onClick={() =>
                                          handleRespondRequest(req.id, "accepted")
                                        }
                                        style={{
                                          padding: "7px 14px",
                                          borderRadius: 20,
                                          border: 0,
                                          background: "#294735",
                                          color: "white",
                                          fontSize: 12,
                                          fontWeight: 600,
                                          cursor: "pointer",
                                        }}
                                      >
                                        ✓ Accept
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleRespondRequest(req.id, "rejected")
                                        }
                                        style={{
                                          padding: "7px 14px",
                                          borderRadius: 20,
                                          border: "1px solid #d8dfd2",
                                          background: "white",
                                          color: "#885050",
                                          fontSize: 12,
                                          cursor: "pointer",
                                        }}
                                      >
                                        ✕ Decline
                                      </button>
                                    </>
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        padding: "4px 10px",
                                        borderRadius: 12,
                                        background:
                                          req.status === "accepted"
                                            ? "#e6f4e3"
                                            : "#faeae8",
                                        color:
                                          req.status === "accepted"
                                            ? "#2c6c22"
                                            : "#a03d36",
                                      }}
                                    >
                                      {req.status === "accepted"
                                        ? "Accepted ✓"
                                        : "Declined ✕"}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Interested & Requests */}
        {myTripsTab === "interested" && (
          <div>
            {myInterestedTrips.length === 0 ? (
              <div
                style={{
                  background: "#f9faf5",
                  border: "1px dashed #dce2d5",
                  borderRadius: 16,
                  padding: "45px 25px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 12 }}>🌿</div>
                <h4
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: 20,
                    color: "#294735",
                    margin: "0 0 8px",
                  }}
                >
                  No interested trips yet
                </h4>
                <p style={{ fontSize: 14, color: "#6f796d", marginBottom: 20 }}>
                  Explore adventures in the feed and tap &ldquo;♥ Interested&rdquo; or request
                  to join!
                </p>
                <button
                  onClick={explore}
                  style={{
                    background: "#294735",
                    color: "white",
                    padding: "12px 24px",
                    borderRadius: 30,
                    border: 0,
                    fontSize: 14,
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Explore Adventures ↗
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
                {myInterestedTrips.map((trip) => {
                  const myReq = store.joinRequests.find((r) => r.tripId === trip.id);
                  return (
                    <div
                      key={trip.id}
                      style={{
                        background: "#fffefa",
                        border: "1px solid #e1e7da",
                        borderRadius: 16,
                        padding: 22,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 8,
                          }}
                        >
                          <span style={{ fontSize: 24 }}>{trip.emoji}</span>
                          <button
                            onClick={() => handleRemoveInterested(trip.id)}
                            style={{
                              background: "transparent",
                              border: 0,
                              color: "#8c9987",
                              fontSize: 13,
                              cursor: "pointer",
                            }}
                          >
                            Remove
                          </button>
                        </div>
                        <h4
                          style={{
                            fontFamily: "Georgia, serif",
                            fontSize: 18,
                            color: "#253d30",
                            margin: "0 0 6px",
                          }}
                        >
                          {trip.place}
                        </h4>
                        <div style={{ fontSize: 13, color: "#6e776e", marginBottom: 12 }}>
                          📅 {trip.date} · ~₹{trip.budget.toLocaleString()} / person
                        </div>

                        {/* Join request status pill */}
                        {myReq ? (
                          <div
                            style={{
                              padding: "6px 12px",
                              borderRadius: 10,
                              fontSize: 12,
                              fontWeight: 600,
                              marginBottom: 12,
                              background:
                                myReq.status === "accepted"
                                  ? "#e6f4e3"
                                  : myReq.status === "rejected"
                                  ? "#faeae8"
                                  : "#fff4e5",
                              color:
                                myReq.status === "accepted"
                                  ? "#2c6c22"
                                  : myReq.status === "rejected"
                                  ? "#a03d36"
                                  : "#9e5f0d",
                            }}
                          >
                            {myReq.status === "accepted"
                              ? "✅ Join Request Accepted!"
                              : myReq.status === "rejected"
                              ? "❌ Request Declined"
                              : "⏳ Request Pending Review"}
                          </div>
                        ) : (
                          <div
                            style={{
                              fontSize: 12,
                              color: "#778574",
                              marginBottom: 12,
                            }}
                          >
                            Saved in your interested list.
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        {!myReq && (
                          <button
                            onClick={() => openJoinModal(trip)}
                            style={{
                              flex: 1,
                              padding: "9px 12px",
                              borderRadius: 20,
                              border: 0,
                              background: "#294735",
                              color: "white",
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: "pointer",
                            }}
                          >
                            Request Join
                          </button>
                        )}
                        <button
                          onClick={() => prefillAiPlanner(trip)}
                          style={{
                            flex: 1,
                            padding: "9px 12px",
                            borderRadius: 20,
                            border: "1px solid #d4dfce",
                            background: "#f6f9f3",
                            color: "#294735",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          Plan with AI
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Create a Trip Section */}
      <section
        id="create-trip"
        style={{
          background: "#f0f1e9",
          padding: "75px 6%",
          borderTop: "1px solid #e4e7dd",
        }}
      >
        <div style={{ maxWidth: 640, margin: "auto" }}>
          <div style={{ textAlign: "center", marginBottom: 35 }}>
            <div style={{ fontSize: 12, letterSpacing: 2, color: "#7b8b70" }}>
              COMMUNITY ADVENTURES
            </div>
            <h2
              style={{
                fontFamily: "Georgia, serif",
                fontWeight: 400,
                fontSize: 38,
                margin: "12px 0",
                color: "#253d30",
              }}
            >
              Create a Trip
            </h2>
            <p style={{ color: "#778075", lineHeight: 1.7 }}>
              Post an upcoming trip, specify the budget and group size, and find people
              to share the journey.
            </p>
          </div>

          <div
            style={{
              background: "#fffefa",
              border: "1px solid #e1e7da",
              borderRadius: 20,
              padding: "35px 30px",
              boxShadow: "0 6px 20px #29473506",
            }}
          >
            {createSuccessMsg && (
              <div
                style={{
                  background: "#eaf5e6",
                  border: "1px solid #b7dab1",
                  color: "#2f6b21",
                  padding: "14px 18px",
                  borderRadius: 12,
                  fontSize: 14,
                  marginBottom: 20,
                  textAlign: "center",
                  fontWeight: 500,
                }}
              >
                {createSuccessMsg}
              </div>
            )}

            <form onSubmit={handleCreateTrip} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="createPlace" style={{ fontSize: 13, fontWeight: 600, color: "#425744" }}>
                    Destination *
                  </label>
                  <input
                    id="createPlace"
                    type="text"
                    required
                    placeholder="e.g. Bir Billing, Himachal Pradesh"
                    value={createForm.place}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, place: e.target.value }))}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid #dce2d5",
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="createType" style={{ fontSize: 13, fontWeight: 600, color: "#425744" }}>
                    Trip Theme
                  </label>
                  <select
                    id="createType"
                    value={createForm.type}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, type: e.target.value }))}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid #dce2d5",
                      fontSize: 14,
                      outline: "none",
                      background: "white",
                    }}
                  >
                    <option value="MOUNTAIN ESCAPE">MOUNTAIN ESCAPE</option>
                    <option value="RIVER & ADVENTURE">RIVER & ADVENTURE</option>
                    <option value="CULTURE & SLOW TRAVEL">CULTURE & SLOW TRAVEL</option>
                    <option value="FOREST & WILDLIFE">FOREST & WILDLIFE</option>
                    <option value="BEACH & COASTAL">BEACH & COASTAL</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="createDate" style={{ fontSize: 13, fontWeight: 600, color: "#425744" }}>
                    Dates
                  </label>
                  <input
                    id="createDate"
                    type="text"
                    placeholder="e.g. Dec 12–15"
                    value={createForm.date}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, date: e.target.value }))}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid #dce2d5",
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="createDuration" style={{ fontSize: 13, fontWeight: 600, color: "#425744" }}>
                    Duration (Days)
                  </label>
                  <input
                    id="createDuration"
                    type="number"
                    min="1"
                    max="30"
                    required
                    value={createForm.duration}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, duration: e.target.value }))}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid #dce2d5",
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="createBudget" style={{ fontSize: 13, fontWeight: 600, color: "#425744" }}>
                    Budget (₹ / person)
                  </label>
                  <input
                    id="createBudget"
                    type="number"
                    min="100"
                    required
                    value={createForm.budget}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, budget: e.target.value }))}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid #dce2d5",
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="createSpots" style={{ fontSize: 13, fontWeight: 600, color: "#425744" }}>
                    Group Size / Spots
                  </label>
                  <input
                    id="createSpots"
                    type="number"
                    min="1"
                    max="12"
                    required
                    value={createForm.spots}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, spots: e.target.value }))}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid #dce2d5",
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Tags */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#425744" }}>
                  Interests &amp; Tags
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {AVAILABLE_TAGS.map((tag) => {
                    const isSelected = createForm.selectedTags.includes(tag);
                    return (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 20,
                          fontSize: 12,
                          cursor: "pointer",
                          border: `1px solid ${isSelected ? "#294735" : "#dce2d5"}`,
                          background: isSelected ? "#294735" : "#fafbf8",
                          color: isSelected ? "white" : "#4a5d4e",
                          fontWeight: isSelected ? 600 : 400,
                        }}
                      >
                        {tag} {isSelected && "✓"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Description */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="createDesc" style={{ fontSize: 13, fontWeight: 600, color: "#425744" }}>
                  Short Trip Overview
                </label>
                <textarea
                  id="createDesc"
                  rows={3}
                  placeholder="What's the vibe? e.g. Early sunrise hike, local thalis, cozy bonfires, and stargazing."
                  value={createForm.description}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1px solid #dce2d5",
                    fontSize: 14,
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>

              <p style={{ fontSize: 12, color: "#8a9486", margin: "2px 0 6px" }}>
                🔒 Privacy notice: Keep personal contact details safe. Do not share home
                addresses, phone numbers, or bank details in public trip descriptions.
              </p>

              <button
                type="submit"
                style={{
                  padding: "16px",
                  borderRadius: 30,
                  border: 0,
                  background: "#294735",
                  color: "white",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                + Post Trip &amp; Find Companions
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* AI Itinerary Planner Section */}
      <section id="ai-planner" style={{ background: "#fffefa", padding: "75px 6%" }}>
        <div style={{ maxWidth: 700, margin: "auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontSize: 12, letterSpacing: 2, color: "#7b8b70" }}>
              EXPLORE MORE, PLAN BETTER
            </div>
            <h2
              style={{
                fontFamily: "Georgia, serif",
                fontWeight: 400,
                fontSize: 36,
                margin: "12px 0",
              }}
            >
              Your Travel Itinerary
            </h2>
            <p style={{ color: "#778075", lineHeight: 1.7 }}>
              Tell us where you&apos;re going, and we&apos;ll craft a practical,
              realistic adventure for you.
            </p>
          </div>

          <div
            style={{
              background: "#f9faf5",
              border: "1px solid #e8e9df",
              borderRadius: 18,
              padding: 35,
            }}
          >
            <form
              onSubmit={generateItinerary}
              style={{ display: "flex", flexDirection: "column", gap: 20 }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 20,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label
                    htmlFor="origin"
                    style={{ fontSize: 13, color: "#58745d", fontWeight: 600 }}
                  >
                    Origin (Optional)
                  </label>
                  <input
                    id="origin"
                    type="text"
                    placeholder="e.g. New Delhi"
                    value={plannerForm.origin}
                    onChange={(e) =>
                      setPlannerForm((prev) => ({ ...prev, origin: e.target.value }))
                    }
                    style={{
                      padding: "12px 16px",
                      borderRadius: 10,
                      border: "1px solid #dce2d5",
                      fontSize: 15,
                      outline: "none",
                      background: "white",
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label
                    htmlFor="destination"
                    style={{ fontSize: 13, color: "#58745d", fontWeight: 600 }}
                  >
                    Destination
                  </label>
                  <input
                    id="destination"
                    type="text"
                    required
                    placeholder="e.g. Manali"
                    value={plannerForm.destination}
                    onChange={(e) =>
                      setPlannerForm((prev) => ({ ...prev, destination: e.target.value }))
                    }
                    style={{
                      padding: "12px 16px",
                      borderRadius: 10,
                      border: "1px solid #dce2d5",
                      fontSize: 15,
                      outline: "none",
                      background: "white",
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label
                    htmlFor="duration"
                    style={{ fontSize: 13, color: "#58745d", fontWeight: 600 }}
                  >
                    Duration (Days)
                  </label>
                  <input
                    id="duration"
                    type="number"
                    min="1"
                    max="30"
                    required
                    placeholder="e.g. 3"
                    value={plannerForm.duration}
                    onChange={(e) =>
                      setPlannerForm((prev) => ({ ...prev, duration: e.target.value }))
                    }
                    style={{
                      padding: "12px 16px",
                      borderRadius: 10,
                      border: "1px solid #dce2d5",
                      fontSize: 15,
                      outline: "none",
                      background: "white",
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label
                    htmlFor="budget"
                    style={{ fontSize: 13, color: "#58745d", fontWeight: 600 }}
                  >
                    Budget (INR)
                  </label>
                  <input
                    id="budget"
                    type="number"
                    min="100"
                    required
                    placeholder="e.g. 5000"
                    value={plannerForm.budget}
                    onChange={(e) =>
                      setPlannerForm((prev) => ({ ...prev, budget: e.target.value }))
                    }
                    style={{
                      padding: "12px 16px",
                      borderRadius: 10,
                      border: "1px solid #dce2d5",
                      fontSize: 15,
                      outline: "none",
                      background: "white",
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                style={{
                  marginTop: 10,
                  padding: "16px",
                  borderRadius: 30,
                  border: "0",
                  background: isGenerating ? "#8b9d78" : "#294735",
                  color: "white",
                  fontSize: 16,
                  fontWeight: 500,
                  cursor: isGenerating ? "not-allowed" : "pointer",
                }}
              >
                {isGenerating ? "Generating..." : "Generate my itinerary"}
              </button>
            </form>

            {plannerError && (
              <div
                style={{
                  marginTop: 25,
                  padding: "15px 20px",
                  background: "#fdecea",
                  color: "#c84f4f",
                  borderRadius: 12,
                  fontSize: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <span>{plannerError}</span>
                <button
                  onClick={generateItinerary}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 18,
                    border: "1px solid #dca7a7",
                    background: "white",
                    color: "#a43f3f",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {/* BUDGET INSUFFICIENT: warning card + cost breakdown + alternatives */}
            {result?.insufficientBudget && (
              <div
                style={{
                  marginTop: 35,
                  paddingTop: 35,
                  borderTop: "1px solid #dce2d5",
                }}
              >
                <div
                  style={{
                    background: result.isExtremelyUnrealistic ? "#fff3cd" : "#fff0e6",
                    border: `1.5px solid ${
                      result.isExtremelyUnrealistic ? "#e6a817" : "#d4813a"
                    }`,
                    borderRadius: 14,
                    padding: "22px 24px",
                    marginBottom: 24,
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 8 }}>
                    {result.isExtremelyUnrealistic ? "⚠️" : "💡"}
                  </div>
                  <h4
                    style={{
                      fontFamily: "Georgia, serif",
                      fontSize: 19,
                      color: "#7a4a00",
                      margin: "0 0 8px",
                    }}
                  >
                    {result.isExtremelyUnrealistic
                      ? "Budget is too low for this trip"
                      : "Budget will likely be insufficient"}
                  </h4>
                  <p
                    style={{
                      color: "#8a5500",
                      fontSize: 14,
                      lineHeight: 1.7,
                      margin: "0 0 12px",
                    }}
                  >
                    Your budget of <strong>₹{plannerForm.budget}</strong> is estimated
                    to be{" "}
                    <strong>
                      ₹{result.overageAmount?.toLocaleString()} ({result.overagePct}%)
                      short
                    </strong>
                    . Realistic costs for {plannerForm.duration} day(s) in{" "}
                    {plannerForm.destination} are around{" "}
                    <strong>₹{result.costs?.total?.toLocaleString()}</strong>. Prices
                    are estimates — actual costs may vary.
                  </p>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button
                      onClick={focusBudgetAndReset}
                      style={{
                        padding: "11px 20px",
                        borderRadius: 25,
                        border: "0",
                        background: "#7a4a00",
                        color: "white",
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      ✏️ Increase Budget
                    </button>
                    <button
                      onClick={() =>
                        document
                          .getElementById("cheaper-alternatives")
                          ?.scrollIntoView({ behavior: "smooth" })
                      }
                      style={{
                        padding: "11px 20px",
                        borderRadius: 25,
                        border: "1.5px solid #c47a2a",
                        background: "transparent",
                        color: "#7a4a00",
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      🔍 See Alternatives ↓
                    </button>
                  </div>
                </div>

                {/* Cost breakdown */}
                {result.costs && (
                  <div
                    style={{
                      background: "#f9faf5",
                      border: "1px solid #e8e9df",
                      borderRadius: 12,
                      padding: "18px 22px",
                      marginBottom: 24,
                    }}
                  >
                    <h4
                      style={{
                        fontFamily: "Georgia, serif",
                        fontSize: 17,
                        color: "#294735",
                        margin: "0 0 12px",
                      }}
                    >
                      Estimated Cost Breakdown
                    </h4>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 14,
                        color: "#4a5d4e",
                      }}
                    >
                      <tbody>
                        {result.hasOrigin && (
                          <tr>
                            <td style={{ padding: "5px 0" }}>🚌 Travel (Round-trip)</td>
                            <td style={{ textAlign: "right" }}>
                              ~₹{result.costs.travel.toLocaleString()}
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td style={{ padding: "5px 0" }}>
                            🏨 Accommodation{" "}
                            {!result.costs.accommodationNeeded ? (
                              <span style={{ color: "#8a8a8a", fontSize: 12 }}>
                                (not needed — day trip)
                              </span>
                            ) : !result.costs.isAccommodationIncluded ? (
                              <span style={{ color: "#8a8a8a", fontSize: 12 }}>
                                (in estimate, verify)
                              </span>
                            ) : (
                              ""
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            ~₹{result.costs.accommodation.toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "5px 0" }}>🍽️ Meals</td>
                          <td style={{ textAlign: "right" }}>
                            ~₹{result.costs.meals.toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "5px 0" }}>🎭 Activities</td>
                          <td style={{ textAlign: "right" }}>
                            ~₹{result.costs.activities.toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "5px 0" }}>🚘 Local Transport</td>
                          <td style={{ textAlign: "right" }}>
                            ~₹{result.costs.localTransport.toLocaleString()}
                          </td>
                        </tr>
                        <tr style={{ borderTop: "1px solid #dce2d5" }}>
                          <td
                            style={{
                              padding: "8px 0 0",
                              fontWeight: 600,
                              color: "#253d30",
                            }}
                          >
                            Total Estimate
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              fontWeight: 600,
                              color: "#253d30",
                            }}
                          >
                            ~₹{result.costs.total.toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p style={{ fontSize: 12, color: "#8a8a8a", margin: "10px 0 0" }}>
                      All costs are approximate estimates. Prices vary by season,
                      availability, and personal choices. Please verify locally.
                    </p>
                  </div>
                )}

                {/* Alternatives */}
                {result.alternatives && result.alternatives.length > 0 && (
                  <div id="cheaper-alternatives">
                    {(() => {
                      const allExceed = result.alternatives.every(
                        (a) => a.exceedsBudget
                      );
                      return (
                        <>
                          <h4
                            style={{
                              fontFamily: "Georgia, serif",
                              fontSize: 19,
                              color: "#294735",
                              margin: "0 0 16px",
                            }}
                          >
                            {allExceed
                              ? "Alternative Destinations"
                              : "💚 Cheaper Alternatives"}
                          </h4>
                          {allExceed && (
                            <p
                              style={{
                                fontSize: 13,
                                color: "#7a5a00",
                                background: "#fff9ec",
                                border: "1px solid #e6c56a",
                                borderRadius: 8,
                                padding: "10px 14px",
                                margin: "-8px 0 16px",
                              }}
                            >
                              These options may cost less than your original trip, but
                              they still exceed your current budget.
                            </p>
                          )}
                        </>
                      );
                    })()}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {result.alternatives.map((alt, i) => (
                        <div
                          key={i}
                          style={{
                            background: alt.exceedsBudget ? "#fff8f0" : "#f0f4ec",
                            border: `1px solid ${
                              alt.exceedsBudget ? "#e0b080" : "#d4e0cc"
                            }`,
                            borderRadius: 12,
                            padding: "16px 20px",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              color: "#253d30",
                              marginBottom: 4,
                            }}
                          >
                            {alt.title}
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              color: "#4a5d4e",
                              lineHeight: 1.6,
                              marginBottom: 8,
                            }}
                          >
                            {alt.why_cheaper}
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: alt.exceedsBudget ? "#a05000" : "#58745d",
                            }}
                          >
                            Estimated total: ~₹{alt.totalCost.toLocaleString()}
                            {alt.exceedsBudget && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontSize: 12,
                                  color: "#a05000",
                                }}
                              >
                                ⚠️ Still above your ₹{plannerForm.budget} budget
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* NORMAL ITINERARY: budget is within 10% */}
            {result && !result.insufficientBudget && (
              <div
                style={{
                  marginTop: 35,
                  paddingTop: 35,
                  borderTop: "1px solid #dce2d5",
                }}
              >
                <h3
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: 24,
                    marginBottom: 20,
                    color: "#253d30",
                  }}
                >
                  Your Travel Itinerary
                </h3>

                {/* Slight overage note */}
                {result.slightOverage && result.costs && (
                  <div
                    style={{
                      background: "#fff9ec",
                      border: "1.5px solid #e6c56a",
                      borderRadius: 12,
                      padding: "14px 18px",
                      marginBottom: 22,
                      fontSize: 14,
                      color: "#7a5a00",
                    }}
                  >
                    <strong>💡 Slight budget note:</strong> The estimated total of{" "}
                    <strong>₹{result.costs.total.toLocaleString()}</strong> is{" "}
                    <strong>
                      ₹{result.overageAmount?.toLocaleString()} ({result.overagePct}%)
                      over
                    </strong>{" "}
                    your budget of ₹{plannerForm.budget}. This is within the acceptable
                    range — prices are estimates and may vary.
                  </div>
                )}

                {/* Cost breakdown */}
                {result.costs && (
                  <div
                    style={{
                      background: "#f9faf5",
                      border: "1px solid #e8e9df",
                      borderRadius: 12,
                      padding: "18px 22px",
                      marginBottom: 26,
                    }}
                  >
                    <h4
                      style={{
                        fontFamily: "Georgia, serif",
                        fontSize: 17,
                        color: "#294735",
                        margin: "0 0 12px",
                      }}
                    >
                      Estimated Cost Breakdown
                    </h4>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 14,
                        color: "#4a5d4e",
                      }}
                    >
                      <tbody>
                        {result.hasOrigin && (
                          <tr>
                            <td style={{ padding: "5px 0" }}>🚌 Travel (Round-trip)</td>
                            <td style={{ textAlign: "right" }}>
                              ~₹{result.costs.travel.toLocaleString()}
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td style={{ padding: "5px 0" }}>
                            🏨 Accommodation{" "}
                            {!result.costs.accommodationNeeded || result.costs.accommodation === 0 ? (
                              <span style={{ color: "#8a8a8a", fontSize: 12 }}>
                                (not required — day trip)
                              </span>
                            ) : (
                              <span style={{ color: "#8a8a8a", fontSize: 12 }}>
                                (estimated standard budget stay/homestay)
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            ~₹{result.costs.accommodation.toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "5px 0" }}>🍽️ Meals</td>
                          <td style={{ textAlign: "right" }}>
                            ~₹{result.costs.meals.toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "5px 0" }}>🎭 Activities</td>
                          <td style={{ textAlign: "right" }}>
                            ~₹{result.costs.activities.toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "5px 0" }}>🚘 Local Transport</td>
                          <td style={{ textAlign: "right" }}>
                            ~₹{result.costs.localTransport.toLocaleString()}
                          </td>
                        </tr>
                        <tr style={{ borderTop: "1px solid #dce2d5" }}>
                          <td
                            style={{
                              padding: "8px 0 0",
                              fontWeight: 600,
                              color: "#253d30",
                            }}
                          >
                            Total Estimate
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              fontWeight: 600,
                              color: "#253d30",
                            }}
                          >
                            ~₹{result.costs.total.toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p style={{ fontSize: 12, color: "#8a8a8a", margin: "10px 0 0" }}>
                      {!result.costs.accommodationNeeded || result.costs.accommodation === 0
                        ? "Day trip note: Accommodation is ₹0 as no overnight stay is required. All cost components are calculated strictly in TypeScript."
                        : `Multi-day accommodation assumption: Estimated based on standard budget rooms or verified homestays (~₹${Math.round(result.costs.accommodation / Math.max(1, parseInt(plannerForm.duration) - 1 || 1)).toLocaleString()}/night). All cost components are calculated strictly in TypeScript.`}
                    </p>
                  </div>
                )}

                {/* Markdown itinerary */}
                {result.itinerary_markdown && (
                  <div style={{ fontSize: 15 }}>
                    <RenderMarkdown content={result.itinerary_markdown} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section
        id="about"
        style={{
          maxWidth: 850,
          margin: "auto",
          padding: "85px 6%",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 12, letterSpacing: 2, color: "#839477" }}>
          A SMALL IDEA WITH A BIG OUTDOOR FEELING
        </div>
        <h2
          style={{
            fontFamily: "Georgia, serif",
            fontSize: 42,
            fontWeight: 400,
            lineHeight: 1.2,
            margin: "18px 0",
          }}
        >
          More moments. Fewer notifications.
        </h2>
        <p
          style={{
            color: "#737b70",
            lineHeight: 1.9,
            maxWidth: 600,
            margin: "auto",
          }}
        >
          Girora is a concept for bringing people together around real-world
          adventures. Our goal is simple: help you find a trip worth taking, people to
          share it with, and a reason to put your phone away.
        </p>
        <div
          style={{
            margin: "35px auto 0",
            display: "inline-block",
            background: "#e9eee4",
            borderRadius: 30,
            padding: "14px 22px",
            fontSize: 13,
          }}
        >
          Made for the world beyond your screen 🌱
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid #e8e8de",
          padding: "25px 6%",
          textAlign: "center",
          fontSize: 12,
          color: "#858a7f",
        }}
      >
        © 2026 Girora · Go gently, go farther.
      </footer>
    </main>
  );
}
