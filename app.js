const STORAGE_KEYS = {
  apiKey: "busRouteWidget.apiKey",
  favorites: "busRouteWidget.favorites",
  settings: "busRouteWidget.settings"
};

const FIELD_MASK = [
  "routes.duration",
  "routes.distanceMeters",
  "routes.localizedValues.distance",
  "routes.localizedValues.duration",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.transitDetails.headsign",
  "routes.legs.steps.transitDetails.stopDetails.arrivalStop.name",
  "routes.legs.steps.transitDetails.stopDetails.departureStop.name",
  "routes.legs.steps.transitDetails.transitLine.name",
  "routes.legs.steps.transitDetails.transitLine.nameShort",
  "routes.legs.steps.transitDetails.transitLine.vehicle.type"
].join(",");

const ACCEPTED_BUS_VEHICLE_TYPES = new Set([
  "BUS",
  "INTERCITY_BUS",
  "SHARE_TAXI",
  "TROLLEYBUS"
]);

const DEFAULT_SETTINGS = {
  autoRefresh: false,
  refreshIntervalSeconds: 300
};

const SAMPLE_FAVORITES = [
  { title: "Empalot -> Roc", origin: "Empalot, Toulouse", destination: "Roc, Toulouse" },
  { title: "Roc -> Empalot", origin: "Roc, Toulouse", destination: "Empalot, Toulouse" },
  { title: "Roc -> Saint-Michel", origin: "Roc, Toulouse", destination: "Saint-Michel Marcel Langer, Toulouse" }
];

const state = {
  apiKey: localStorage.getItem(STORAGE_KEYS.apiKey) ?? "",
  favorites: loadFavorites(),
  settings: loadSettings(),
  timerId: null,
  nextRefreshAt: null
};

const elements = {
  apiKeyForm: document.querySelector("#api-key-form"),
  apiKeyInput: document.querySelector("#api-key-input"),
  clearKeyButton: document.querySelector("#clear-key-button"),
  apiStatusBadge: document.querySelector("#api-status-badge"),
  refreshAllButton: document.querySelector("#refresh-all-button"),
  refreshSettingsForm: document.querySelector("#refresh-settings-form"),
  autoRefreshToggle: document.querySelector("#auto-refresh-toggle"),
  refreshIntervalSelect: document.querySelector("#refresh-interval-select"),
  nextRefreshLabel: document.querySelector("#next-refresh-label"),
  routeForm: document.querySelector("#route-form"),
  routeIdInput: document.querySelector("#route-id-input"),
  routeTitleInput: document.querySelector("#route-title-input"),
  routeOriginInput: document.querySelector("#route-origin-input"),
  routeDestinationInput: document.querySelector("#route-destination-input"),
  cancelEditButton: document.querySelector("#cancel-edit-button"),
  editorTitle: document.querySelector("#editor-title"),
  routeCountBadge: document.querySelector("#route-count-badge"),
  emptyState: document.querySelector("#empty-state"),
  routesGrid: document.querySelector("#routes-grid"),
  routeCardTemplate: document.querySelector("#route-card-template"),
  installHelpButton: document.querySelector("#install-help-button"),
  installHelpDialog: document.querySelector("#install-help-dialog"),
  closeInstallHelpButton: document.querySelector("#close-install-help-button")
};

init();

function init() {
  bindEvents();
  applyStoredValuesToControls();
  ensureInitialSamples();
  render();
  syncAutoRefresh();
  registerServiceWorker();
}

function bindEvents() {
  elements.apiKeyForm.addEventListener("submit", onApiKeySubmit);
  elements.clearKeyButton.addEventListener("click", clearApiKey);
  elements.refreshAllButton.addEventListener("click", () => refreshAllRoutes());
  elements.refreshSettingsForm.addEventListener("change", onRefreshSettingsChange);
  elements.routeForm.addEventListener("submit", onRouteFormSubmit);
  elements.cancelEditButton.addEventListener("click", resetRouteEditor);
  elements.installHelpButton.addEventListener("click", () => elements.installHelpDialog.showModal());
  elements.closeInstallHelpButton.addEventListener("click", () => elements.installHelpDialog.close());
}

function applyStoredValuesToControls() {
  elements.apiKeyInput.value = state.apiKey;
  elements.autoRefreshToggle.checked = state.settings.autoRefresh;
  elements.refreshIntervalSelect.value = String(state.settings.refreshIntervalSeconds);
}

function ensureInitialSamples() {
  if (state.favorites.length > 0) {
    return;
  }

  state.favorites = SAMPLE_FAVORITES.map((favorite) => createFavorite(favorite));
  persistFavorites();
}

