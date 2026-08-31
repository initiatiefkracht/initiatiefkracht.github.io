<script>
  import { onMount, untrack } from "svelte";
  import maplibregl from "maplibre-gl";
  import Papa from "papaparse";
  import "maplibre-gl/dist/maplibre-gl.css";

  let mapContainer = $state();
  let map = $state();
  let mapLoaded = $state(false);
  let allPlaces = $state([]);
  let markers = [];
  let markerMap = new Map();
  let visualMode = $state("default");
  let activeHeatmapDomain = $state(null);
  let activeChoroplethDomain = $state(null);
  let allGeoFeatures = $state([]);
  let currentOpacities = new Map();
  let opacityAnimationFrame = null;

  let selectedPlace = $state(null);
  let hoveredSliceDomain = $state(null);
  let isSelectingLocation = $state(false);
  let tempMarker = null;
  let newInitiative = $state({
    name: "",
    latitude: "",
    longitude: "",
    gebiedList: [],
    domeinen: [],
    website: "",
    koepels: "",
    initiatief_type: "plek",
    location_type: "point",
  });
  let formStatusMessage = $state("");
  let formStatusType = $state("");

  let allPossibleBuurten = $derived(
    [
      ...new Set(
        allGeoFeatures.map((f) => f.properties.buurtnaam).filter(Boolean),
      ),
    ].sort(),
  );
  let activeMarkerElement = $state(null);
  let activeMarkerContainer = $state(null);
  let enlargedImage = $state(null);
  let modalScale = $state(1);
  let modalPosition = $state({ x: 0, y: 0 });
  let isModalDragging = false;
  let dragStart = { x: 0, y: 0 };

  function handleModalWheel(e) {
    if (!enlargedImage) return;
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.1 : 0.9;
    const newScale = Math.min(Math.max(modalScale * factor, 0.5), 10);
    modalScale = newScale;
  }

  function handleModalMouseDown(e) {
    if (modalScale <= 1) return;
    isModalDragging = true;
    dragStart = {
      x: e.clientX - modalPosition.x,
      y: e.clientY - modalPosition.y,
    };
  }

  function handleModalMouseMove(e) {
    if (!isModalDragging) return;
    modalPosition = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    };
  }

  function handleModalTouchStart(e) {
    if (modalScale <= 1 || e.touches.length !== 1) return;
    isModalDragging = true;
    const touch = e.touches[0];
    dragStart = {
      x: touch.clientX - modalPosition.x,
      y: touch.clientY - modalPosition.y,
    };
  }

  function handleModalTouchMove(e) {
    if (!isModalDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    modalPosition = {
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    };
  }

  function handleModalMouseUp() {
    isModalDragging = false;
  }

  function closeImageModal() {
    enlargedImage = null;
    modalScale = 1;
    modalPosition = { x: 0, y: 0 };
  }

  let isMobile = $state(false);
  let showQrBlock = $state(true);

  function initMap(geoData) {
    map = new maplibregl.Map({
      container: mapContainer,
      style: {
        version: 8,
        sources: {
          "satellite-source": {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution:
              "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
          },
        },
        layers: [
          {
            id: "satellite-layer",
            type: "raster",
            source: "satellite-source",
            paint: {
              "raster-saturation": -0.9,
              // "raster-contrast": -0.2,
              "raster-brightness-max": 1,
              "raster-opacity": 0.6,
            },
          },
        ],
      },
      center: [4.47, 51.915],
      zoom: 12.5,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true,
        },
        trackUserLocation: true,
      }),
      "bottom-right",
    );

    map.on("click", (e) => {
      if (isSelectingLocation) {
        const { lng, lat } = e.lngLat;
        newInitiative.latitude = lat.toFixed(6);
        newInitiative.longitude = lng.toFixed(6);

        // Auto-detect the neighborhood (gebied) from the clicked point
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["buurten-fill"],
        });
        if (features.length > 0) {
          const buurtnaam = features[0].properties.buurtnaam || "";
          if (buurtnaam) {
            newInitiative.gebiedList = [buurtnaam];
          }
        }

        // Draw/move temporary marker
        if (tempMarker) {
          tempMarker.setLngLat([lng, lat]);
        } else {
          const el = document.createElement("div");
          el.className = "temp-marker";
          el.innerHTML =
            '<div style="display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background-color: #6458f5; border: 2.5px solid #ffffff;">' +
            '<i class="ph ph-plus" style="font-size: 11px; color: #ffffff; font-weight: 900;"></i>' +
            "</div>";
          tempMarker = new maplibregl.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(map);
        }

        isSelectingLocation = false; // exit selection mode
      }
    });

    map.on("load", () => {
      map.addSource("rotterdam-buurten", {
        type: "geojson",
        data: geoData,
      });

      map.addLayer({
        id: "buurten-fill",
        type: "fill",
        source: "rotterdam-buurten",
        paint: {
          "fill-color": "#5d69fb",
          "fill-opacity": [
            "coalesce",
            ["feature-state", "highlightOpacity"],
            0,
          ],
        },
      });

      mapLoaded = true;
    });

    let currentMarkerSize = null;
    const handleZoom = () => {
      const zoom = map.getZoom();
      let size = 20;
      if (zoom < 12.5) {
        size = 10 + Math.max(0, zoom - 9.5) * (10 / 3.0);
        size = Math.min(20, Math.max(10, size));
      }
      const roundedSize = Math.round(size);
      if (roundedSize !== currentMarkerSize) {
        currentMarkerSize = roundedSize;
        const borderWidth = (1 + (roundedSize - 10) * 0.2).toFixed(1);
        if (mapContainer) {
          mapContainer.style.setProperty("--marker-size", `${roundedSize}px`);
          mapContainer.style.setProperty(
            "--marker-border-width",
            `${borderWidth}px`,
          );
        }
      }
    };
    map.on("zoom", handleZoom);
    map.on("load", handleZoom);
    handleZoom();
  }

  function handleVisualToggle(mode) {
    visualMode = visualMode === mode ? "default" : mode;
  }

  const POINT_ZOOM = 15.5;
  const AREA_ZOOM = 13;
  const LARGE_AREA_ZOOM = 11;
  const MAX_CHOROPLETH_NEIGHBORHOODS = 15;

  const DOMEIN_COLORS = {
    Wonen: "#f44764",
    Welzijn: "#ffeb78",
    Cultuur: "#ffa669",
    Klimaat: "#6bc0c9",
    Voedsel: "#7bc16b",
    Groen: "#a3d1ab",
    Circulair: "#fac559",
    Mobiliteit: "#ff8086",
    Energie: "#ffa6e1",
    default: "#5d69fb",
  };

  const DOMEIN_ICONS = {
    Wonen: "ph-house",
    Welzijn: "ph-heartbeat",
    Cultuur: "ph-paint-brush-broad",
    Klimaat: "ph-cloud-sun",
    Voedsel: "ph-fork-knife",
    Groen: "ph-tree",
    Circulair: "ph-recycle",
    Mobiliteit: "ph-bicycle",
    Energie: "ph-lightning",
    default: "ph-map-pin",
  };

  const GEBIED_COLORS = {
    "Bospolder-Tussendijken": "#F3B1A5",
    "Keilekwartier/M4H": "#A2C3DB",
    Delfshaven: "#B9D4B3",
    Keilewerf: "#8EB8C2",
    Middelland: "#F6D6AD",
    "Nieuw-Mathenesse": "#A7BCC9",
    "Nieuwe Westen": "#DBB1BC",
    "Oud-Mathenesse": "#C8CDA9",
    "Oude Westen": "#EAD9C1",
    Schiehaven: "#B6B6B2",
    Schiemond: "#C9BCE2",
    Agniesebuurt: "#F9E2AF",
    Afrikaanderwijk: "#D2E0BF",
    Blijdorp: "#B0D7D1",
    Carnisse: "#E8C1A0",
    Centrum: "#D1D1D1",
    Crooswijk: "#F2C6DE",
    "De Esch": "#A9D1E6",
    "Eiland van Brienenoord": "#98C9A3",
    Feijenoord: "#E5B9B5",
    Hillesluis: "#E6E2B1",
    Hoogkwartier: "#C1D3FE",
    Katendrecht: "#FBC4AB",
    "Kralingen-Crooswijk": "#D8E2DC",
    Mathenesse: "#DEE2FF",
    Noordereiland: "#BEE1E6",
    "Oud-Charlois": "#E2ECE9",
    Pendrecht: "#D6E2E9",
    "Prins Alexander": "#FAD2E1",
    Rotterdam: "#E9ECEF",
    "Rotterdam-Noord": "#C9ADA7",
    Struisenburg: "#F6BD60",
    Tarwewijk: "#ADC178",
    Vreewijk: "#A3C4BC",
    Zevenkamp: "#D4A373",
    Zomerhofkwartier: "#FFDAC1",
    default: "#C1C8FF",
  };

  const KOEPEL_COLORS = {
    "Energie van Rotterdam": "#F48A8A",
    "Rotterdam Circulair": "#FBBF72",
    Groen010: "#86EFAC",
    "De Groene Connectie": "#5EEAD4",
    "Rotterdams Weerwoord": "#7DD3FC",
    "Welzijnscoalitie Delfshaven": "#D8B4FE",
    Thuismakerscollectief: "#F9A8D4",
    RoCoCo: "#A5B4FC",
    default: "#5d69fb",
  };

  const KOEPEL_WEBSITES = {
    "Energie van Rotterdam": "https://energievanrotterdam.nl/",
    "Rotterdam Circulair": "https://www.rotterdamcirculair.nl/",
    Groen010: "https://www.groen010.net/",
    "De Groene Connectie": "https://degroeneconnectie.nl/",
    "Rotterdams Weerwoord": "https://www.rotterdamsweerwoord.nl/",
    "Welzijnscoalitie Delfshaven": "https://welzijnscoalitie.nl/",
    Thuismakerscollectief: "https://thuismakerscollectief.nl/",
    RoCoCo: "https://rococo.coop/",
  };

  let openSections = $state({
    info: false,
    gebied: false,
    domein: false,
    koepel: false,
    contribute: false,
  });

  function toggleSection(name) {
    openSections[name] = !openSections[name];
  }

  let infoSection = $state();
  let isScrolledDown = $state(false);

  function handleScroll() {
    isScrolledDown = window.scrollY > 300;
  }

  function scrollToInfo() {
    if (infoSection) {
      const headerHeight = 110; // sticky top-header height + buffer
      const rect = infoSection.getBoundingClientRect();
      const targetY = window.scrollY + rect.top - headerHeight;
      window.scrollTo({ top: targetY, behavior: "smooth" });
    }
  }

  function scrollToMap() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  let selectedGebieden = $state([]);
  let selectedDomeinen = $state([]);
  let selectedKoepels = $state([]);
  let clickedAreaGebieden = $state([]);

  let hoveredAreaGebieden = $state([]);

  let locationFilterMode = $state("all");
  let searchQuery = $state("");
  let searchFocused = $state(false);
  let highlightedSearchIndex = $state(-1);
  let mobileSidebarOpen = $state(false);

  $effect(() => {
    searchQuery;
    highlightedSearchIndex = -1;
  });

  function resetFilters() {
    searchQuery = "";
    selectedDomeinen = [];
    selectedKoepels = [];
    selectedGebieden = [];
    locationFilterMode = "all";
    visualMode = "default";
  }

  function handleSearchKeyDown(e) {
    if (searchSuggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightedSearchIndex =
        (highlightedSearchIndex + 1) % searchSuggestions.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedSearchIndex =
        (highlightedSearchIndex - 1 + searchSuggestions.length) %
        searchSuggestions.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (
        highlightedSearchIndex >= 0 &&
        highlightedSearchIndex < searchSuggestions.length
      ) {
        selectPlaceOnMap(searchSuggestions[highlightedSearchIndex]);
        searchQuery = "";
      }
    }
  }

  function selectPlaceOnMap(place) {
    activatePlaceOnMap(place);
  }

  function activatePlaceOnMap(place) {
    if (activeMarkerElement) {
      activeMarkerElement.classList.remove("active-glow");
    }
    if (activeMarkerContainer) {
      activeMarkerContainer.style.zIndex = "";
    }

    selectedPlace = place;
    hoveredSliceDomain = null;
    if (isMobile) {
      mobileSidebarOpen = false;
    }
    const markerEntry = markerMap.get(place);
    if (markerEntry) {
      activeMarkerElement = markerEntry.element;
      activeMarkerContainer = markerEntry.container;
      markerEntry.element.classList.add("active-glow");
      markerEntry.container.style.zIndex = "9999";
    } else {
      activeMarkerElement = null;
      activeMarkerContainer = null;
    }

    const sidebarWidth = 280;
    const desktopPopupWidth = 300;

    const padding = isMobile
      ? {
          top: 280,
          bottom: mobileSidebarOpen ? window.innerHeight * 0.5 + 20 : 60,
          left: 20,
          right: 60,
        }
      : {
          top: 60,
          bottom: 60,
          left: sidebarWidth + 40,
          right: desktopPopupWidth + 160,
        };

    let targetZoom = POINT_ZOOM;

    if (place.location_type === "area") {
      const areaGebiedenParsed = (place.gebied || "")
        .split(";")
        .map((g) => g.trim())
        .filter(Boolean);
      const isLargeArea = areaGebiedenParsed.length > 10;
      targetZoom = isLargeArea ? LARGE_AREA_ZOOM : AREA_ZOOM;
    }

    map.flyTo({
      center: [place.longitude, place.latitude],
      zoom: targetZoom,
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
      speed: 0.8,
      curve: 1.2,
      essential: true,
    });

    if (place.location_type === "area") {
      clickedAreaGebieden = (place.gebied || "")
        .split(";")
        .map((g) => g.trim())
        .filter(Boolean);
    } else {
      clickedAreaGebieden = [];
    }
  }
  let uniqueKoepels = $derived(
    [
      ...new Set(
        allPlaces.flatMap((p) => [
          ...new Set(p.koepels?.split(";").map((k) => k.trim())),
        ]),
      ),
    ]
      .filter(Boolean)
      .sort(),
  );
  let uniqueDomeinen = $derived(
    [
      ...new Set(
        allPlaces.flatMap((p) => [
          ...new Set(p.domeinen?.split(";").map((d) => d.trim())),
        ]),
      ),
    ]
      .filter(Boolean)
      .sort((a, b) => {
        const domeinOrder = Object.keys(DOMEIN_COLORS);
        const aIndex = domeinOrder.indexOf(a);
        const bIndex = domeinOrder.indexOf(b);
        return aIndex - bIndex;
      }),
  );

  let filteredPlaces = $derived(
    allPlaces.filter((p) => {
      let matchesGebied = selectedGebieden.length === 0;
      if (!matchesGebied) {
        const parts = String(p.gebied)
          .split(";")
          .map((g) => g.trim())
          .filter(Boolean);
        const isMultiBuurt = parts.length > 15;

        matchesGebied = selectedGebieden.some((selected) => {
          if (selected === "Rotterdam") {
            return isMultiBuurt || parts.some((g) => g === "Rotterdam");
          }
          return selected === p.gebied;
        });
      }
      const koepelValues = (p.koepels || "").split(";").map((k) => k.trim());
      const matchesKoepel =
        selectedKoepels.length === 0 ||
        koepelValues.some((k) => selectedKoepels.includes(k));
      const placeDomeinen = [
        ...new Set((p.domeinen || "").split(";").map((d) => d.trim())),
      ];
      const matchesDomein =
        selectedDomeinen.length === 0 ||
        selectedDomeinen.every((d) => placeDomeinen.includes(d));
      const matchesLocation =
        locationFilterMode === "points"
          ? p.location_type === "point"
          : locationFilterMode === "areas"
            ? p.location_type === "area"
            : true;
      return matchesGebied && matchesKoepel && matchesDomein && matchesLocation;
    }),
  );

  let searchSuggestions = $derived(
    searchQuery.trim().length > 0
      ? allPlaces.filter((p) =>
          (p.name || "")
            .toLowerCase()
            .includes(searchQuery.trim().toLowerCase()),
        )
      : [],
  );

  let isAnyFilterActive = $derived(
    searchQuery.trim().length > 0 ||
      selectedDomeinen.length > 0 ||
      selectedKoepels.length > 0 ||
      selectedGebieden.length > 0 ||
      locationFilterMode !== "all",
  );

  /** @param {string} name */
  function normalizeBuurtName(name) {
    if (!name) return "";
    return String(name)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[\s–—]+/g, " ")
      .replace(/[^a-z0-9 ]/g, "");
  }

  /** @param {string} gebied
   *  @param {{[key:string]: string}} buurtMap
   */
  function canonicalizeGebiedNames(gebied, buurtMap) {
    if (!gebied) return "";
    const parts = String(gebied)
      .split(";")
      .map((g) => g.trim())
      .filter(Boolean);
    return parts
      .map((part) => {
        const normalized = normalizeBuurtName(part);
        if (normalized === "rotterdam") return "Rotterdam";
        if (buurtMap[normalized]) return buurtMap[normalized];
        const candidates = Object.keys(buurtMap).filter(
          (key) => key.includes(normalized) || normalized.includes(key),
        );
        if (candidates.length === 1) {
          return buurtMap[candidates[0]];
        }
        return part;
      })
      .filter(Boolean)
      .join("; ");
  }

  /** @param {Array<any>} places */
  function ensureUniqueCoordinates(places) {
    const coordMap = new Map();
    places.forEach((place) => {
      if (place.longitude == null || place.latitude == null) return;
      const key = `${Number(place.longitude).toFixed(6)}|${Number(place.latitude).toFixed(6)}`;
      const list = coordMap.get(key) || [];
      list.push(place);
      coordMap.set(key, list);
    });

    coordMap.forEach((placesAtSamePoint) => {
      if (placesAtSamePoint.length <= 1) return;
      const baseLng = Number(placesAtSamePoint[0].longitude);
      const baseLat = Number(placesAtSamePoint[0].latitude);
      const spacing = 0.00004;
      const angleStep = (2 * Math.PI) / placesAtSamePoint.length;
      placesAtSamePoint.forEach((place, idx) => {
        if (idx === 0) return;
        const radius = spacing * Math.ceil(idx / 6);
        const angle = angleStep * idx;
        place.longitude = baseLng + Math.cos(angle) * radius;
        place.latitude = baseLat + Math.sin(angle) * radius;
      });
    });
  }

  /** @param {any} value */
  function normalizeText(value) {
    if (!value) return "";
    return String(value)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ");
  }

  /** @param {any} a
   *  @param {any} b
   */
  function locationDistance(a, b) {
    return Math.max(
      Math.abs(Number(a.latitude) - Number(b.latitude)),
      Math.abs(Number(a.longitude) - Number(b.longitude)),
    );
  }

  /** @param {any} place */
  function detailScore(place) {
    return Object.values(place).reduce((score, value) => {
      if (value == null) return score;
      const str = String(value).trim();
      return score + (str.length > 0 ? 1 : 0);
    }, 0);
  }

  /** @param {any[]} places */
  function dedupePlaces(places) {
    const grouped = /** @type {any[][]} */ ([]);
    const threshold = 0.0002; // ~20 meters

    places.forEach((place) => {
      const name = normalizeText(place.name || place.naam || "");
      const lat = Number(place.latitude);
      const lng = Number(place.longitude);
      if (!name || Number.isNaN(lat) || Number.isNaN(lng)) {
        grouped.push(place);
        return;
      }

      let matched = null;
      for (const group of grouped) {
        const existing = group[0];
        const existingName = normalizeText(
          existing.name || existing.naam || "",
        );
        const dist = locationDistance(place, existing);
        if (dist <= threshold) {
          if (
            existingName === name ||
            existingName.includes(name) ||
            name.includes(existingName)
          ) {
            matched = group;
            break;
          }
        }
      }

      if (matched) {
        matched.push(place);
      } else {
        grouped.push([place]);
      }
    });

    /** @param {any[]} group */
    function pickBestRecord(group) {
      return group.reduce((best, current) =>
        detailScore(current) > detailScore(best) ? current : best,
      );
    }

    return grouped.map((group) =>
      group.length === 1 ? group[0] : pickBestRecord(group),
    );
  }

  function formatGebiedLabel(gebied) {
    if (!gebied) return "Rotterdam";
    const parts = String(gebied)
      .split(";")
      .map((g) => g.trim())
      .filter(Boolean);
    if (parts.length > 15) return "Rotterdam";
    return parts.join("; ");
  }

  let buurtToFeatureIds = new Map();

  $effect(() => {
    const handleResize = () => {
      isMobile = window.innerWidth < 900;
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  });

  onMount(async () => {
    const response = await fetch("initiatieven.csv");
    const csvString = await response.text();
    const geoResponse = await fetch("rotterdam-buurten.json");
    const geoData = await geoResponse.json();

    geoData.features.forEach((f, i) => (f.id = i));
    allGeoFeatures = geoData.features;

    buurtToFeatureIds = new Map();
    geoData.features.forEach((feature) => {
      const buurtnaam = feature.properties.buurtnaam;
      if (buurtnaam) {
        if (!buurtToFeatureIds.has(buurtnaam)) {
          buurtToFeatureIds.set(buurtnaam, []);
        }
        buurtToFeatureIds.get(buurtnaam).push(feature.id);
      }
    });

    Papa.parse(csvString, {
      header: true,
      dynamicTyping: true,
      complete: (results) => {
        allPlaces = dedupePlaces(
          results.data.filter((p) => p.latitude && p.longitude),
        );

        const allBuurten = geoData.features
          .map((feature) => feature.properties.buurtnaam)
          .filter(Boolean)
          .join("; ");
        allPlaces.forEach((place) => {
          if (
            place.location_type === "area" &&
            String(place.gebied).trim().toLowerCase() === "rotterdam"
          ) {
            place.gebied = allBuurten;
          }
        });

        /** @type {{[key:string]: string}} */
        const buurtNameMap = {};
        geoData.features.forEach((feature) => {
          const buurtnaam = feature.properties.buurtnaam;
          if (buurtnaam) {
            buurtNameMap[normalizeBuurtName(buurtnaam)] = buurtnaam;
          }
        });

        allPlaces.forEach((place) => {
          if (!place.gebied) return;
          place.gebied = canonicalizeGebiedNames(place.gebied, buurtNameMap);
        });

        const localAdded = JSON.parse(
          localStorage.getItem("local_initiatives") || "[]",
        );
        if (localAdded.length > 0) {
          allPlaces = [...allPlaces, ...localAdded];
        }

        ensureUniqueCoordinates(allPlaces);

        initMap(geoData);
      },
    });
  });

  function closePopup() {
    if (activeMarkerElement) {
      activeMarkerElement.classList.remove("active-glow");
    }
    if (activeMarkerContainer) {
      activeMarkerContainer.style.zIndex = "";
    }
    selectedPlace = null;
    hoveredSliceDomain = null;
    activeMarkerElement = null;
    activeMarkerContainer = null;
    clickedAreaGebieden = [];
  }

  async function saveInitiative() {
    if (!newInitiative.name.trim()) {
      formStatusMessage = "Vul a.b.b. de naam in.";
      formStatusType = "error";
      return;
    }
    if (!newInitiative.latitude || !newInitiative.longitude) {
      formStatusMessage = "Kies a.b.b. de locatie op de kaart.";
      formStatusType = "error";
      return;
    }

    const nextFid =
      allPlaces.length > 0
        ? Math.max(...allPlaces.map((p) => p.fid || 0)) + 1
        : 1;

    const data = {
      fid: nextFid,
      name: newInitiative.name,
      latitude: parseFloat(newInitiative.latitude),
      longitude: parseFloat(newInitiative.longitude),
      gebied: newInitiative.gebiedList.join("; "),
      domeinen: newInitiative.domeinen.join("; "),
      website: newInitiative.website,
      koepels: newInitiative.koepels,
      initiatief_type: newInitiative.initiatief_type,
      location_type: newInitiative.location_type,
    };

    try {
      const response = await fetch("/api/add-initiative", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (result.success) {
        formStatusMessage = "Initiatief succesvol toegevoegd aan de kaart!";
        formStatusType = "success";

        // Add to local state dynamically
        allPlaces.push(data);

        // Clear form
        resetForm();
      } else {
        throw new Error(result.error || "Onbekende fout");
      }
    } catch (e) {
      console.warn(
        "Could not save to CSV backend. Falling back to local storage.",
        e,
      );
      // Fallback: save to state and localStorage (for static production builds)
      allPlaces.push(data);

      const localAdded = JSON.parse(
        localStorage.getItem("local_initiatives") || "[]",
      );
      localAdded.push(data);
      localStorage.setItem("local_initiatives", JSON.stringify(localAdded));

      formStatusMessage =
        "Initiatief toegevoegd aan de kaart in-memory (lokaal opgeslagen).";
      formStatusType = "success";

      resetForm();
    }
  }

  function resetForm() {
    newInitiative = {
      name: "",
      latitude: "",
      longitude: "",
      gebiedList: [],
      domeinen: [],
      website: "",
      koepels: "",
      initiatief_type: "plek",
      location_type: "point",
    };
    if (tempMarker) {
      tempMarker.remove();
      tempMarker = null;
    }
  }

  function downloadCSV() {
    const headers = [
      "fid",
      "name",
      "latitude",
      "longitude",
      "gebied",
      "domeinen",
      "website",
      "koepels",
      "initiatief_type",
      "location_type",
    ];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return "";
      let str = String(val);
      if (
        str.includes(";") ||
        str.includes('"') ||
        str.includes("\n") ||
        str.includes("\r")
      ) {
        str = '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const rows = allPlaces.map((p) =>
      [
        p.fid,
        escapeCSV(p.name),
        p.latitude,
        p.longitude,
        escapeCSV(p.gebied),
        escapeCSV(p.domeinen),
        escapeCSV(p.website),
        escapeCSV(p.koepels),
        escapeCSV(p.initiatief_type),
        escapeCSV(p.location_type),
      ].join(";"),
    );

    const csvContent = [headers.join(";"), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "initiatieven.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  let highlightedFeatureIds = new Set();
  $effect(() => {
    if (!mapLoaded || !map) return;

    const areas = filteredPlaces.filter((p) => p.location_type === "area");
    const hoveredSet = new Set(hoveredAreaGebieden);
    const clickedSet = new Set(clickedAreaGebieden);

    const nextHighlightedIds = new Set();
    areas.forEach((p) => {
      const gebieden = p.gebied.split(";").map((g) => g.trim());
      gebieden.forEach((gebied) => {
        if (hoveredSet.has(gebied) || clickedSet.has(gebied)) {
          const ids = buurtToFeatureIds.get(gebied) || [];
          ids.forEach((id) => nextHighlightedIds.add(id));
        }
      });
    });

    highlightedFeatureIds.forEach((id) => {
      if (!nextHighlightedIds.has(id)) {
        map.setFeatureState(
          { source: "rotterdam-buurten", id },
          { highlight: false },
        );
      }
    });

    nextHighlightedIds.forEach((id) => {
      if (!highlightedFeatureIds.has(id)) {
        map.setFeatureState(
          { source: "rotterdam-buurten", id },
          { highlight: true },
        );
      }
    });

    highlightedFeatureIds = nextHighlightedIds;

    const targetOpacities = new Map();
    const duration = 400;
    const maxOpacity = 0.3;

    nextHighlightedIds.forEach((id) => targetOpacities.set(id, maxOpacity));

    currentOpacities.forEach((_, id) => {
      if (!targetOpacities.has(id)) {
        targetOpacities.set(id, 0);
      }
    });

    if (opacityAnimationFrame) cancelAnimationFrame(opacityAnimationFrame);

    const startTime = performance.now();
    const startOpacities = new Map(currentOpacities);

    function animateOpacity(time) {
      const progress = Math.min((time - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 2);

      let needsNextFrame = false;

      targetOpacities.forEach((targetVal, id) => {
        const startVal = startOpacities.get(id) || 0;
        const currentVal = startVal + (targetVal - startVal) * ease;

        currentOpacities.set(id, currentVal);

        map.setFeatureState(
          { source: "rotterdam-buurten", id },
          { highlightOpacity: currentVal },
        );

        if (progress < 1) {
          needsNextFrame = true;
        } else if (targetVal === 0) {
          currentOpacities.delete(id);
        }
      });

      if (needsNextFrame) {
        opacityAnimationFrame = requestAnimationFrame(animateOpacity);
      }
    }

    opacityAnimationFrame = requestAnimationFrame(animateOpacity);
  });

  function getPieChartSvg(colors, isArea = false, outerColor = "#ffffff") {
    if (isArea) {
      const cx = 50;
      const cy = 50;
      const outerR = 36;
      const innerR = 29;

      if (colors.length === 0) {
        return `<svg viewBox="0 0 100 100" width="100%" height="100%" style="display: block; overflow: visible;">
          <circle cx="${cx}" cy="${cy}" r="${outerR}" fill="${outerColor}" class="outer-border-circle" />
          <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="#5d69fb" class="inner-circle" />
        </svg>`;
      }
      if (colors.length === 1) {
        return `<svg viewBox="0 0 100 100" width="100%" height="100%" style="display: block; overflow: visible;">
          <circle cx="${cx}" cy="${cy}" r="${outerR}" fill="${outerColor}" class="outer-border-circle" />
          <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="${colors[0]}" class="inner-circle" />
        </svg>`;
      }

      let paths = [];
      const totalSlices = colors.length;

      let accumulatedAngle = -Math.PI / 2; // start at top (12 o'clock)
      const anglePerSlice = (2 * Math.PI) / totalSlices;

      for (let i = 0; i < totalSlices; i++) {
        const startAngle = accumulatedAngle;
        const endAngle = accumulatedAngle + anglePerSlice;
        accumulatedAngle = endAngle;

        const x1 = cx + innerR * Math.cos(startAngle);
        const y1 = cy + innerR * Math.sin(startAngle);
        const x2 = cx + innerR * Math.cos(endAngle);
        const y2 = cy + innerR * Math.sin(endAngle);

        const largeArcFlag = 0;
        const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${innerR} ${innerR} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
        paths.push(`<path d="${pathData}" fill="${colors[i]}" />`);
      }

      const clipId = "area-clip-" + Math.random().toString(36).substring(2, 9);

      return `<svg viewBox="0 0 100 100" width="100%" height="100%" style="display: block; overflow: visible;">
        <defs>
          <clipPath id="${clipId}">
            <circle cx="${cx}" cy="${cy}" r="${innerR}" />
          </clipPath>
        </defs>
        <circle cx="${cx}" cy="${cy}" r="${outerR}" fill="${outerColor}" class="outer-border-circle" />
        <g clip-path="url(#${clipId})">
          ${paths.join("")}
        </g>
        <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="none" class="inner-circle" />
      </svg>`;
    }

    const dropletPath =
      "M 50 92 C 40 80, 18 63, 18 40 A 32 32 0 1 1 82 40 C 82 63, 60 80, 50 92 Z";

    if (colors.length === 0) {
      return `<svg viewBox="0 0 100 100" width="100%" height="100%" style="display: block; overflow: visible;">
        <path class="outer-droplet" d="${dropletPath}" fill="${outerColor}" />
        <circle cx="50" cy="40" r="29" fill="#5d69fb" class="inner-circle" />
      </svg>`;
    }
    if (colors.length === 1) {
      return `<svg viewBox="0 0 100 100" width="100%" height="100%" style="display: block; overflow: visible;">
        <path class="outer-droplet" d="${dropletPath}" fill="${outerColor}" />
        <circle cx="50" cy="40" r="29" fill="${colors[0]}" class="inner-circle" />
      </svg>`;
    }

    const r = 29; // Radius of the inner circle
    const cx = 50; // Center of the circular part
    const cy = 40; // Center of the circular part
    let paths = [];
    const totalSlices = colors.length;

    let accumulatedAngle = -Math.PI / 2; // start at top (12 o'clock)
    const anglePerSlice = (2 * Math.PI) / totalSlices;

    for (let i = 0; i < totalSlices; i++) {
      const startAngle = accumulatedAngle;
      const endAngle = accumulatedAngle + anglePerSlice;
      accumulatedAngle = endAngle;

      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);

      const largeArcFlag = 0;
      const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
      paths.push(`<path d="${pathData}" fill="${colors[i]}" />`);
    }

    const clipId = "droplet-clip-" + Math.random().toString(36).substring(2, 9);

    return `<svg viewBox="0 0 100 100" width="100%" height="100%" style="display: block; overflow: visible;">
      <defs>
        <clipPath id="${clipId}">
          <circle cx="50" cy="40" r="29" />
        </clipPath>
      </defs>
      <path class="outer-droplet" d="${dropletPath}" fill="${outerColor}" />
      <g clip-path="url(#${clipId})">
        ${paths.join("")}
      </g>
      <circle cx="50" cy="40" r="29" fill="none" class="inner-circle" />
    </svg>`;
  }

  function getPieSlices(domains) {
    const totalSlices = domains.length;
    if (totalSlices === 0) {
      return [
        {
          d: "",
          fill: DOMEIN_COLORS.default,
          domain: "default",
        },
      ];
    }
    if (totalSlices === 1) {
      return [
        {
          d: "",
          fill: DOMEIN_COLORS[domains[0]] || DOMEIN_COLORS.default,
          domain: domains[0],
        },
      ];
    }

    const r = 50;
    const cx = 50;
    const cy = 50;
    let slices = [];
    let accumulatedAngle = -Math.PI / 2; // start at top (12 o'clock)
    const anglePerSlice = (2 * Math.PI) / totalSlices;

    for (let i = 0; i < totalSlices; i++) {
      const startAngle = accumulatedAngle;
      const endAngle = accumulatedAngle + anglePerSlice;
      accumulatedAngle = endAngle;

      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);

      const largeArcFlag = 0;
      const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
      slices.push({
        d: pathData,
        fill: DOMEIN_COLORS[domains[i]] || DOMEIN_COLORS.default,
        domain: domains[i],
      });
    }
    return slices;
  }

  $effect(() => {
    if (!map) return;

    if (activeHeatmapDomain || activeChoroplethDomain) {
      markers.forEach((m) => m.remove());
      markers = [];
      markerMap.clear();
      return;
    }

    const reversedPlaces = [...filteredPlaces].reverse();

    reversedPlaces.forEach((place) => {
      const container = document.createElement("div");
      container.className = "marker-container";

      const el = document.createElement("div");
      const isArea = place.location_type === "area";

      el.className = "air-marker";
      if (isArea) el.classList.add("air-area-marker");
      if (visualMode === "domein") el.classList.add("thin-border");
      const domeinList = [
        ...new Set((place.domeinen || "").split(";").map((d) => d.trim())),
      ].filter(Boolean);

      let sliceColors = [];
      if (visualMode === "domein") {
        if (domeinList.length === 0) {
          sliceColors = [DOMEIN_COLORS.default];
        } else {
          sliceColors = domeinList.map(
            (d) => DOMEIN_COLORS[d] || DOMEIN_COLORS.default,
          );
        }
      } else {
        sliceColors = [DOMEIN_COLORS.default];
      }

      let borderCol = "#5d69fb";
      if (visualMode === "gebied") {
        const gebiedKey = place.gebied || "default";
        borderCol = GEBIED_COLORS[gebiedKey] || GEBIED_COLORS.default;
      } else if (visualMode === "koepel") {
        const koepelKey =
          (place.koepels || "").split(";").map((k) => k.trim())[0] || "default";
        borderCol = KOEPEL_COLORS[koepelKey] || KOEPEL_COLORS.default;
      }

      const outerColor =
        visualMode === "koepel" || visualMode === "gebied"
          ? borderCol
          : "#ffffff";

      el.innerHTML = getPieChartSvg(sliceColors, isArea, outerColor);
      container.appendChild(el);

      el.style.backgroundColor = "transparent";
      el.style.borderColor = borderCol;
      el.style.setProperty("--marker-border-color", borderCol);
      el.style.setProperty("--outer-droplet-color", outerColor);

      if (isArea) {
        const areaGebieden = (place.gebied || "")
          .split(";")
          .map((g) => g.trim());
        el.addEventListener("mouseenter", () => {
          hoveredAreaGebieden = areaGebieden.filter(Boolean);
        });

        el.addEventListener("mouseleave", () => {
          hoveredAreaGebieden = [];
        });
      }

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        activatePlaceOnMap(place);
      });

      const m = new maplibregl.Marker({
        element: container,
        anchor: isArea ? "center" : "bottom",
      })
        .setLngLat([place.longitude, place.latitude])
        .addTo(map);

      const currentSelected = untrack(() => selectedPlace);
      if (place === currentSelected) {
        el.classList.add("active-glow");
        container.style.zIndex = "9999";
        activeMarkerElement = el;
        activeMarkerContainer = container;
      }

      markers.push(m);
      markerMap.set(place, { element: el, container: container, marker: m });
    });

    return () => {
      markers.forEach((m) => m.remove());
      markers = [];
      markerMap.clear();
    };
  });

  let wasHeatmapActive = false;
  $effect(() => {
    const isActive =
      activeHeatmapDomain !== null || activeChoroplethDomain !== null;
    if (isActive && !wasHeatmapActive && map) {
      map.flyTo({
        center: [4.47, 51.915],
        zoom: 11.5,
        essential: true,
      });
    }
    wasHeatmapActive = isActive;
  });

  $effect(() => {
    if (!mapLoaded || !map) return;

    if (!activeHeatmapDomain) {
      if (map.getLayer("heatmap-layer")) {
        map.removeLayer("heatmap-layer");
      }
      if (map.getSource("heatmap-source")) {
        map.removeSource("heatmap-source");
      }
      return;
    }

    const features = allPlaces
      .map((place) => {
        const lon = parseFloat(place.longitude);
        const lat = parseFloat(place.latitude);
        if (isNaN(lon) || isNaN(lat)) return null;

        const props = {};
        const domeinen = (place.domeinen || "")
          .split(";")
          .map((d) => d.trim())
          .filter(Boolean);
        domeinen.forEach((d) => {
          props[`is_${d}`] = true;
        });
        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [lon, lat],
          },
          properties: props,
        };
      })
      .filter(Boolean);

    const geoJson = {
      type: "FeatureCollection",
      features,
    };

    if (!map.getSource("heatmap-source")) {
      map.addSource("heatmap-source", {
        type: "geojson",
        data: geoJson,
      });
    } else {
      map.getSource("heatmap-source").setData(geoJson);
    }

    const beforeId = map.getLayer("buurten-fill") ? "buurten-fill" : undefined;

    if (!map.getLayer("heatmap-layer")) {
      map.addLayer(
        {
          id: "heatmap-layer",
          type: "heatmap",
          source: "heatmap-source",
          filter: ["has", `is_${activeHeatmapDomain}`],
          paint: {
            "heatmap-weight": 1,
            "heatmap-intensity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              1,
              15,
              3,
            ],
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0,
              "rgba(0, 0, 255, 0)",
              0.2,
              "rgba(0, 0, 255, 0.2)",
              0.4,
              "rgba(0, 255, 255, 0.5)",
              0.6,
              "rgba(0, 255, 0, 0.6)",
              0.8,
              "rgba(255, 255, 0, 0.7)",
              1.0,
              "rgba(255, 0, 0, 0.8)",
            ],
            "heatmap-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              2,
              9,
              15,
              15,
              35,
            ],
            "heatmap-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              13,
              0.75,
              15,
              0.4,
              17,
              0,
            ],
          },
        },
        beforeId,
      );
    } else {
      map.setFilter("heatmap-layer", ["has", `is_${activeHeatmapDomain}`]);
    }

    return () => {
      if (map && map.getLayer("heatmap-layer")) {
        map.removeLayer("heatmap-layer");
      }
      if (map && map.getSource("heatmap-source")) {
        map.removeSource("heatmap-source");
      }
    };
  });

  $effect(() => {
    if (!mapLoaded || !map) return;

    const counts = new Map();
    if (activeChoroplethDomain) {
      allPlaces.forEach((place) => {
        const domeinen = (place.domeinen || "")
          .split(";")
          .map((d) => d.trim())
          .filter(Boolean);
        if (domeinen.includes(activeChoroplethDomain)) {
          const gebieden = (place.gebied || "")
            .split(";")
            .map((g) => g.trim())
            .filter(Boolean);
          if (gebieden.length <= MAX_CHOROPLETH_NEIGHBORHOODS) {
            gebieden.forEach((buurt) => {
              counts.set(buurt, (counts.get(buurt) || 0) + 1);
            });
          }
        }
      });
    }

    allGeoFeatures.forEach((feature) => {
      const name = feature.properties.buurtnaam;
      const count = name ? counts.get(name) || 0 : 0;
      map.setFeatureState(
        { source: "rotterdam-buurten", id: feature.id },
        { choroplethCount: count },
      );
    });

    if (activeChoroplethDomain) {
      const color =
        DOMEIN_COLORS[activeChoroplethDomain] || DOMEIN_COLORS.default;
      map.setPaintProperty("buurten-fill", "fill-color", color);
      map.setPaintProperty(
        "buurten-fill",
        "fill-opacity",
        globalMaxCount > 1
          ? [
              "interpolate",
              ["linear"],
              ["sqrt", ["coalesce", ["feature-state", "choroplethCount"], 0]],
              0,
              0,
              1,
              0.2,
              Math.sqrt(globalMaxCount),
              0.85,
            ]
          : [
              "interpolate",
              ["linear"],
              ["coalesce", ["feature-state", "choroplethCount"], 0],
              0,
              0,
              1,
              0.5,
            ],
      );
    } else {
      map.setPaintProperty("buurten-fill", "fill-color", "#5d69fb");
      map.setPaintProperty("buurten-fill", "fill-opacity", [
        "coalesce",
        ["feature-state", "highlightOpacity"],
        0,
      ]);
    }

    return () => {
      if (map) {
        allGeoFeatures.forEach((feature) => {
          map.setFeatureState(
            { source: "rotterdam-buurten", id: feature.id },
            { choroplethCount: 0 },
          );
        });
        if (map.getLayer("buurten-fill")) {
          map.setPaintProperty("buurten-fill", "fill-color", "#5d69fb");
          map.setPaintProperty("buurten-fill", "fill-opacity", [
            "coalesce",
            ["feature-state", "highlightOpacity"],
            0,
          ]);
        }
      }
    };
  });

  function toggleFilter(list, value) {
    if (list.includes(value)) return list.filter((i) => i !== value);
    return [...list, value];
  }

  $effect(() => {
    if (isMobile && selectedPlace && map) {
      mobileSidebarOpen;
      activatePlaceOnMap(selectedPlace);
    }
  });

  let uniqueGebieden = $derived.by(() => {
    const gebieden = new Set();
    allPlaces.forEach((p) => {
      if (!p.gebied) return;
      const parts = String(p.gebied)
        .split(";")
        .map((g) => g.trim())
        .filter(Boolean);
      if (parts.length === 1) {
        gebieden.add(parts[0]);
      } else if (parts.length > 15) {
        gebieden.add("Rotterdam");
      }
    });
    return [...gebieden].sort();
  });

  let globalMaxCount = $derived.by(() => {
    let max = 1;
    const domains = Object.keys(DOMEIN_COLORS).filter((d) => d !== "default");
    domains.forEach((domain) => {
      const counts = new Map();
      allPlaces.forEach((place) => {
        const domeinen = (place.domeinen || "")
          .split(";")
          .map((d) => d.trim())
          .filter(Boolean);
        if (domeinen.includes(domain)) {
          const gebieden = (place.gebied || "")
            .split(";")
            .map((g) => g.trim())
            .filter(Boolean);
          if (gebieden.length <= MAX_CHOROPLETH_NEIGHBORHOODS) {
            gebieden.forEach((buurt) => {
              counts.set(buurt, (counts.get(buurt) || 0) + 1);
            });
          }
        }
      });
      counts.forEach((c) => {
        if (c > max) max = c;
      });
    });
    return max;
  });
