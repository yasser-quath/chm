const STORAGE_KEYS = {
  apiKey: "busRouteWidget.apiKey",
  snapshots: "busRouteWidget.snapshots"
};

const ROUTES = [
  {
    id: "empalot-roc",
    title: "Empalot -> Roc",
    origin: "Empalot, Toulouse",
    destination: "Roc, Toulouse"
  },
  {
    id: "roc-empalot",
    title: "Roc -> Empalot",
    origin: "Roc, Toulouse",
    destination: "Empalot, Toulouse"
  },
  {
    id: "roc-saint-michel",
    title: "Roc -> Saint-Michel Marcel Langer",
    origin: "Roc, Toulouse",
    destination: "Saint-Michel Marcel Langer, Toulouse"
  }
];

const FIELD_MASK = [
  "routes.duration",
  "routes.localizedValues.duration",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.transitDetails.transitLine.vehicle.type"
].join(",");

const ACCEPTED_BUS_VEHICLE_TYPES = new Set([
  "BUS",
  "INTERCITY_BUS",
  "SHARE_TAXI",
  "TROLLEYBUS"
]);

const state = {
  apiKey: localStorage.getItem(STORAGE_KEYS.apiKey) ?? "",
  snapshots: loadSnapshots(),
  refreshing: new Set()
};

const elements = {
  refreshAllButton: document.querySelector("#refresh-all-button"),
  routesList: document.querySelector("#routes-list"),
  routeRowTemplate: document.querySelector("#route-row-template")
};

init();

function init() {
  askForApiKeyIfNeeded();
  elements.refreshAllButton.addEventListener("click", refreshAllRoutes);
  render();
  registerServiceWorker();
}

function askForApiKeyIfNeeded() {
  if (state.apiKey.trim()) {
    return;
  }

  const key = window.prompt("Paste your Google Routes API key");
  if (!key) {
    return;
  }

  state.apiKey = key.trim();
  localStorage.setItem(STORAGE_KEYS.apiKey, state.apiKey);
}

function render() {
  elements.routesList.innerHTML = "";

  for (const route of ROUTES) {
    const fragment = elements.routeRowTemplate.content.cloneNode(true);
    const snapshot = state.snapshots[route.id] ?? emptySnapshot();
    const title = fragment.querySelector(".route-title");
    const duration = fragment.querySelector(".route-duration");
    const refreshButton = fragment.querySelector(".route-refresh-button");

    title.textContent = route.title;
    duration.textContent = displayValue(snapshot);
    duration.classList.toggle("muted", snapshot.status !== "busRouteFound");

    refreshButton.disabled = state.refreshing.has(route.id);
    refreshButton.textContent = state.refreshing.has(route.id) ? "Updating..." : "Update";
    refreshButton.addEventListener("click", () => refreshRoute(route.id));

    elements.routesList.appendChild(fragment);
  }
}

function displayValue(snapshot) {
  switch (snapshot.status) {
    case "busRouteFound":
      return snapshot.totalDurationText ?? "--";
    case "noBusOnlyRoute":
      return "No bus";
    case "error":
      return "Error";
    default:
      return "--";
  }
}

async function refreshAllRoutes() {
  if (!ensureApiKey()) {
    return;
  }

  elements.refreshAllButton.disabled = true;
  elements.refreshAllButton.textContent = "Updating...";

  for (const route of ROUTES) {
    await refreshRoute(route.id, false);
  }

  elements.refreshAllButton.disabled = false;
  elements.refreshAllButton.textContent = "Update all";
  render();
}

async function refreshRoute(routeId, rerender = true) {
  const route = ROUTES.find((item) => item.id === routeId);
  if (!route || !ensureApiKey()) {
    return;
  }

  state.refreshing.add(routeId);
  if (rerender) {
    render();
  }

  try {
    state.snapshots[routeId] = await fetchBusRouteSnapshot(route);
  } catch (error) {
    state.snapshots[routeId] = {
      status: "error",
      totalDurationText: null,
      errorMessage: error instanceof Error ? error.message : "Unexpected error"
    };
  }

  persistSnapshots();
  state.refreshing.delete(routeId);

  if (rerender) {
    render();
  }
}

async function fetchBusRouteSnapshot(route) {
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": state.apiKey,
      "X-Goog-FieldMask": FIELD_MASK
    },
    body: JSON.stringify({
      origin: { address: route.origin },
      destination: { address: route.destination },
      travelMode: "TRANSIT",
      computeAlternativeRoutes: true,
      languageCode: navigator.language || "en-US",
      units: "METRIC",
      departureTime: new Date().toISOString(),
      transitPreferences: {
        allowedTravelModes: ["BUS"],
        routingPreference: "FEWER_TRANSFERS"
      }
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Google Routes API error ${response.status}: ${bodyText || "Unknown error"}`);
  }

  const data = await response.json();
  return normalizeRoutesResponse(data);
}

function normalizeRoutesResponse(data) {
  const routes = Array.isArray(data.routes) ? data.routes.map(normalizeRoute) : [];
  const match = routes.find((route) => route.isBusOnly);

  if (match) {
    return {
      status: "busRouteFound",
      totalDurationText: match.totalDurationText,
      errorMessage: null
    };
  }

  if (routes.length > 0) {
    return {
      status: "noBusOnlyRoute",
      totalDurationText: null,
      errorMessage: null
    };
  }

  return {
    status: "error",
    totalDurationText: null,
    errorMessage: "No route returned"
  };
}

function normalizeRoute(route) {
  const steps = (route.legs ?? []).flatMap((leg) => leg.steps ?? []);
  let isBusOnly = true;
  let busSegments = 0;

  for (const step of steps) {
    const travelMode = step.travelMode || "";

    if (travelMode === "WALK" || travelMode === "WALKING") {
      continue;
    }

    if (travelMode !== "TRANSIT") {
      isBusOnly = false;
      continue;
    }

    busSegments += 1;

    const vehicleType = step.transitDetails?.transitLine?.vehicle?.type || "";
    if (!ACCEPTED_BUS_VEHICLE_TYPES.has(vehicleType)) {
      isBusOnly = false;
    }
  }

  if (busSegments === 0) {
    isBusOnly = false;
  }

  return {
    isBusOnly,
    totalDurationText: route.localizedValues?.duration?.text || formatDuration(route.duration)
  };
}

function ensureApiKey() {
  if (state.apiKey.trim()) {
    return true;
  }

  askForApiKeyIfNeeded();
  return Boolean(state.apiKey.trim());
}

function loadSnapshots() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.snapshots) ?? "{}");
  } catch {
    return {};
  }
}

function persistSnapshots() {
  localStorage.setItem(STORAGE_KEYS.snapshots, JSON.stringify(state.snapshots));
}

function emptySnapshot() {
  return {
    status: "idle",
    totalDurationText: null,
    errorMessage: null
  };
}

function formatDuration(durationString) {
  if (!durationString) {
    return null;
  }

  const seconds = Number(String(durationString).replace("s", ""));
  if (!Number.isFinite(seconds)) {
    return durationString;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} hr ${minutes} min`;
  }

  return `${minutes} min`;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
      });
    });
  }
}