function render() {
  renderApiStatus();
  renderRefreshSettings();
  renderFavorites();
}

function renderApiStatus() {
  const hasKey = Boolean(state.apiKey.trim());
  elements.apiStatusBadge.textContent = hasKey ? "Key saved" : "Missing key";
  elements.apiStatusBadge.className = `badge ${hasKey ? "status-success" : "muted"}`;
}

function renderRefreshSettings() {
  if (!state.settings.autoRefresh) {
    elements.nextRefreshLabel.textContent = "Auto refresh is off.";
    return;
  }

  if (!state.nextRefreshAt) {
    elements.nextRefreshLabel.textContent = "Auto refresh is armed.";
    return;
  }

  elements.nextRefreshLabel.textContent = `Next refresh around ${formatTime(state.nextRefreshAt)}.`;
}

function renderFavorites() {
  elements.routesGrid.innerHTML = "";
  elements.routeCountBadge.textContent = `${state.favorites.length} route${state.favorites.length === 1 ? "" : "s"}`;
  elements.emptyState.classList.toggle("hidden", state.favorites.length > 0);

  for (const favorite of state.favorites) {
    const snapshot = favorite.snapshot ?? createEmptySnapshot();
    const fragment = elements.routeCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".route-card");

    fragment.querySelector(".route-title").textContent = favorite.title;
    fragment.querySelector(".route-places").textContent = `${favorite.origin} -> ${favorite.destination}`;

    const badge = fragment.querySelector(".route-status-badge");
    badge.textContent = statusLabel(snapshot.status);
    badge.className = `badge route-status-badge ${statusClassName(snapshot.status)}`;

    fragment.querySelector(".metric-duration").textContent = snapshot.totalDurationText ?? "--";
    fragment.querySelector(".metric-distance").textContent = snapshot.totalDistanceText ?? "--";
    fragment.querySelector(".metric-transfers").textContent = snapshot.transferCount ?? "--";

    renderTextLine(fragment.querySelector(".route-lines"), snapshot.busLineNames.length > 0 ? `Lines: ${snapshot.busLineNames.join(", ")}` : "");
    renderTextLine(fragment.querySelector(".route-stops"), snapshot.departureStopName && snapshot.arrivalStopName ? `Stops: ${snapshot.departureStopName} -> ${snapshot.arrivalStopName}` : "");
    renderTextLine(fragment.querySelector(".route-note"), snapshot.validationNote ?? "");
    renderTextLine(fragment.querySelector(".route-error"), snapshot.errorMessage ?? "");

    fragment.querySelector(".route-updated").textContent = `Last updated: ${snapshot.lastUpdated ? formatDateTime(snapshot.lastUpdated) : "Never"}`;

    fragment.querySelector(".card-refresh-button").addEventListener("click", () => refreshFavorite(favorite.id));
    fragment.querySelector(".card-edit-button").addEventListener("click", () => populateRouteEditor(favorite));
    fragment.querySelector(".card-delete-button").addEventListener("click", () => deleteFavorite(favorite.id));
    fragment.querySelector(".card-open-link").href = buildGoogleMapsUrl(favorite);

    card.dataset.favoriteId = favorite.id;
    elements.routesGrid.appendChild(fragment);
  }
}

function renderTextLine(element, text) {
  element.textContent = text;
  element.classList.toggle("hidden", !text);
}

function onApiKeySubmit(event) {
  event.preventDefault();
  state.apiKey = elements.apiKeyInput.value.trim();
  localStorage.setItem(STORAGE_KEYS.apiKey, state.apiKey);
  renderApiStatus();
}

function clearApiKey() {
  state.apiKey = "";
  elements.apiKeyInput.value = "";
  localStorage.removeItem(STORAGE_KEYS.apiKey);
  renderApiStatus();
}

function onRefreshSettingsChange() {
  state.settings.autoRefresh = elements.autoRefreshToggle.checked;
  state.settings.refreshIntervalSeconds = Number(elements.refreshIntervalSelect.value);
  persistSettings();
  syncAutoRefresh();
  renderRefreshSettings();
}