</script>

<svelte:window onscroll={handleScroll} />

<div class="layout" onclick={closePopup} role="presentation">
  <!-- Top Header Bar -->
  <header class="top-header">
    <div class="header-content">
      <h1 class="top-title">IN OPBOUW:<br />INITIATIEFKRACHT IN KAART</h1>
      <button
        class="info-scroll-trigger"
        onclick={isScrolledDown ? scrollToMap : scrollToInfo}
        type="button"
      >
        <span>{isScrolledDown ? "KAART" : "INFORMATIE"}</span>
        <i class="ph {isScrolledDown ? 'ph-caret-up' : 'ph-caret-down'}"></i>
      </button>
    </div>
  </header>

  <!-- Centered Map Frame (90% width) -->
  <main class="map-frame">
    <aside
      class="sidebar"
      class:open={mobileSidebarOpen}
      onclick={(e) => e.stopPropagation()}
      ontouchstart={(e) => e.stopPropagation()}
      ontouchmove={(e) => e.stopPropagation()}
      ontouchend={(e) => e.stopPropagation()}
      onpointerdown={(e) => e.stopPropagation()}
      onpointermove={(e) => e.stopPropagation()}
      onpointerup={(e) => e.stopPropagation()}
      onwheel={(e) => e.stopPropagation()}
      role="presentation"
    >
      <button
        class="mobile-toggle"
        onclick={() => {
          mobileSidebarOpen = !mobileSidebarOpen;
          if (mobileSidebarOpen) {
            closePopup();
          }
        }}
      >
        <div class="toggle-content">
          <i class="ph {mobileSidebarOpen ? 'ph-caret-left' : 'ph-caret-right'}"
          ></i>
          <span class="menu-text">menu</span>
        </div>
      </button>

      <div class="sidebar-inner">
        <!-- Search Input -->
        <div class="search-group">
          <input
            type="search"
            class="search-input"
            placeholder="Zoek op initiatiefnaam"
            bind:value={searchQuery}
            onkeydown={handleSearchKeyDown}
            onfocus={() => (searchFocused = true)}
            onblur={() => setTimeout(() => (searchFocused = false), 200)}
          />
          {#if searchFocused && searchSuggestions.length > 0}
            <ul class="search-suggestions">
              {#each searchSuggestions as suggestion, i}
                <li>
                  <button
                    class="search-suggestion"
                    class:highlighted={i === highlightedSearchIndex}
                    onclick={() => selectPlaceOnMap(suggestion)}
                    type="button"
                  >
                    {suggestion.name}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <!-- Accordions (Filters) -->
        <div class="accordion">
          <button
            class="accordion-header"
            onclick={() => toggleSection("domein")}
          >
            <span>Domein</span>
            <span class="icon">{openSections.domein ? "−" : "+"}</span>
          </button>
          {#if openSections.domein}
            <div class="accordion-content">
              <div class="visual-toggle-container">
                <span class="toggle-text">Toon kleuren per domein</span>
                <label class="switch">
                  <input
                    type="checkbox"
                    checked={visualMode === "domein"}
                    onchange={() => handleVisualToggle("domein")}
                  />
                  <span class="slider"></span>
                </label>
              </div>
              <hr class="separator" />
              {#each uniqueDomeinen as domein}
                <div class="filter-item-row">
                  <label class="filter-item" style="flex: 1; margin: 0;">
                    <input
                      type="checkbox"
                      checked={selectedDomeinen.includes(domein)}
                      onchange={() =>
                        (selectedDomeinen = toggleFilter(
                          selectedDomeinen,
                          domein,
                        ))}
                    />
                    <span class="filter-text">{domein}</span>
                    <i
                      class="ph {DOMEIN_ICONS[domein] ||
                        DOMEIN_ICONS.default} sidebar-icon"
                      style="color: {DOMEIN_COLORS[domein] ||
                        DOMEIN_COLORS.default}"
                    ></i>
                  </label>
                  <button
                    class="heatmap-toggle-btn"
                    class:active={activeHeatmapDomain === domein}
                    onclick={() => {
                      if (activeHeatmapDomain === domein) {
                        activeHeatmapDomain = null;
                      } else {
                        activeHeatmapDomain = domein;
                        activeChoroplethDomain = null;
                      }
                    }}
                    title="Toon heatmap voor dit domein"
                    type="button"
                  >
                    <i class="ph ph-fire"></i>
                  </button>
                  <button
                    class="choropleth-toggle-btn"
                    class:active={activeChoroplethDomain === domein}
                    onclick={() => {
                      if (activeChoroplethDomain === domein) {
                        activeChoroplethDomain = null;
                      } else {
                        activeChoroplethDomain = domein;
                        activeHeatmapDomain = null;
                      }
                    }}
                    title="Toon choropletenkaart voor dit domein"
                    type="button"
                  >
                    <i class="ph ph-map-trifold"></i>
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <div class="accordion">
          <button
            class="accordion-header"
            onclick={() => toggleSection("koepel")}
          >
            <span>Koepels</span>
            <span class="icon">{openSections.koepel ? "−" : "+"}</span>
          </button>
          {#if openSections.koepel}
            <div class="accordion-content">
              <div class="visual-toggle-container">
                <span class="toggle-text">Toon kleuren per koepel</span>
                <label class="switch">
                  <input
                    type="checkbox"
                    checked={visualMode === "koepel"}
                    onchange={() => handleVisualToggle("koepel")}
                  />
                  <span class="slider"></span>
                </label>
              </div>
              <hr class="separator" />
              {#each uniqueKoepels as koepel}
                <label class="filter-item">
                  <input
                    type="checkbox"
                    checked={selectedKoepels.includes(koepel)}
                    onchange={() =>
                      (selectedKoepels = toggleFilter(selectedKoepels, koepel))}
                  />
                  <span class="filter-text">{koepel}</span>
                  <span
                    class="color-swatch"
                    style="background-color: {KOEPEL_COLORS[koepel] ||
                      KOEPEL_COLORS.default}"
                  ></span>
                </label>
              {/each}
            </div>
          {/if}
        </div>

        <div class="accordion">
          <button
            class="accordion-header"
            onclick={() => toggleSection("location")}
          >
            <span>Locatietype</span>
            <span class="icon">{openSections.location ? "−" : "+"}</span>
          </button>
          {#if openSections.location}
            <div class="accordion-content">
              <div class="accordion-divider"></div>
              <label class="filter-item">
                <input
                  type="checkbox"
                  checked={locationFilterMode === "points"}
                  onchange={() => (locationFilterMode = "points")}
                />
                <span class="legend-text">Toon alleen plekken</span>
                <span
                  class="legend-marker legend-marker-point"
                  aria-hidden="true"
                ></span>
              </label>

              <label class="filter-item">
                <input
                  type="checkbox"
                  checked={locationFilterMode === "areas"}
                  onchange={() => (locationFilterMode = "areas")}
                />
                <span class="legend-text">Toon alleen netwerken en wijken</span>
                <span
                  class="legend-marker legend-marker-area"
                  aria-hidden="true"
                ></span>
              </label>

              <label class="filter-item">
                <input
                  type="checkbox"
                  checked={locationFilterMode === "all"}
                  onchange={() => (locationFilterMode = "all")}
                />
                <span class="legend-text">Toon alle initiatieven</span>
              </label>
            </div>
          {/if}
        </div>
        {#if isAnyFilterActive}
          <button class="reset-button" onclick={resetFilters}>
            <i class="ph ph-arrow-counter-clockwise"></i>
            <span>Reset filters</span>
          </button>
        {/if}

        <div class="stats">
          <strong>{filteredPlaces.length}</strong> initiatieven getoond
        </div>
      </div>
    </aside>

    <!-- Map Container -->
    <div
      class="map-container"
      class:selecting-location={isSelectingLocation}
      bind:this={mapContainer}
    >
      {#if !isMobile && showQrBlock}{/if}
    </div>

    {#if selectedPlace}
      {@const slices = getPieSlices(
        [
          ...new Set(
            (selectedPlace.domeinen || "").split(";").map((d) => d.trim()),
          ),
        ].filter(Boolean),
      )}
      <div
        class="fixed-air-popup"
        onclick={(e) => e.stopPropagation()}
        ontouchstart={(e) => e.stopPropagation()}
        ontouchmove={(e) => e.stopPropagation()}
        ontouchend={(e) => e.stopPropagation()}
        onwheel={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div class="popup-top-bar">
          <h3 class="popup-title">{selectedPlace.name}</h3>
          <button class="close-btn" onclick={closePopup} aria-label="Sluiten">
            <i class="ph ph-x"></i>
          </button>
        </div>

        <div class="air-popup">
          <div class="popup-info-row location-row">
            <span class="label">Locatie / Gebied</span>
            <div class="popup-tags">
              {#each formatGebiedLabel(selectedPlace.gebied)
                .split(";")
                .map((g) => g.trim())
                .filter(Boolean) as buurt}
                <span class="p-tag buurt-tag">
                  {buurt}
                </span>
              {/each}
            </div>
          </div>

          <div class="popup-info-row domains-row">
            <span class="label">Domeinen</span>
            <div class="domains-display">
              <div class="domains-pie-wrapper">
                <svg viewBox="0 0 100 100" class="popup-pie-svg">
                  {#if slices.length <= 1}
                    <circle
                      cx="50"
                      cy="50"
                      r="50"
                      fill={slices[0].fill}
                      class="pie-slice"
                      class:highlighted-slice={hoveredSliceDomain ===
                        slices[0].domain}
                      onmouseenter={() =>
                        (hoveredSliceDomain = slices[0].domain)}
                      onmouseleave={() => (hoveredSliceDomain = null)}
                    />
                  {:else}
                    {#each slices as slice}
                      <path
                        d={slice.d}
                        fill={slice.fill}
                        class="pie-slice"
                        class:highlighted-slice={hoveredSliceDomain ===
                          slice.domain}
                        onmouseenter={() => (hoveredSliceDomain = slice.domain)}
                        onmouseleave={() => (hoveredSliceDomain = null)}
                      />
                    {/each}
                  {/if}
                </svg>
              </div>
              <div class="domains-tags-list">
                {#each slices.length === 2 ? [...slices].reverse() : slices as slice}
                  {#if slice.domain !== "default"}
                    <span
                      class="p-tag domain-name-tag interactive-tag"
                      class:highlighted-tag={hoveredSliceDomain ===
                        slice.domain}
                      style="background-color: {slice.fill};"
                      onmouseenter={() => (hoveredSliceDomain = slice.domain)}
                      onmouseleave={() => (hoveredSliceDomain = null)}
                    >
                      {slice.domain}
                    </span>
                  {/if}
                {/each}
              </div>
            </div>
          </div>

          <div class="popup-info-row koepel-row">
            {#if selectedPlace.koepels}
              <span class="label">Koepel</span>
              <div class="popup-tags">
                {#each selectedPlace.koepels.split(";") as koepel}
                  {@const kName = koepel.trim()}
                  <a
                    href={KOEPEL_WEBSITES[kName] || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="p-tag"
                    style="background-color: {KOEPEL_COLORS[kName] ||
                      KOEPEL_COLORS.default}; text-decoration: none;"
                  >
                    {kName}
                  </a>
                {/each}
              </div>
            {/if}
          </div>

          <div class="popup-info-row website-row">
            {#if selectedPlace.website}
              <a href={selectedPlace.website} target="_blank" class="popup-link"
                >Bezoek website ↗</a
              >
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </main>

  <!-- Centered Caret Button below the map -->
  <div class="scroll-down-container">
    <button
      class="scroll-down-btn"
      class:pointing-up={isScrolledDown}
      onclick={isScrolledDown ? scrollToMap : scrollToInfo}
      aria-label={isScrolledDown
        ? "Scroll naar kaart"
        : "Scroll naar informatie"}
      type="button"
    >
      <i class="ph {isScrolledDown ? 'ph-caret-up' : 'ph-caret-down'}"></i>
    </button>
  </div>

  <!-- Bottom Info Section -->
  <section class="bottom-info-section" bind:this={infoSection}>
    <!-- Left Column: Waarom deze kaart & Over deze kaart -->
    <div class="info-column block-left">
      <h2>INFORMATIE</h2>

      <div class="intro-section">
        <strong>WAAROM DEZE KAART?</strong>
        <p>
          Overal in Rotterdam ontstaan er nieuwe initiatieven waarin mensen en
          gemeenschappen, vaak onder de radar, experimenteren met alternatieven
          voor de toekomst. Op het gebied van circulariteit, energie,
          mobiliteit, natuur, voedsel, werken en wonen ontstaan praktijken die
          niet wachten op beleid, maar handelen vanuit maatschappelijke noodzaak
          en verbeeldingskracht. Elk op hun eigen domein(en) maar verbonden door
          een gedeelde zoektocht.
        </p>
      </div>

      <div class="intro-section">
        <strong>OVER DEZE KAART</strong>
        <p>
          Op deze kaart vind je een verzameling van initiatieven in Rotterdam,
          verdeeld over verschillende categorieën en domeinen. De kaart is niet
          volledig, maar geeft een eerste indruk van de diversiteit aan
          initiatieven in de stad. Veel initiatieven laten zich niet eenvoudig
          in één domein plaatsen. Ze ontstaan vaak vanuit een behoefte of
          urgentie in een wijk of gemeenschap, en werken daardoor juist
          integraal en domeinoverstijgend. Toch hebben we gekozen voor een
          categorisering om de veelzijdigheid van initiatiefkracht beter
          leesbaar en navigeerbaar te maken. Zo hopen we dat initiatieven,
          organisaties en bewoners elkaar makkelijker kunnen vinden, versterken
          en ondersteunen.
        </p>
      </div>
    </div>

    <!-- Middle Column: Category List (Plekken, Wijken & Netwerken, Koepels, Domeinen) -->
    <div class="info-column block-middle">
      <h2>LEGENDA</h2>
      <p>
        Hieronder vind je een uitleg van de categorieën en domeinen die we
        gebruiken om de initiatieven te ordenen.
      </p>
      <div class="category-list">
        <div class="category-item">
          <span class="legend-marker legend-marker-point" aria-hidden="true"
          ></span>
          <div class="category-text">
            <strong>Plekken</strong>
            <p>Initiatieven met een vaste, fysieke locatie in de stad.</p>
          </div>
        </div>

        <div class="category-item">
          <span class="legend-marker legend-marker-area" aria-hidden="true"
          ></span>
          <div class="category-text">
            <strong>Wijken & Netwerken</strong>
            <p>
              Wijken: initiatieven die zich richten op een specifieke wijk of
              buurt. <br />
              Netwerken: initiatieven die verschillende partijen bij elkaar brengen,
              en actief zijn in een bepaald gebied.
            </p>
          </div>
        </div>

        <div class="category-item">
          <span class="legend-marker legend-marker-koepel" aria-hidden="true"
          ></span>
          <div class="category-text">
            <strong>Koepels</strong>
            <p>
              Overkoepelende organisaties die meerdere initiatieven onder zich
              hebben en verbinden.
            </p>
          </div>
        </div>

        <div class="category-item">
          <span
            class="domein-icon ph ph-house"
            style="color: {DOMEIN_COLORS['Wonen']}"
            aria-hidden="true"
          ></span>
          <div class="category-text">
            <strong>Domeinen</strong>
            <p>
              De initiatieven zijn onderverdeeld in domeinen. Sommige
              initiatieven vallen onder meerdere domeinen.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Left: Draag bij aan de kaart -->
    <div class="info-column block-contribute">
      <h2>DRAAG BIJ AAN DE KAART</h2>
      <p>
        Heb je opmerkingen over de vermelding van een initiatief? Stuur dan een
        email naar <a href="mailto:initiatiefkracht@gmail.com"
          >initiatiefkracht@gmail.com</a
        >. Of wil je je eigen initiatief op de kaart hebben? Meld jouw
        initiatief aan via het formulier hieronder!
      </p>
    </div>

    <!-- Bottom Right: De waardenbloem -->
    <div class="info-column block-waardebloem">
      <h2>DE WAARDENBLOEM</h2>
      <div class="waardebloem-content">
        <p>
          De waardenbloem illustreert hoe de verschillende domeinen met elkaar
          verbonden zijn. Klik op de waardenbloem om hem beter te bekijken.
        </p>
        <button
          class="waardebloem-icon-btn"
          onclick={() => (enlargedImage = "Waardebloem.png")}
          title="Klik om de Waardebloem te vergroten"
        >
          <img src="Waardebloem.png" alt="Waardebloem" />
        </button>
      </div>
    </div>

    <!-- Full Width: Add Initiative Form -->
    <div class="info-column block-add-initiative-full">
      <div
        class="add-initiative-form"
        style="margin-top: 0; padding-top: 0; border-top: none;"
      >
        <h3>Nieuw initiatief toevoegen</h3>

        {#if formStatusMessage}
          <div class="form-status-alert {formStatusType}">
            <p>{formStatusMessage}</p>
          </div>
        {/if}

        <div class="form-group">
          <label for="init-name">Naam initiatief *</label>
          <input
            id="init-name"
            type="text"
            bind:value={newInitiative.name}
            placeholder="Bijv. Buurttuin De Groene Oase"
          />
        </div>

        <div class="form-row">
          <div class="form-group col-half">
            <label>Locatie selecteren *</label>
            <button
              type="button"
              class="btn-select-location {isSelectingLocation ? 'active' : ''}"
              onclick={() => {
                isSelectingLocation = !isSelectingLocation;
                if (isSelectingLocation && mapContainer) {
                  mapContainer.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                }
              }}
            >
              <i
                class="ph {isSelectingLocation
                  ? 'ph-cursor-click'
                  : 'ph-map-pin'}"
              ></i>
              {isSelectingLocation
                ? "Klik nu op de kaart..."
                : "Kies locatie op kaart"}
            </button>
          </div>

          <div class="form-group col-half">
            <label
              >Gebied (Buurten) <span
                style="font-size: 0.72rem; font-weight: normal; color: #666;"
                >(vink één of meer aan)</span
              ></label
            >
            <div class="buurten-checkbox-list">
              {#each allPossibleBuurten as buurt}
                <label class="buurt-checkbox-label">
                  <input
                    type="checkbox"
                    value={buurt}
                    checked={newInitiative.gebiedList.includes(buurt)}
                    onchange={(e) => {
                      if (e.target.checked) {
                        newInitiative.gebiedList = [
                          ...newInitiative.gebiedList,
                          buurt,
                        ];
                      } else {
                        newInitiative.gebiedList =
                          newInitiative.gebiedList.filter((b) => b !== buurt);
                      }
                    }}
                  />
                  <span>{buurt}</span>
                </label>
              {/each}
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>Domeinen (kies één of meer)</label>
          <div class="domeinen-grid">
            {#each Object.keys(DOMEIN_COLORS).filter((d) => d !== "default") as domain}
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  value={domain}
                  checked={newInitiative.domeinen.includes(domain)}
                  onchange={(e) => {
                    if (e.target.checked) {
                      newInitiative.domeinen = [
                        ...newInitiative.domeinen,
                        domain,
                      ];
                    } else {
                      newInitiative.domeinen = newInitiative.domeinen.filter(
                        (d) => d !== domain,
                      );
                    }
                  }}
                />
                <span
                  class="domain-tag-indicator"
                  style="border-color: {DOMEIN_COLORS[
                    domain
                  ]}33; background-color: {newInitiative.domeinen.includes(
                    domain,
                  )
                    ? DOMEIN_COLORS[domain] + '33'
                    : '#f5f5f5'}; color: {newInitiative.domeinen.includes(
                    domain,
                  )
                    ? '#111111'
                    : '#666666'}; border: 1px solid {newInitiative.domeinen.includes(
                    domain,
                  )
                    ? DOMEIN_COLORS[domain]
                    : 'transparent'}"
                >
                  {domain}
                </span>
              </label>
            {/each}
          </div>
        </div>

        <div class="form-row">
          <div class="form-group col-half">
            <label for="init-website">Website URL</label>
            <input
              id="init-website"
              type="url"
              bind:value={newInitiative.website}
              placeholder="https://example.com"
            />
          </div>
          <div class="form-group col-half">
            <label for="init-koepels">Koepels (Netwerk)</label>
            <input
              id="init-koepels"
              type="text"
              bind:value={newInitiative.koepels}
              placeholder="Bijv. Groen010"
            />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group col-half">
            <label for="init-type">Initiatief Type</label>
            <select id="init-type" bind:value={newInitiative.initiatief_type}>
              <option value="plek">plek</option>
              <option value="netwerk">netwerk</option>
              <option value="wijk">wijk</option>
            </select>
          </div>
          <div class="form-group col-half">
            <label for="init-loc-type">Locatie Type</label>
            <select id="init-loc-type" bind:value={newInitiative.location_type}>
              <option value="point">point</option>
              <option value="area">area</option>
            </select>
          </div>
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn-save"
            style="flex: 1;"
            onclick={saveInitiative}
          >
            <i class="ph ph-plus-circle"></i> Toevoegen aan de kaart
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer with Logos and Credits -->
  <footer class="bottom-footer">
    <div class="footer-content">
      <p>
        Deze kaart is ontwikkeld door
        <a href="https://airrotterdam.eu"> AIR </a>, in samenwerking met
        <a href="https://groen010.nl"> Groen010 </a>.
      </p>

      <div class="logos-section">
        <img src="AIR.png" alt="AIR logo" class="org-logo" />
        <img src="VG010_logo.png" alt="Groen010 logo" class="org-logo" />
      </div>
    </div>
  </footer>

  <!-- Image zoom modal -->
  {#if enlargedImage}
    <div
      class="image-modal"
      onwheel={handleModalWheel}
      onmousedown={handleModalMouseDown}
      onmousemove={handleModalMouseMove}
      onmouseup={handleModalMouseUp}
      onmouseleave={handleModalMouseUp}
      ontouchstart={handleModalTouchStart}
      ontouchmove={handleModalTouchMove}
      ontouchend={handleModalMouseUp}
      role="presentation"
    >
      <button
        class="modal-close-btn"
        onclick={closeImageModal}
        aria-label="Sluiten"
      >
        <i class="ph ph-x"></i>
      </button>
      <div
        class="modal-content"
        style="transform: translate({modalPosition.x}px, {modalPosition.y}px) scale({modalScale}); cursor: {modalScale >
        1
          ? 'grab'
          : 'default'}"
      >
        <img src={enlargedImage} alt="Enlarged" class="enlarged-image" />
      </div>
    </div>
  {/if}
</div>

<style>
  @import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap");

  :global(#app) {
    margin: 0 !important;
    padding: 0 !important;
    max-width: none !important;
    width: 100%;
  }

  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    width: 100%;
    min-height: 100%;
    background: #fdfcf7;
    display: block !important;
    font-family: "Inter", sans-serif;
  }

  .layout {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-height: 100vh;
    background: #ffffff;
  }

  .top-header {
    background: #ffffff;
    height: 90px;
    display: flex;
    align-items: center;
    padding: 0;
    position: sticky;
    top: 0;
    z-index: 2000;
    /* box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); */
  }

  .top-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 900;
    color: #5d69fb;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    font-family: inherit;
    vertical-align: text-bottom;
    margin-top: 20px;
    text-align: left;
    margin-bottom: 3px;
  }

  .map-frame {
    position: relative;
    width: 98%;
    max-width: 1990px;
    height: 83vh;
    min-height: 600px;
    margin: 0 auto 10px auto;
    overflow: hidden;
    box-sizing: border-box;
  }

  .sidebar {
    position: absolute;
    top: 15px;
    left: 15px;
    width: 280px;
    height: auto;
    max-height: calc(100% - 30px);
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    z-index: 1000;
    overflow: hidden;
    font-family: inherit;
    box-sizing: border-box;
  }
  .sidebar-inner {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .sidebar-inner::-webkit-scrollbar {
    width: 6px;
  }
  .sidebar-inner::-webkit-scrollbar-track {
    background: transparent;
  }
  .sidebar-inner::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 3px;
  }
  .sidebar-inner::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.2);
  }

  .mobile-header {
    display: none;
  }

  @media (max-width: 900px) {
    .mobile-header {
      display: flex;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 60px;
      background: #ffffff;
      color: #5d69fb;
      font-family: inherit;
      font-weight: 900;
      font-size: 1.4rem;
      align-items: center;
      justify-content: center;
      z-index: 2500;
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
    }

    .fixed-air-popup {
      top: 15px !important;
      bottom: auto !important;
      right: unset !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      width: 75% !important;
      max-width: 400px !important;
      max-height: calc(100% - 30px) !important;
      border-radius: 12px !important;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15) !important;
      border: 1px solid rgba(0, 0, 0, 0.05) !important;
      overflow-y: auto !important;
      z-index: 2010 !important;
    }

    .sidebar.open {
      transform: translateY(0);
    }

    .scroll-down-btn {
      padding-top: 4px;
      margin-top: -4px;
    }

    .mobile-toggle {
      display: flex !important;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 50px;
      background: #ffffff;
      border: none;
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      font-family: inherit;
      color: #5d69fb;
      cursor: pointer;
      padding: 0;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .toggle-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      line-height: 1;
    }

    .toggle-content i {
      font-size: 1.2rem;
      margin-bottom: -2px;
    }

    .menu-text {
      font-size: 0.7rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1rem;
      padding-bottom: 12px;
      padding-top: 4px;
    }

    .brand,
    .sidebar-collapse {
      display: none !important;
    }
    .accordion-content {
      max-height: none;
      overflow: visible;
    }

    .sidebar {
      padding: 0 8px;
    }

    .popup-top-bar {
      min-height: 40px !important;
      padding: 6px 12px !important;
    }

    .popup-title {
      font-size: 0.9rem !important;
      line-height: 1.3 !important;
    }

    .air-popup {
      padding: 6px 12px !important;
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      grid-template-rows: auto auto !important;
      column-gap: 16px !important;
      row-gap: 8px !important;
      align-items: flex-start !important;
    }

    .location-row {
      grid-area: 1 / 1 / 2 / 2;
    }
    .domains-row {
      grid-area: 1 / 2 / 2 / 3;
    }
    .website-row {
      grid-area: 2 / 1 / 3 / 2;
    }
    .koepel-row {
      grid-area: 2 / 2 / 3 / 3;
    }

    .popup-info-row {
      margin-bottom: 4px !important;
      flex: none !important;
      width: 100% !important;
    }

    .popup-info-row .label {
      font-size: 0.6rem !important;
      margin-bottom: 4px !important;
      margin-top: 4px !important;
    }

    .popup-tags {
      margin-top: 0 !important;
      margin-bottom: 4px !important;
    }

    .popup-footer {
      width: 100%;
      margin-top: 4px !important;
      padding-top: 0 !important;
      border-top: none !important;
    }

    .popup-link {
      font-size: 10px !important;
      padding-bottom: 4px !important;
    }

    :global(.maplibregl-ctrl-bottom-right) {
      bottom: 12px !important;
      right: 12px !important;
    }

    .filter-item {
      gap: 12px;
      padding: 10px 12px;
      margin: 2px -12px;
      font-size: 0.85rem;
      border-radius: 8px;
    }
    input[type="checkbox"] {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .reset-button {
      width: calc(100% - 32px);
      margin: 12px 16px;
    }
  }

  .mobile-toggle {
    display: none;
  }

  .brand {
    padding: 24px 20px;
    font-weight: 900;
    font-size: 1.4rem;
    letter-spacing: -0.5px;
    color: #5d69fb;
    background-color: #ffffff;
    text-align: center;
  }
  .location-filter {
    padding: 16px 20px;
    border-bottom: 1px solid #e0ddd5;
    background: #ffffff;
  }
  .search-group {
    margin-bottom: 12px;
    position: relative;
    margin-left: 10px;
    margin-right: 10px;
    margin-top: 10px;
  }
  .search-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d8d2c8;
    border-radius: 8px;
    background: #fff;
    font-size: 0.95rem;
    color: #333;
    box-sizing: border-box;
  }
  .search-input:focus {
    outline: none;

    box-shadow: 0 0 0 3px rgba(93, 105, 251, 0.15);
  }
  .search-suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 1000;
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid #d8d2c8;
    border-top: none;
    border-radius: 0 0 8px 8px;
    background: #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  .search-suggestion {
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    font-size: 0.9rem;
    color: #333;
  }
  .search-suggestion:hover {
    background: #f5f5f5;
  }
  .search-suggestion.highlighted {
    background: #5d69fb;
    color: #fff;
  }
  .accordion {
    border-bottom: 1px solid #e0ddd5;
    background: #ffffff;
    transition: background-color 0.2s ease;
  }
  .accordion:has(.accordion-content) {
    background: #ffffff;
  }
  .accordion-header {
    width: 100%;
    padding: 16px 20px;
    background: none;
    border: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    font-family: inherit;
    font-weight: 800;
    text-transform: uppercase;
    font-size: 0.8rem;
    letter-spacing: 0.05rem;
    color: #5d69fb;
    text-align: left;
    outline: none;
  }
  .accordion-header:hover {
    background: rgba(132, 80, 255, 0.05);
  }
  .accordion-header .icon {
    font-size: 1.1rem;
    font-weight: normal;
    color: #999;
  }
  .accordion-content {
    padding: 0 20px 20px 20px;
    text-align: left;
  }
  .accordion-content p {
    font-size: 0.8rem;
    color: #666;
    line-height: 1.4;
    margin: 0;
  }

  .accordion-divider {
    height: 1px;
    background: rgba(0, 0, 0, 0.05);
    margin: 12px 0;
    border: none;
  }

  .filter-item-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 4px;
  }
  .heatmap-toggle-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    transition: all 0.2s ease;
    color: #9ca3af;
    flex-shrink: 0;
  }
  .heatmap-toggle-btn:hover {
    background-color: rgba(93, 105, 251, 0.08);
    color: #4b5563;
  }
  .heatmap-toggle-btn.active {
    background-color: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .choropleth-toggle-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    transition: all 0.2s ease;
    color: #9ca3af;
    flex-shrink: 0;
  }
  .choropleth-toggle-btn:hover {
    background-color: rgba(93, 105, 251, 0.08);
    color: #4b5563;
  }
  .choropleth-toggle-btn.active {
    background-color: rgba(93, 105, 251, 0.1);
    color: #5d69fb;
  }

  .filter-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    margin: 4px -8px;
    font-size: 0.8rem;
    color: #333;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    /* border-radius: 6px; */
    transition: all 0.2s ease;
    user-select: none;
  }
  .filter-item:hover {
    background: rgba(93, 105, 251, 0.08);
  }
  .filter-item:active {
    background: rgba(93, 105, 251, 0.15);
    transform: scale(0.98);
  }
  .filter-text {
    flex-grow: 1;
    text-align: left;
  }
  .stats {
    margin-top: auto;
    padding: 16px 20px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.02rem;
    color: #999;
    font-weight: bold;
    background: #ffffff;
    border-top: 1px solid rgba(0, 0, 0, 0.05);
    margin-bottom: 0;
  }
  .qr-block {
    padding: 16px 20px;
    background: transparent;
    border-top: 1px solid rgba(0, 0, 0, 0.05);
    text-align: left;
  }
  .qr-info {
    padding: 16px 20px;
    background: transparent;
    border-top: 1px solid rgba(0, 0, 0, 0.05);
    font-size: 0.95rem;
    line-height: 1.6;
    letter-spacing: 0.3px;
    color: #5d69fb;
  }
  .qr-info p {
    margin: 0;
    text-align: left;
  }
  .floating-qr-block {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    padding: 24px;
    width: fit-content;
    max-width: 70%;
    z-index: 999;
  }
  .qr-close-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #999;
    font-size: 20px;
    transition: color 0.2s ease;
  }
  .qr-close-btn:hover {
    color: #5d69fb;
  }
  .qr-content {
    display: grid;
    grid-template-columns: auto auto auto;
    align-items: center;
    gap: 24px;
  }

  .qr-info-text {
    font-size: 0.95rem;
    line-height: 1.6;
    letter-spacing: 0.3px;
    color: #666;
    margin: 0;
    text-align: left;
    max-width: 320px;
  }

  .qr-code-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .qr-code-wrap img {
    max-width: 120px;
    width: 120px;
    display: block;
  }

  .qr-scan-text {
    font-size: 0.85rem;
    margin: 0;
    color: #000;
    font-weight: 500;
    line-height: 1.6;
    text-align: left;
    width: 110px;
    flex-shrink: 0;
  }

  /* legacy selectors kept for compatibility with other layout variants */

  .stats strong {
    color: #5d69fb;
    font-size: 0.85rem;
  }
  input[type="checkbox"] {
    accent-color: #5d69fb;
    cursor: pointer;
  }
  .visual-toggle-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
  }
  .toggle-text {
    font-size: 0.75rem;
    font-weight: bold;
    color: #666;
  }
  .switch {
    position: relative;
    display: inline-block;
    width: 34px;
    height: 20px;
  }
  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #e0ddd5;
    transition: 0.4s;
    border-radius: 20px;
  }
  .slider:before {
    position: absolute;
    content: "";
    height: 14px;
    width: 14px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.4s;
    border-radius: 50%;
  }
  input:checked + .slider {
    background-color: #5d69fb;
  }
  input:checked + .slider:before {
    transform: translateX(14px);
  }
  .separator {
    border: 0;
    border-top: 1px solid rgba(0, 0, 0, 0.05);
    margin: 12px 0;
  }
  .color-swatch {
    width: 12px;
    height: 12px;
    display: inline-block;
    border-radius: 3px;
    border: 1px solid rgba(0, 0, 0, 0.1);
  }
  .map-container {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
    box-sizing: border-box;
  }

  .map-container.selecting-location :global(.maplibregl-canvas) {
    cursor: crosshair !important;
  }

  .fixed-air-popup {
    position: absolute;
    top: 15px;
    right: 15px;
    bottom: auto;
    width: 300px;
    max-height: calc(100% - 30px);
    background: #ffffff;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 16px;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.15),
      5px 5px 0px rgba(132, 80, 255, 0.1);
    z-index: 2000;
    font-family: inherit;
    text-align: left;
    overflow-y: auto;
    border: 1px solid rgba(255, 255, 255, 0.25);
    box-sizing: border-box;
  }
  .popup-top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background-color: #5d69fb;
    gap: 12px;
    min-height: 68px;
    box-sizing: border-box;
  }
  .popup-title {
    margin: 0;
    font-size: 1.1rem;
    color: #ffffff;
    font-weight: 800;
    line-height: 1.2;
    flex-grow: 1;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .close-btn {
    background: #ffffff;
    border: none;
    font-size: 16px;
    font-family: inherit;
    cursor: pointer;
    color: #5d69fb;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
    padding: 0;
    flex-shrink: 0;
    line-height: 0;
  }
  .close-btn:hover {
    background-color: #ffffff;
    color: #1a1a1a;
  }
  .air-popup {
    padding: 16px;
  }
  .popup-info-row {
    margin-bottom: 14px;
  }
  .popup-info-row .label {
    font-weight: bold;
    color: #999;
    text-transform: uppercase;
    font-size: 0.65rem;
    letter-spacing: 0.02rem;
    display: block;
    margin-bottom: 4px;
  }
  .popup-value {
    font-size: 0.85rem;
    color: #333;
    font-weight: 500;
  }
  .popup-footer {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #eee;
  }

  @keyframes popup-slide-in {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .p-tag {
    font-size: 10px;
    padding: 3px 6px;
    margin-right: 4px;
    margin-bottom: 4px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    text-transform: uppercase;
    font-weight: bold;
    color: #ffffff;
    display: inline-block;
    border-radius: 5px;
  }
  .domain-name-tag {
    text-align: center;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: fit-content;
    height: fit-content;
  }
  a.p-tag {
    cursor: pointer;
    transition: opacity 0.2s;
  }
  a.p-tag:hover {
    opacity: 0.8;
  }
  .buurt-tag {
    background-color: #999;
    color: #fff !important;
    font-size: 10px;
    padding: 2px 4px;
  }
  .popup-tags {
    display: flex;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  .popup-link {
    display: inline-block;
    font-size: 11px;
    color: #333;
    text-decoration: none;
    border-bottom: 1px solid #5d69fb;
    padding-bottom: 2px;
    transition: all 0.2s;
  }
  .popup-link:hover {
    color: #5d69fb;
    background: #ffffff;
  }

  :global(.marker-container) {
    z-index: 100;
  }
  :global(.marker-container:hover) {
    z-index: 1000;
  }

  :global(.air-marker) {
    width: var(--marker-size, 29px);
    min-width: var(--marker-size, 29px);
    height: var(--marker-size, 29px);
    border: none;
    border-radius: 0;
    cursor: pointer;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    overflow: visible;
    box-sizing: border-box;
    transform-origin: 50% 92%;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.25));
    transition:
      transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275),
      filter 0.25s ease;
  }

  :global(.air-marker .outer-droplet) {
    stroke: var(--outer-droplet-color, #ffffff);
    stroke-width: 7;
    stroke-linejoin: round;
  }

  :global(.air-marker .inner-circle) {
    /* stroke: var(--marker-border-color, #5d69fb);
    stroke-width: calc(
      var(--marker-border-width, 3px) * 100 / var(--marker-size, 20)
    ); */
    transition:
      stroke 0.25s ease,
      stroke-width 0.25s ease;
  }

  :global(.air-marker.thin-border .inner-circle) {
    stroke: #ffffff !important;
    stroke-width: calc(1px * 100 / var(--marker-size, 29)) !important;
  }

  :global(.air-marker i) {
    font-size: calc(var(--marker-size, 29px) * 0.55);
    line-height: 1;
  }

  :global(.marker-container:hover .air-marker) {
    transform: scale(1.3);
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3));
  }

  :global(.air-marker.active-glow) {
    transform: scale(1.3);
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
  }

  :global(.air-marker.active-glow .inner-circle) {
    /* stroke: #6458f5 !important; */
    stroke-width: calc(2px * 100 / var(--marker-size, 29)) !important;
  }

  :global(.air-area-marker) {
    width: var(--marker-size, 25px);
    min-width: var(--marker-size, 25px);
    height: var(--marker-size, 25px);
    border-radius: 0;
    transform-origin: 50% 50% !important;
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.4))
      drop-shadow(0 0 8px rgba(100, 88, 245, 0.1))
      drop-shadow(0 2px 3px rgba(0, 0, 0, 0.2));
  }

  :global(.air-area-marker i) {
    font-size: calc(var(--marker-size, 25px) * 0.5);
  }
  .logos-section {
    display: flex;
    justify-content: center;
    gap: 20px;
    margin-top: 16px;
  }

  .org-logo {
    height: 80px;
    object-fit: contain;
  }

  @keyframes area-fade-in {
    from {
      fill-opacity: 0;
    }
    to {
      fill-opacity: 0.5;
    }
  }

  :global(.area-marker-inner) {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: 100%;
    height: 100%;
  }

  :global(.sidebar-icon) {
    font-size: 20px;
    width: 22px;
    text-align: center;
  }

  .location-filter .filter-item {
    justify-content: space-between;
  }

  .legend-text {
    flex: 1;
    text-align: left;
  }

  .legend-marker {
    display: inline-block;
    width: 18px;
    height: 18px;
    vertical-align: middle;
    border-radius: 50%;
    margin-left: 0;
    box-sizing: border-box;
    background: #fff;
    border: 2px solid #737ac6;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
    flex: 0 0 auto;
  }

  .legend-marker-area {
    background: #5d69fb;
    box-shadow:
      0 0 0 3px #5d69fb90,
      0 0 15px 8px rgba(132, 80, 255, 0.1),
      0 2px 6px rgba(0, 0, 0, 0.2);
    border: none;
    opacity: 0.6;
    max-width: 18px;
    max-height: 18px;
  }

  .legend-marker-koepel {
    background: #fbbf72;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.1);
  }

  .waardebloem-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    margin-top: 8px;
    padding-top: 12px;
    border-top: none;
    text-align: center;
  }

  .waardebloem-icon-btn {
    width: 200px;
    height: 200px;
    flex-shrink: 0;
    padding: 8px;
    background: white;
    cursor: pointer;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .waardebloem-icon-btn:hover {
    transform: scale(1.03) translateY(-2px);
  }

  .waardebloem-icon-btn img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .block-waardebloem .waardebloem-content {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 24px;
    justify-content: space-between;
  }

  .block-waardebloem .waardebloem-content p {
    margin: 0;
    flex: 1;
    font-size: 0.95rem;
    color: #444444;
  }

  .block-waardebloem .waardebloem-icon-btn {
    width: 160px;
    height: 160px;
    margin-top: -8px;
  }

  .reset-button {
    width: calc(100% - 40px);
    margin: 12px 20px;
    padding: 10px;
    background: white;
    border: 1px solid #d8d2c8;
    border-radius: 8px;
    color: #666;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    transition: all 0.2s;
    position: sticky;
    bottom: 0;
    z-index: 90;
    box-shadow: 0 -10px 20px #ffffff;
  }
  .reset-button:hover {
    background: #f0edeb;
    color: #5d69fb;
    border-color: #5d69fb;
  }
  .reset-button i {
    font-size: 1rem;
  }
  .image-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3000;
    overflow: hidden;
    user-select: none;
  }
  .modal-content {
    transition: transform 0.05s ease-out;
    will-change: transform;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .enlarged-image {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    pointer-events: none;
  }
  .modal-close-btn {
    position: absolute;
    top: 24px;
    right: 24px;
    background: white;
    border: 1px solid #5d69fb;
    color: #5d69fb;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 3001;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  .modal-close-btn:hover {
    background: #5d69fb;
    color: white;
    transform: rotate(90deg) scale(1.1);
  }
  .modal-close-btn i {
    font-size: 1.5rem;
  }

  .initiatives-intro {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 12px;
  }

  .initiatives-intro .lead {
    font-size: 0.85rem;
    color: #333;
    line-height: 1.4;
    margin: 0;
  }

  .intro-section {
    margin-bottom: 8px;
    text-align: left;
  }

  .intro-section strong {
    display: block;
    font-size: 0.85rem;
    color: #333;
    margin-bottom: 4px;
  }

  .category-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 8px 0;
  }

  .category-item {
    padding: 12px;
    display: flex;
    gap: 14px;
    align-items: center;
  }

  .category-text {
    flex: 1;
  }

  .category-text strong {
    display: block;
    font-size: 0.95rem;
    color: #5d69fb;
    margin-bottom: 2px;
    text-transform: uppercase;
    font-weight: 800;
    letter-spacing: 0.05rem;
  }

  .category-item p {
    margin: 0 !important;
    font-size: 0.8rem !important;
  }

  .initiatives-intro .cta {
    font-size: 0.8rem;
    color: #666;
    border-top: 1px solid rgba(0, 0, 0, 0.05);
    padding-top: 12px;
    margin-top: 4px;
    line-height: 1.4;
  }

  .initiatives-intro .cta strong {
    color: #5d69fb;
  }

  .bottom-info-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    width: 98%;
    margin: 10px auto 50px auto;
    padding-top: 30px;
    box-sizing: border-box;
    max-width: 1200px;
  }

  .info-column {
    display: flex;
    flex-direction: column;
    gap: 24px;
    background: #ffffff;
    padding: 30px;
    font-family: "Inter", sans-serif;
    color: #444444;
    line-height: 1.6;
    box-sizing: border-box;
    text-align: left;
  }

  .info-column h2 {
    margin: 0 0 6px 0;
    font-size: 1.8rem;
    color: #333333;
    font-weight: 800;
    padding-bottom: 0px;
    width: fit-content;
  }

  .intro-section p {
    font-size: 0.95rem;
    color: #444444;
  }

  .partners-logos {
    padding-top: 15px;
  }

  .block-contribute p {
    margin: 0;
    font-size: 0.95rem;
    color: #555555;
    text-align: left;
  }

  .block-contribute a {
    color: #5d69fb;
    text-decoration: underline;
    font-weight: 600;
  }

  .block-add-initiative-full {
    grid-column: span 2;
    margin-top: 20px;
    padding-top: 25px;
    border-top: 1px solid #e5e5e5;
  }

  .add-initiative-form {
    margin-top: 30px;
    padding-top: 30px;
    border-top: 1px solid #e5e5e5;
    font-family: "Inter", sans-serif;
  }

  .add-initiative-form h3 {
    margin: 0 0 20px 0;
    font-size: 1.3rem;
    color: #333333;
    font-weight: 700;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
  }

  .form-row {
    display: flex;
    gap: 16px;
    margin-bottom: 0;
  }

  .col-half {
    flex: 1;
  }

  .form-group label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #555555;
  }

  .form-group input,
  .form-group select {
    padding: 10px 12px;
    border: 1px solid #cccccc;
    border-radius: 6px;
    font-size: 0.9rem;
    background-color: #ffffff;
    color: #333333;
    font-family: inherit;
    box-sizing: border-box;
    width: 100%;
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
  }

  .form-group input[readonly] {
    background-color: #f5f5f5;
    color: #777777;
    cursor: not-allowed;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: #5d69fb;
    box-shadow: 0 0 0 3px rgba(93, 105, 251, 0.15);
  }

  .btn-select-location {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1.5px dashed #5d69fb;
    background-color: rgba(93, 105, 251, 0.04);
    color: #5d69fb;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    box-sizing: border-box;
    width: 100%;
    transition:
      background-color 0.2s,
      border-style 0.2s,
      transform 0.1s;
  }

  .btn-select-location:hover {
    background-color: rgba(93, 105, 251, 0.08);
  }

  .btn-select-location.active {
    border-style: solid;
    background-color: #5d69fb;
    color: #ffffff;
    animation: pulse-border 1.5s infinite alternate;
  }

  @keyframes pulse-border {
    from {
      box-shadow: 0 0 0 0px rgba(93, 105, 251, 0.4);
    }
    to {
      box-shadow: 0 0 0 8px rgba(93, 105, 251, 0);
    }
  }

  .domeinen-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 8px;
    margin-top: 4px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    position: relative;
    cursor: pointer;
    user-select: none;
  }

  .checkbox-label input {
    position: absolute;
    opacity: 0;
    cursor: pointer;
    height: 0;
    width: 0;
  }

  .domain-tag-indicator {
    display: block;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 20px;
    font-size: 0.78rem;
    font-weight: 600;
    text-align: center;
    width: 100%;
    box-sizing: border-box;
    color: #444444;
    transition: all 0.2s;
  }

  .form-actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
  }

  .btn-save,
  .btn-download {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 18px;
    border-radius: 6px;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    border: none;
    transition:
      background-color 0.2s,
      transform 0.1s;
  }

  .btn-save {
    flex: 2;
    background-color: #48b87c;
    color: #ffffff;
  }

  .btn-save:hover {
    background-color: #3ca36b;
  }

  .btn-save:active,
  .btn-download:active {
    transform: scale(0.98);
  }

  .btn-download {
    flex: 1;
    background-color: #f0f0f0;
    color: #333333;
    border: 1px solid #cccccc;
  }

  .btn-download:hover {
    background-color: #e5e5e5;
  }

  .form-status-alert {
    padding: 12px 16px;
    border-radius: 6px;
    margin-bottom: 20px;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .form-status-alert.error {
    background-color: #fde8e8;
    color: #9b1c1c;
    border-left: 4px solid #f05252;
  }

  .form-status-alert.success {
    background-color: #edfbf7;
    color: #03543f;
    border-left: 4px solid #0e9f6e;
  }

  .form-status-alert p {
    margin: 0 !important;
  }

  :global(.temp-marker) {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .buurten-checkbox-list {
    max-height: 120px;
    overflow-y: auto;
    border: 1px solid #cccccc;
    border-radius: 6px;
    padding: 8px 12px;
    background-color: #ffffff;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .buurt-checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.88rem;
    color: #444444;
    cursor: pointer;
    user-select: none;
  }

  .buurt-checkbox-label input[type="checkbox"] {
    width: auto !important;
    margin: 0;
    cursor: pointer;
  }

  /* Responsive styling to gracefully stack layout on tablets and mobile screens */
  @media (max-width: 900px) {
    .info-scroll-trigger {
      display: none !important;
    }

    .top-title {
      font-size: 1.15rem !important;
      margin-left: 36px !important;
    }

    .map-frame {
      flex-direction: column;
      height: calc(100dvh - 90px - 60px) !important;
      min-height: auto !important;
      width: 95% !important;
      /* margin: 0 !important;
      gap: 0 !important;
      border-radius: 0 !important; */
    }

    .sidebar {
      position: absolute !important;
      top: 100px !important;
      bottom: 12px !important;
      left: 0 !important;
      right: auto !important;
      width: 35px !important;
      height: calc(100% - 200px) !important;
      max-height: none !important;
      background: #ffffff !important;
      border-radius: 0 12px 12px 0 !important;
      border: 1px solid rgba(0, 0, 0, 0.1) !important;
      border-left: none !important;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15) !important;
      z-index: 1000 !important;
      transform: none !important;
      transition: width 0.33s cubic-bezier(0.4, 0, 0.2, 1) !important;
      overflow: hidden !important;
      padding: 0 !important;
      margin: 0 !important;
      display: flex !important;
      flex-direction: row-reverse !important;
    }

    .sidebar.open {
      width: 90% !important;
      height: calc(100% - 200px) !important;
      transform: none !important;
    }

    .mobile-toggle {
      display: flex !important;
      align-items: center;
      justify-content: center;
      width: 50px !important;
      height: 100% !important;
      background: #ffffff !important;
      border: none !important;
      border-left: 1px solid rgba(0, 0, 0, 0.05) !important;
      font-family: inherit !important;
      color: #5d69fb !important;
      cursor: pointer !important;
      padding: 0 !important;
      position: relative !important;
      top: auto !important;
      z-index: 100 !important;
      flex-shrink: 0 !important;
    }

    .toggle-content {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 12px !important;
      line-height: 1 !important;
    }

    .toggle-content i {
      font-size: 1.4rem !important;
      margin-bottom: 0 !important;
    }

    .menu-text {
      writing-mode: vertical-rl !important;
      text-orientation: mixed !important;
      font-size: 0.75rem !important;
      font-weight: 800 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.15rem !important;
      padding: 0 !important;
      margin-top: 4px !important;
    }

    .sidebar-inner {
      flex: 1 !important;
      overflow-y: auto !important;
      padding: 20px !important;
      height: 100% !important;
      box-sizing: border-box !important;
    }

    .map-container {
      position: absolute !important;
      width: 100% !important;
      height: 100% !important;
      top: 0 !important;
      left: 0 !important;
    }

    .scroll-down-container {
      width: 100% !important;
      height: 60px !important;
      background: #ffffff !important;
      /* border-top: 1px solid rgba(0, 0, 0, 0.08) !important; */
      display: flex !important;
      align-items: center;
      justify-content: center;
      margin: 0 !important;
      padding: 0 !important;
      /* box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.02) !important; */
      z-index: 100 !important;
      position: relative !important;
    }

    .bottom-info-section {
      grid-template-columns: 1fr;
      width: 95%;
      gap: 24px;
      margin: 20px auto 40px auto;
    }

    .block-add-initiative-full {
      grid-column: span 1 !important;
      border-top: 1px solid #e5e5e5;
      padding-top: 20px;
    }

    .block-waardebloem .waardebloem-content {
      flex-direction: column;
      align-items: center;
      text-align: left;
      gap: 16px;
    }

    .block-waardebloem .waardebloem-icon-btn {
      width: 180px;
      height: 180px;
    }

    .header-content {
      width: 95%;
    }

    .top-header {
      box-shadow: none;
    }
  }

  /* Custom styling for scrolling triggers and buttons */
  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 98%;
    max-width: 1990px;
    margin: 0 auto;
    gap: 16px;
  }

  .info-scroll-trigger {
    display: flex;
    align-items: right;
    gap: 8px;
    background: transparent;
    border: none;
    outline: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 1rem;
    font-weight: 600;
    color: #5d69fb;
    padding: 8px 16px;
    transition: all 0.2s ease;
    white-space: nowrap;
    flex-shrink: 0;
    margin-top: 50px;
    margin-bottom: 3px;
  }

  .info-scroll-trigger:hover {
    color: #000000;
  }

  .info-scroll-trigger:focus,
  .info-scroll-trigger:active,
  .info-scroll-trigger:focus-visible {
    outline: none;
    border: none;
    box-shadow: none;
  }

  .info-scroll-trigger i {
    font-size: 1.1rem;
    transition: transform 0.2s ease;
  }

  .info-scroll-trigger:hover i.ph-caret-down {
    transform: translateY(2px);
  }

  .info-scroll-trigger:hover i.ph-caret-up {
    transform: translateY(-2px);
  }

  .scroll-down-container {
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    z-index: 10;
    margin-bottom: 10px;
    margin-top: 0px;
  }

  .scroll-down-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: #ffffff;
    outline: none;
    color: #5d69fb;
    font-size: 1.8rem;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    animation: bounce 2.5s infinite;
  }

  .scroll-down-btn:hover {
    color: #000000;
    transform: translateY(3px);
    animation-play-state: paused;
    outline: none;
    border: none;
    box-shadow: none;
  }

  .scroll-down-btn.pointing-up:hover {
    transform: translateY(-3px);
  }

  .scroll-down-btn:focus,
  .scroll-down-btn:active,
  .scroll-down-btn:focus-visible {
    outline: none;
    border: none;
    box-shadow: none;
  }

  @keyframes bounce {
    0%,
    20%,
    50%,
    80%,
    100% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-6px);
    }
    60% {
      transform: translateY(-3px);
    }
  }

  @media (max-width: 600px) {
    .info-scroll-trigger span {
      display: none;
    }
    .info-scroll-trigger {
      padding: 8px;
      border-radius: 50%;
      background: rgba(93, 105, 251, 0.05);
    }
  }

  /* Footer Styling */
  .bottom-footer {
    width: 100%;
    background: #ffffff;
    padding: 40px 0;
    border-top: 1px solid #b1b1b1;
    width: 60%;
    margin: 0 auto;
    box-sizing: border-box;
  }

  .footer-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    width: 98%;
    max-width: 1200px;
    margin: 0 auto;
    text-align: center;
  }

  .footer-content p {
    font-size: 0.95rem;
    color: #444444;
    margin: 0;
    font-family: "Inter", sans-serif;
  }

  .footer-logos {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 30px;
  }

  .footer-logos img {
    height: 48px;
    width: auto;
    object-fit: contain;
  }

  .domains-display {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 6px;
  }

  .domains-pie-wrapper {
    width: 44px;
    height: 44px;
    border: 2.5px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    overflow: hidden;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .popup-pie-svg {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 50%;
  }

  .pie-slice {
    transition: filter 0.15s ease;
    cursor: pointer;
  }

  .pie-slice:hover,
  .pie-slice.highlighted-slice {
    filter: brightness(1.15) saturate(1.15);
  }

  .domains-tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .interactive-tag {
    cursor: pointer;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease,
      filter 0.2s ease;
  }

  .interactive-tag:hover,
  .interactive-tag.highlighted-tag {
    transform: scale(1.08);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    filter: brightness(1.05);
  }
</style>