function onRouteFormSubmit(event) {
  event.preventDefault();

  const draft = {
    id: elements.routeIdInput.value || crypto.randomUUID(),
    title: elements.routeTitleInput.value.trim(),
    origin: elements.routeOriginInput.value.trim(),
    destination: elements.routeDestinationInput.value.trim(),
    desiredMode: "BUS",
    createdAt: new Date().toISOString(),
    snapshot: createEmptySnapshot()
  };

  if (!draft.title || !draft.origin || !draft.destination) {
    return;
  }

  const existingIndex = state.favorites.findIndex((item) => item.id === draft.id);

  if (existingIndex >= 0) {
    const existing = state.favorites[existingIndex];
    state.favorites[existingIndex] = {
      ...existing,
      ...draft,
      createdAt: existing.createdAt,
      snapshot: existing.snapshot ?? createEmptySnapshot()
    };
  } else {
    state.favorites.unshift(draft);
  }

  persistFavorites();
  resetRouteEditor();
  renderFavorites();
}

function populateRouteEditor(favorite) {
  elements.routeIdInput.value = favorite.id;
  elements.routeTitleInput.value = favorite.title;
  elements.routeOriginInput.value = favorite.origin;
  elements.routeDestinationInput.value = favorite.destination;
  elements.editorTitle.textContent = "Edit favorite route";
  elements.cancelEditButton.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetRouteEditor() {
  elements.routeForm.reset();
  elements.routeIdInput.value = "";
  elements.editorTitle.textContent = "Add favorite route";
  elements.cancelEditButton.classList.add("hidden");
}

function deleteFavorite(favoriteId) {
  state.favorites = state.favorites.filter((favorite) => favorite.id !== favoriteId);
  persistFavorites();
  renderFavorites();
}

async function refreshAllRoutes() {
  if (!ensureApiKey()) {
    return;
  }

  for (const favorite of state.favorites) {
    await refreshFavorite(favorite.id, { renderAfter: false });
  }

  renderFavorites();
}

async function refreshFavorite(favoriteId, options = { renderAfter: true }) {
  const favorite = state.favorites.find((item) => item.id === favoriteId);

  if (!favorite || !ensureApiKey()) {
    return;
  }

  favorite.snapshot = {
    ...(favorite.snapshot ?? createEmptySnapshot()),
    status: "idle",
    errorMessage: null
  };

  if (options.renderAfter) {
    renderFavorites();
  }

  try {
    const snapshot = await fetchBusRouteSnapshot(favorite, state.apiKey);
    favorite.snapshot = snapshot;
  } catch (error) {
    favorite.snapshot = {
      ...createEmptySnapshot(),
      status: "error",
      lastUpdated: new Date().toISOString(),
      errorMessage: error instanceof Error ? error.message : "Unexpected error"
    };
  }

  persistFavorites();

  if (options.renderAfter) {
    renderFavorites();
  }
}

async function fetchBusRouteSnapshot(favorite, apiKey) {
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK
    },
    body: JSON.stringify({
      origin: { address: favorite.origin },
      destination: { address: favorite.destination },
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
  const timestamp = new Date().toISOString();
  const bestBusOnlyRoute = routes.find((route) => route.isBusOnly);

  if (bestBusOnlyRoute) {
    return {
      status: "busRouteFound",
      totalDurationText: bestBusOnlyRoute.totalDurationText,
      totalDistanceText: bestBusOnlyRoute.totalDistanceText,
      transferCount: bestBusOnlyRoute.transferCount,
      busLineNames: bestBusOnlyRoute.busLineNames,
      departureStopName: bestBusOnlyRoute.departureStopName,
      arrivalStopName: bestBusOnlyRoute.arrivalStopName,
      lastUpdated: timestamp,
      errorMessage: null,
      validationNote: "Validated from Google route steps. Walking is allowed, every transit segment must be bus-like."
    };
  }

  if (routes.length > 0) {
    return {
      status: "noBusOnlyRoute",
      totalDurationText: routes[0].totalDurationText,
      totalDistanceText: routes[0].totalDistanceText,
      transferCount: routes[0].transferCount,
      busLineNames: routes[0].busLineNames,
      departureStopName: routes[0].departureStopName,
      arrivalStopName: routes[0].arrivalStopName,
      lastUpdated: timestamp,
      errorMessage: null,
      validationNote: routes[0].rejectionReason || "Google did not return a strict bus-only route."
    };
  }

  return {
    status: "noBusOnlyRoute",
    totalDurationText: null,
    totalDistanceText: null,
    transferCount: null,
    busLineNames: [],
    departureStopName: null,
    arrivalStopName: null,
    lastUpdated: timestamp,
    errorMessage: null,
    validationNote: "Google returned no transit routes for this origin and destination."
  };
}

function normalizeRoute(route) {
  const steps = (route.legs ?? []).flatMap((leg) => leg.steps ?? []);
  const busLineNames = [];
  let isBusOnly = true;
  let firstDepartureStop = null;
  let lastArrivalStop = null;
  let busSegmentCount = 0;
  let rejectionReason = "";

  for (const step of steps) {
    const travelMode = step.travelMode || "";

    if (travelMode === "WALK" || travelMode === "WALKING") {
      continue;
    }

    if (travelMode !== "TRANSIT") {
      isBusOnly = false;
      rejectionReason = `Rejected because Google returned an unsupported step type (${travelMode || "UNKNOWN"}).`;
      continue;
    }

    busSegmentCount += 1;

    const vehicleType = step.transitDetails?.transitLine?.vehicle?.type || "";
    const lineName =
      step.transitDetails?.transitLine?.nameShort ||
      step.transitDetails?.transitLine?.name ||
      step.transitDetails?.headsign ||
      "";

    if (lineName) {
      busLineNames.push(lineName);
    }

    if (!firstDepartureStop) {
      firstDepartureStop = step.transitDetails?.stopDetails?.departureStop?.name || null;
    }

    if (step.transitDetails?.stopDetails?.arrivalStop?.name) {
      lastArrivalStop = step.transitDetails.stopDetails.arrivalStop.name;
    }

    if (!ACCEPTED_BUS_VEHICLE_TYPES.has(vehicleType)) {
      isBusOnly = false;
      rejectionReason = `Rejected because Google returned a non-bus transit segment (${vehicleType || "UNKNOWN"}).`;
    }
  }

  if (busSegmentCount === 0) {
    isBusOnly = false;
    rejectionReason = "Rejected because Google returned no bus transit segments.";
  }

  return {
    isBusOnly,
    totalDurationText: route.localizedValues?.duration?.text || formatDuration(route.duration),
    totalDistanceText: route.localizedValues?.distance?.text || formatDistance(route.distanceMeters),
    transferCount: busSegmentCount > 0 ? Math.max(busSegmentCount - 1, 0) : null,
    busLineNames: unique(busLineNames),
    departureStopName: firstDepartureStop,
    arrivalStopName: lastArrivalStop,
    rejectionReason
  };
}

function buildGoogleMapsUrl(favorite) {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", favorite.origin);
  url.searchParams.set("destination", favorite.destination);
  url.searchParams.set("travelmode", "transit");
  return url.toString();
}

function ensureApiKey() {
  if (state.apiKey.trim()) {
    return true;
  }

  window.alert("Save your Google Routes API key first.");
  return false;
}

function syncAutoRefresh() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  if (!state.settings.autoRefresh) {
    state.nextRefreshAt = null;
    renderRefreshSettings();
    return;
  }

  state.nextRefreshAt = new Date(Date.now() + state.settings.refreshIntervalSeconds * 1000).toISOString();
  renderRefreshSettings();

  state.timerId = window.setInterval(async () => {
    state.nextRefreshAt = new Date(Date.now() + state.settings.refreshIntervalSeconds * 1000).toISOString();
    renderRefreshSettings();
    if (state.favorites.length > 0 && state.apiKey.trim()) {
      await refreshAllRoutes();
    }
  }, state.settings.refreshIntervalSeconds * 1000);
}

function createFavorite({ title, origin, destination }) {
  return {
    id: crypto.randomUUID(),
    title,
    origin,
    destination,
    desiredMode: "BUS",
    createdAt: new Date().toISOString(),
    snapshot: createEmptySnapshot()
  };
}

function createEmptySnapshot() {
  return {
    status: "idle",
    totalDurationText: null,
    totalDistanceText: null,
    transferCount: null,
    busLineNames: [],
    departureStopName: null,
    arrivalStopName: null,
    lastUpdated: null,
    errorMessage: null,
    validationNote: null
  };
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.favorites);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistFavorites() {
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(state.favorites));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}

function unique(values) {
  return [...new Set(values)];
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    timeStyle: "short"
  }).format(new Date(value));
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

function formatDistance(distanceMeters) {
  if (typeof distanceMeters !== "number") {
    return null;
  }

  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(1)} km`;
  }

  return `${distanceMeters} m`;
}

function statusLabel(status) {
  switch (status) {
    case "busRouteFound":
      return "Bus route found";
    case "noBusOnlyRoute":
      return "No bus-only route";
    case "error":
      return "Error";
    default:
      return "Pending";
  }
}

function statusClassName(status) {
  switch (status) {
    case "busRouteFound":
      return "status-success";
    case "noBusOnlyRoute":
      return "status-warning";
    case "error":
      return "status-error";
    default:
      return "status-idle";
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
      });
    });
  }
}
