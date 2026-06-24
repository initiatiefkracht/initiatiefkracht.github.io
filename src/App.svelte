<script>
  import { onMount } from "svelte";
  import maplibregl from "maplibre-gl";
  import Papa from "papaparse";
  import "maplibre-gl/dist/maplibre-gl.css";

  let mapContainer = $state();
  let map = $state();
  let mapLoaded = $state(false);
  let allPlaces = $state([]);
  let markers = [];
  let markerMap = new Map();
  let visualMode = $state("domein");
  let allGeoFeatures = $state([]);

  let selectedPlace = $state(null);
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
      style: "map-style-minimalist.json",
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
          "fill-opacity": 0,
        },
      });

      mapLoaded = true;
    });
  }

  function handleVisualToggle(mode) {
    visualMode = visualMode === mode ? "default" : mode;
  }

  const POINT_ZOOM = 15.5;
  const AREA_ZOOM = 13;
  const LARGE_AREA_ZOOM = 11;

  const DOMEIN_COLORS = {
    Wonen: "#ba2585",
    Welzijn: "#804895",
    Cultuur: "#3c529e",
    Klimaat: "#86ccdf",
    Voedsel: "#78bc84",
    Groen: "#89c05c",
    Circulair: "#efb000",
    Mobiliteit: "#d16c11",
    Energie: "#af232d",
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

  /**
   * @param {string} [domeinen]
   * @param {number} [size]
   * @param {string} [borderColor]
   */
  const createHexagonSVG = (domeinen, size = 48, borderColor = "#000000") => {
    const domeinList = [
      ...new Set((domeinen || "").split(";").map((d) => d.trim())),
    ].filter(Boolean);
    const N = domeinList.length;
    const colors = [];
    const names = [];

    if (N === 0) {
      for (let i = 0; i < 6; i++) {
        colors.push(DOMEIN_COLORS.default);
        names.push("default");
      }
    } else {
      const perDomain = Math.floor(6 / N);
      const remainder = 6 % N;
      domeinList.forEach((d, i) => {
        let count = perDomain;
        if (i === 0) count += remainder;
        const color = DOMEIN_COLORS[d] || DOMEIN_COLORS.default;
        for (let j = 0; j < count; j++) {
          colors.push(color);
          names.push(d);
        }
      });
    }

    const cx = size / 2;
    const cy = size / 2;
    const R = size / 2 - 2;

    const hexPoints = (radius) => {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const angle_rad = (Math.PI / 180) * (60 * i - 90);
        pts.push({
          x: cx + radius * Math.cos(angle_rad),
          y: cy + radius * Math.sin(angle_rad),
        });
      }
      return pts;
    };

    const points = hexPoints(R);

    let trianglesHtml = "";
    for (let i = 0; i < 6; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % 6];
      trianglesHtml += `<path class="hex-triangle" data-domain="${names[i]}" d="M ${cx} ${cy} L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} Z" fill="${colors[i]}" stroke="${borderColor}" stroke-width="1.5" stroke-linejoin="round"><title>${names[i]}</title></path>`;
    }

    const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(" ");
    const borderHtml = `<polygon points="${polygonPoints}" fill="none" stroke="${borderColor}" stroke-width="0" />`;

    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block;overflow:visible;">
      ${trianglesHtml}
      ${borderHtml}
    </svg>`;
  };

  const createMarkerSVG = (
    domeinen,
    borderColor,
    isArea,
    isSelected = false,
  ) => {
    if (isArea) {
      const size = 30;
      const R = 6;
      const cx = size / 2;
      const cy = size / 2;

      // Transparent backing circle to capture mouse hover events and prevent flickering
      const hoverTargetHtml = `<circle cx="${cx}" cy="${cy}" r="30" fill="rgba(0,0,0,0)" pointer-events="all" />`;

      const bgCircleHtml = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#5d69fb60" ${isSelected ? 'stroke="#ffffff" stroke-width="1"' : ""} />`;

      const rings = [
        { r: 8, maxOp: 0.8, sw: 3.5 },
        { r: 11, maxOp: 0.8, sw: 2.5 },
        { r: 14, maxOp: 0.8, sw: 1.5 },
        { r: 17, maxOp: 0.8, sw: 1 },
        { r: 20, maxOp: 0.8, sw: 0.5 },
        { r: 23, maxOp: 0.8, sw: 0.25 },
      ];
      let ringsHtml = "";
      rings.forEach(({ r, maxOp, sw }, ri) => {
        ringsHtml += `<circle class="hex-ring hex-ring-${ri + 1}" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff" stroke-width="${sw}" style="--ring-op:${maxOp};" />`;
      });

      return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block;opacity:1.0;overflow:visible;">
        ${hoverTargetHtml}
        ${ringsHtml}
        ${bgCircleHtml}
      </svg>`;
    } else {
      // Point locations are simple bright purple dots
      const size = 16;
      const cx = size / 2;
      const cy = size / 2;

      const dotRadius = isSelected ? 7 : 6.5;
      const strokeHtml = isSelected
        ? `<circle cx="${cx}" cy="${cy}" r="6.5" fill="none" stroke="#ffffff" stroke-width="2.5" />`
        : "";

      return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block;overflow:visible;">
        <circle cx="${cx}" cy="${cy}" r="${dotRadius}" fill="#5d69fb" stroke="#ffffff" stroke-width="1"/>
        ${strokeHtml}
      </svg>`;
    }
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

  let selectedGebieden = $state([]);
  let selectedDomeinen = $state([]);
  let selectedKoepels = $state([]);
  let clickedAreaGebieden = $state([]);
  let activeHoveredDomein = $state(null);

  $effect(() => {
    selectedPlace;
    activeHoveredDomein = null;
  });

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
    visualMode = "domein";
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
        activatePlaceOnMap(searchSuggestions[highlightedSearchIndex]);
        searchQuery = "";
      }
    }
  }

  function activatePlaceOnMap(place) {
    if (activeMarkerElement) {
      activeMarkerElement.classList.remove("active-glow");
    }
    if (activeMarkerContainer) {
      activeMarkerContainer.style.zIndex = "";
    }

    selectedPlace = place;
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

    const sidebarWidth = 350;
    const desktopPopupWidth = 320;

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
      padding,
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
    activeMarkerElement = null;
    activeMarkerContainer = null;
    clickedAreaGebieden = [];
  }

  let currentHighlightLayers = [];

  $effect(() => {
    if (!mapLoaded || !map) return;

    // Clean up older highlight layers/sources
    currentHighlightLayers.forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getLayer(`${id}-outline`)) map.removeLayer(`${id}-outline`);
      if (map.getLayer(`${id}-fill`)) map.removeLayer(`${id}-fill`);
      if (map.getSource(id)) map.removeSource(id);
    });
    currentHighlightLayers = [];

    const areas = filteredPlaces.filter((p) => p.location_type === "area");
    const clickedSet = new Set(clickedAreaGebieden);

    areas.forEach((p, idx) => {
      if (p !== selectedPlace) return;

      const gebieden = p.gebied.split(";").map((g) => g.trim());

      // Check if this area matches any clicked neighborhood
      const activeGebieden = gebieden.filter((g) => clickedSet.has(g));
      if (activeGebieden.length === 0) return;

      // Collect features for active neighborhoods
      const features = [];
      activeGebieden.forEach((gebied) => {
        const ids = buurtToFeatureIds.get(gebied) || [];
        ids.forEach((id) => {
          const originalFeat = allGeoFeatures[id];
          if (originalFeat) {
            features.push(JSON.parse(JSON.stringify(originalFeat)));
          }
        });
      });

      if (features.length > 0) {
        const sourceId = `click-highlight-src-${idx}`;

        let borderColor = "#ffffff";
        if (visualMode === "gebied") {
          const gebiedKey = p.gebied || "default";
          borderColor = GEBIED_COLORS[gebiedKey] || GEBIED_COLORS.default;
        } else if (visualMode === "koepel") {
          const koepelKey =
            (p.koepels || "").split(";").map((k) => k.trim())[0] || "default";
          borderColor = KOEPEL_COLORS[koepelKey] || KOEPEL_COLORS.default;
        }

        // 1. Add neighborhood outline layer
        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: features,
          },
        });

        map.addLayer(
          {
            id: `${sourceId}-outline`,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": borderColor,
              "line-width": 0,
            },
          },
          "buurten-fill",
        );

        map.addLayer(
          {
            id: `${sourceId}-fill`,
            type: "fill",
            source: sourceId,
            paint: {
              "fill-color": "#ffffff",
              "fill-opacity": 0.3,
            },
          },
          `${sourceId}-outline`,
        );

        currentHighlightLayers.push(sourceId);
      }
    });

    return () => {
      currentHighlightLayers.forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getLayer(`${id}-outline`)) map.removeLayer(`${id}-outline`);
        if (map.getLayer(`${id}-fill`)) map.removeLayer(`${id}-fill`);
        if (map.getSource(id)) map.removeSource(id);
      });
      currentHighlightLayers = [];
    };
  });

  $effect(() => {
    if (!map || !mapLoaded) return;
    const reversedPlaces = [...filteredPlaces].reverse();

    // Render markers for all places (both points and areas)
    reversedPlaces.forEach((place, index) => {
      const container = document.createElement("div");
      container.className = "marker-container";

      const el = document.createElement("div");
      const isArea = place.location_type === "area";

      el.className = isArea ? "air-area-marker" : "air-marker";

      let borderColor = "#ffffff";
      if (visualMode === "gebied") {
        const gebiedKey = place.gebied || "default";
        borderColor = GEBIED_COLORS[gebiedKey] || GEBIED_COLORS.default;
      } else if (visualMode === "koepel") {
        const koepelKey =
          (place.koepels || "").split(";").map((k) => k.trim())[0] || "default";
        borderColor = KOEPEL_COLORS[koepelKey] || KOEPEL_COLORS.default;
      }

      if (isArea) {
        el.innerHTML = createMarkerSVG(
          place.domeinen,
          borderColor,
          true,
          place === selectedPlace,
        );
      } else {
        el.innerHTML = createMarkerSVG(
          place.domeinen,
          borderColor,
          false,
          place === selectedPlace,
        );
      }

      container.appendChild(el);
      container.style.zIndex = isArea ? "100" : "200";

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        activatePlaceOnMap(place);
      });

      const m = new maplibregl.Marker({
        element: container,
        anchor: "center",
      })
        .setLngLat([place.longitude, place.latitude])
        .addTo(map);

      if (place === selectedPlace) {
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
</script>

<div
  class="layout"
  class:has-selected-area={selectedPlace &&
    selectedPlace.location_type === "area"}
  onclick={closePopup}
  role="presentation"
>
  <div class="mobile-header">In opbouw: "Initiatiefkracht in kaart"</div>
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
      onclick={() => (mobileSidebarOpen = !mobileSidebarOpen)}
    >
      <div class="toggle-content">
        <i class="ph {mobileSidebarOpen ? 'ph-caret-down' : 'ph-caret-up'}"></i>
        <span class="menu-text">menu</span>
      </div>
    </button>
    <div class="brand">
      IN OPBOUW: <br />
      Initiatiefkracht in kaart
    </div>

    <div class="sidebar-inner">
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
                  onclick={() => activatePlaceOnMap(suggestion)}
                  type="button"
                >
                  {suggestion.name}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="accordion">
        <button class="accordion-header" onclick={() => toggleSection("info")}>
          <span>Informatie</span>
          <span class="icon">{openSections.info ? "−" : "+"}</span>
        </button>
        {#if openSections.info}
          <div class="accordion-content">
            <section class="initiatives-intro">
              <div class="intro-section">
                <strong>Waarom deze kaart?</strong>
                <p>
                  Overal in Rotterdam ontstaan er nieuwe initiatieven waarin
                  mensen en gemeenschappen, vaak onder de radar, experimenteren
                  met alternatieven voor de toekomst. Op het gebied van
                  circulariteit, energie, mobiliteit, natuur, voedsel, werken en
                  wonen ontstaan praktijken die niet wachten op beleid, maar
                  handelen vanuit maatschappelijke noodzaak en
                  verbeeldingskracht. Elk op hun eigen domein(en) maar verbonden
                  door een gedeelde zoektocht.
                </p>
              </div>

              <div class="intro-section">
                <strong>Over deze kaart</strong>
                <p>
                  Op deze kaart vind je een verzameling van initiatieven in
                  Rotterdam, verdeeld over verschillende categorieën en
                  domeinen. De kaart is niet volledig, maar geeft een eerste
                  indruk van de diversiteit aan initiatieven in de stad. Veel
                  initiatieven laten zich niet eenvoudig in één domein plaatsen.
                  Ze ontstaan vaak vanuit een behoefte of urgentie in een wijk
                  of gemeenschap, en werken daardoor juist integraal en
                  domeinoverstijgend. Toch hebben we gekozen voor een
                  categorisering om de veelzijdigheid van initiatiefkracht beter
                  leesbaar en navigeerbaar te maken. Zo hopen we dat
                  initiatieven, organisaties en bewoners elkaar makkelijker
                  kunnen vinden, versterken en ondersteunen. <br /> <br />Hier
                  onder vind je een uitleg van de categorieën en domeinen die we
                  gebruiken om de initiatieven te ordenen.
                </p>
              </div>

              <div class="category-list">
                <div class="category-item">
                  <span
                    class="legend-marker legend-marker-point"
                    aria-hidden="true"
                  ></span>
                  <div class="category-text">
                    <strong>Plekken</strong>
                    <p>
                      Initiatieven met een vaste, fysieke locatie in de stad.
                    </p>
                  </div>
                </div>

                <div class="category-item">
                  <span
                    class="legend-marker legend-marker-area"
                    aria-hidden="true"
                  ></span>
                  <div class="category-text">
                    <strong>Wijken & Netwerken</strong>
                    <p>
                      Wijken: initiatieven die zich richten op een specifieke
                      wijk of buurt. <br />
                      Netwerken: initiatieven die verschillende partijen bij elkaar
                      brengen, en actief zijn in een bepaald gebied.
                    </p>
                  </div>
                </div>

                <div class="category-item">
                  <span
                    class="legend-marker legend-marker-koepel"
                    aria-hidden="true"
                  ></span>
                  <div class="category-text">
                    <strong>Koepels</strong>
                    <p>
                      Overkoepelende organisaties die meerdere initiatieven
                      onder zich hebben en verbinden.
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

              <div class="waardebloem-section">
                <p class="cta">
                  <strong>Klik op de Waardenbloem</strong>
                  en bekijk hoe de domeinen en categorieën zich tot elkaar verhouden.
                </p>
                <button
                  class="waardebloem-icon-btn"
                  onclick={() => (enlargedImage = "Waardebloem.png")}
                  title="Klik om de Waardebloem te vergroten"
                >
                  <img src="Waardebloem.png" alt="Waardebloem" />
                </button>
              </div>
              <div class="accordion-divider"></div>
              <div class="intro-section">
                <p>
                  Deze kaart is ontwikkeld door AIR, in samenwerking met
                  Groen010.
                </p>
                <div class="logos-section">
                  <img src="AIR.png" alt="AIR logo" class="org-logo" />
                  <img
                    src="VG010_logo.png"
                    alt="Groen010 logo"
                    class="org-logo"
                  />
                </div>
              </div>
            </section>
          </div>
        {/if}
      </div>

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
            {#each uniqueDomeinen as domein}
              <label class="filter-item">
                <input
                  type="checkbox"
                  checked={selectedDomeinen.includes(domein)}
                  onchange={() =>
                    (selectedDomeinen = toggleFilter(selectedDomeinen, domein))}
                />
                <span class="filter-text">{domein}</span>
                <i
                  class="ph {DOMEIN_ICONS[domein] ||
                    DOMEIN_ICONS.default} sidebar-icon"
                  style="color: {DOMEIN_COLORS[domein] ||
                    DOMEIN_COLORS.default}"
                ></i>
              </label>
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
              <span class="legend-marker legend-marker-point" aria-hidden="true"
              ></span>
            </label>

            <label class="filter-item">
              <input
                type="checkbox"
                checked={locationFilterMode === "areas"}
                onchange={() => (locationFilterMode = "areas")}
              />
              <span class="legend-text">Toon alleen netwerken en wijken</span>
              <span class="legend-marker legend-marker-area" aria-hidden="true"
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

      <div class="accordion">
        <button
          class="accordion-header"
          onclick={() => toggleSection("contribute")}
        >
          <span>Draag bij aan de kaart</span>
          <span class="icon">{openSections.contribute ? "−" : "+"}</span>
        </button>
        {#if openSections.contribute}
          <div class="accordion-content">
            <p>
              Heb je opmerkingen over de vermelding van jouw initiatief? Stuur
              dan een email naar <a href="mailto:initiatiefkracht@gmail.com"
                >initiatiefkracht@gmail.com</a
              >. Of wil je je eigen initiatief op de kaart hebben? Meld jouw
              initiatief
              <a
                href="https://forms.gle/2L41WPykgQH5QRAY7"
                target="_blank"
                rel="noopener noreferrer">hier</a
              > aan!
            </p>
          </div>
        {/if}
      </div>
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
  </aside>

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

  <div class="map-container" bind:this={mapContainer}>
    {#if !isMobile && showQrBlock}
      <div class="floating-qr-block">
        <button
          class="qr-close-btn"
          onclick={() => (showQrBlock = false)}
          aria-label="Sluiten"
        >
          <i class="ph ph-x"></i>
        </button>
        <div class="qr-content">
          <p class="qr-info-text">
            Op de kaart vind je slechts een kleine verzameling van de
            initiatiefkracht in Rotterdam. De kaart is volop in ontwikkeling,
            dus als je een initiatief mist, laat hem achter in de ideeënbus!
          </p>

          <div class="qr-code-wrap">
            <img src="initiatieven_QR.png" alt="Initiatieven QR code" />
          </div>

          <p class="qr-scan-text">
            Scan deze qr code om de kaart te ontdekken!
          </p>
        </div>
      </div>
    {/if}

    {#if selectedPlace}
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
          <div
            class="popup-title-group"
            style="display: flex; align-items: center; gap: 12px; flex-grow: 1; min-width: 0;"
          >
            <h3 class="popup-title">{selectedPlace.name}</h3>
          </div>
          <button class="close-btn" onclick={closePopup} aria-label="Sluiten"
            >×</button
          >
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
            <!-- svelte-ignore a11y_mouse_events_have_key_events -->
            <div
              class="domains-layout-container"
              class:has-hovered-domain={activeHoveredDomein !== null}
              style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;"
            >
              <!-- Hexagon Container -->
              <div
                style="width: fit-content; padding: 4px; display: flex; align-items: center; justify-content: center;"
                class="hexagon-container"
                data-hovered-domain={activeHoveredDomein}
                onmouseover={(e) => {
                  const target = e.target.closest(".hex-triangle");
                  if (target) {
                    activeHoveredDomein = target.getAttribute("data-domain");
                  }
                }}
                onmouseout={() => {
                  activeHoveredDomein = null;
                }}
              >
                {@html createHexagonSVG(selectedPlace.domeinen, 72, "#ffffff")}
              </div>

              <!-- Domain Tags List -->
              <div
                class="popup-tags"
                style="display: flex; flex-direction: column; gap: 6px;"
              >
                {#each [...new Set((selectedPlace.domeinen || "")
                      .split(";")
                      .map((d) => d.trim()))] as d}
                  <span
                    class="p-tag domain-name-tag"
                    class:light-up={activeHoveredDomein === d}
                    style="background-color: {DOMEIN_COLORS[d.trim()] ||
                      DOMEIN_COLORS.default}"
                    onmouseenter={() => (activeHoveredDomein = d)}
                    onmouseleave={() => (activeHoveredDomein = null)}
                  >
                    {d.trim()}
                  </span>
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
  </div>
</div>

<style>
  :global(#app) {
    margin: 0 !important;
    padding: 0 !important;
    max-width: none !important;
  }

  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
    width: 100%;
    height: 100%;
  }

  .layout {
    display: flex;
    width: 100%; /* was 100vw */
    height: 100%; /* was 100vh */
    position: fixed;
    top: 0;
    left: 0;
  }
  .sidebar {
    width: 350px;
    height: 100%;
    background: #fbf9f9;
    border-right: 1px solid rgba(0, 0, 0, 0.05);
    display: flex;
    flex-direction: column;
    z-index: 10;
    overflow-y: hidden;
    scrollbar-gutter: stable;
    font-family: "Helvetica", Arial, sans-serif;
    position: relative;
  }
  .sidebar-inner {
    flex: 1;
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
      background: #fbf9f9;
      color: #5d69fb;
      font-family: "Helvetica", Arial, sans-serif;
      font-weight: 900;
      font-size: 1.4rem;
      align-items: center;
      justify-content: center;
      z-index: 2500;
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
    }

    .fixed-air-popup {
      top: 80px !important;
      right: unset !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      width: 90% !important;
      max-width: 400px !important;
      max-height: none !important;
      border-radius: 8px !important;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15) !important;
      border: 1px solid rgba(0, 0, 0, 0.05) !important;
      overflow-y: hidden !important;
    }

    .sidebar {
      position: fixed;
      top: auto;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 50dvh;
      max-height: 50dvh;
      border-right: none;
      border-top: 1px solid rgba(0, 0, 0, 0.1);
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
      z-index: 2000;
      transform: translateY(calc(50dvh - 50px));
      transition: transform 0.3s ease-in-out;
    }

    .sidebar.open {
      transform: translateY(0);
    }

    .mobile-toggle {
      display: flex !important;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 50px;
      background: #fbf9f9;
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
      line-height: 1.1 !important;
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
      margin-bottom: 0 !important;
      flex: none !important;
      width: 100% !important;
    }

    .popup-info-row .label {
      font-size: 0.6rem !important;
      margin-bottom: 2px !important;
    }

    .popup-tags {
      margin-top: 0 !important;
      margin-bottom: 2px !important;
    }

    .p-tag {
      font-size: 8px !important;
      padding: 2px 4px !important;
      margin-bottom: 5px !important;
    }

    .buurt-tag {
      font-size: 7.5px !important;
    }

    .popup-footer {
      width: 100%;
      margin-top: 0 !important;
      padding-top: 0 !important;
      border-top: none !important;
    }

    .popup-link {
      font-size: 10px !important;
    }

    :global(.maplibregl-ctrl-bottom-right) {
      bottom: 90px !important;
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
    background-color: #fbf9f9;
    text-align: center;
  }
  .location-filter {
    padding: 16px 20px;
    border-bottom: 1px solid #e0ddd5;
    background: #fbf9f9;
  }
  .search-group {
    margin-bottom: 12px;
    position: relative;
    margin-left: 20px;
    margin-right: 20px;
    margin-top: 8px;
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
    background: #fbf9f9;
    transition: background-color 0.2s ease;
  }
  .accordion:has(.accordion-content) {
    background: #fbf9f9;
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
    border-radius: 6px;
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
    background: #fbf9f9;
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
    flex-grow: 1;
    height: 100%;
    position: relative;
  }

  .fixed-air-popup {
    position: absolute;
    top: 12px;
    right: 20px;

    bottom: auto;

    width: 300px;

    background: #fffcf4;
    border-radius: 6px;
    box-shadow:
      0 10px 30px rgba(0, 0, 0, 0.1),
      5px 5px 0px rgba(132, 80, 255, 0.15);
    z-index: 2000;

    font-family: "Helvetica", Arial, sans-serif;
    text-align: left;
    overflow-y: auto;
    border: 1px solid rgba(0, 0, 0, 0.05);
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
    font-size: 22px;
    font-family: Arial, sans-serif;
    cursor: pointer;
    color: #5d69fb;
    width: 28px;
    height: 28px;
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
    background-color: #fbf9f9;
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
    font-size: 9px;
    padding: 3px 6px;
    margin-right: 4px;
    margin-bottom: 4px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    text-transform: uppercase;
    font-weight: bold;
    color: #fbf9f9;
    display: inline-block;
    border-radius: 5px;
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
    font-size: 7.5px;
    padding: 1px 4px;
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
    background: #fbf9f9;
  }

  :global(.marker-container) {
    z-index: 100;
  }
  :global(.marker-container:hover) {
    z-index: 1000;
  }

  :global(.air-marker) {
    min-width: 16px;
    height: 16px;
    cursor: pointer;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    z-index: 20; /* Ensure points are above areas */
    transform-origin: center;
    transition:
      transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275),
      filter 0.25s ease;
  }

  :global(.marker-container:hover .air-marker) {
    transform: scale(1.4);
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    z-index: 1001;
  }

  :global(.air-marker.active-glow) {
    transform: scale(1.5);
    filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.35));
    z-index: 1002;
  }

  :global(.air-area-marker) {
    min-width: 30px;
    height: 30px;
    cursor: pointer;

    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    z-index: 20;
    transition:
      transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275),
      filter 0.25s ease;
    overflow: visible;
  }

  :global(.air-area-marker svg) {
    overflow: visible;
  }

  /* Rings: always visible at their base opacities, expanding on hover */
  :global(.air-area-marker .hex-ring) {
    opacity: var(--ring-op);
    transform-origin: center;
    transition:
      transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275),
      opacity 0.3s ease;
  }

  :global(.marker-container:hover .air-area-marker .hex-ring-1) {
    transform: scale(1.15);
    transition-delay: 0ms;
  }
  :global(.marker-container:hover .air-area-marker .hex-ring-2) {
    transform: scale(1.3);
    transition-delay: 15ms;
  }
  :global(.marker-container:hover .air-area-marker .hex-ring-3) {
    transform: scale(1.45);
    transition-delay: 30ms;
  }
  :global(.marker-container:hover .air-area-marker .hex-ring-4) {
    transform: scale(1.6);
    transition-delay: 45ms;
  }
  :global(.marker-container:hover .air-area-marker .hex-ring-5) {
    transform: scale(1.75);
    transition-delay: 60ms;
  }
  :global(.marker-container:hover .air-area-marker .hex-ring-6) {
    transform: scale(1.9);
    transition-delay: 75ms;
  }

  /* Rings when clicked/active: even more expanded than hover! */
  :global(.air-area-marker.active-glow .hex-ring-1) {
    transform: scale(1.3);
    transition-delay: 0ms;
  }
  :global(.air-area-marker.active-glow .hex-ring-2) {
    transform: scale(1.5);
    transition-delay: 15ms;
  }
  :global(.air-area-marker.active-glow .hex-ring-3) {
    transform: scale(1.7);
    transition-delay: 30ms;
  }
  :global(.air-area-marker.active-glow .hex-ring-4) {
    transform: scale(1.9);
    transition-delay: 45ms;
  }
  :global(.air-area-marker.active-glow .hex-ring-5) {
    transform: scale(2.1);
    transition-delay: 60ms;
  }
  :global(.air-area-marker.active-glow .hex-ring-6) {
    transform: scale(2.3);
    transition-delay: 75ms;
  }

  :global(.marker-container:hover .air-area-marker) {
    transform: scale(1.35);
    filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.45));
    z-index: 500;
  }

  :global(.air-area-marker.active-glow) {
    /* filter: drop-shadow(0 0 10px #5d69fb); */
    transform: scale(1.5);
    z-index: 1002;
  }

  .logos-section {
    display: flex;
    justify-content: center;
    gap: 20px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #e0ddd5;
  }

  .org-logo {
    height: 50px;
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
    border: 1px solid #737ac6;
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
    align-items: center;
    gap: 16px;
    margin-top: 8px;
    padding-top: 12px;
    border-top: 1px solid rgba(0, 0, 0, 0.05);
  }

  .waardebloem-icon-btn {
    width: 60px;
    height: 60px;
    flex-shrink: 0;
    padding: 4px;
    background: white;
    border: 1px solid #d8d2c8;
    border-radius: 12px;
    cursor: pointer;
    overflow: hidden;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .waardebloem-icon-btn:hover {
    border-color: #5d69fb;
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(93, 105, 251, 0.1);
  }

  .waardebloem-icon-btn img {
    width: 100%;
    height: 100%;
    object-fit: contain;
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
    box-shadow: 0 -10px 20px #fbf9f9;
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
    background: #ffffff;
    border: 1px solid #d8d2c8;
    border-radius: 8px;
    padding: 12px;
    display: flex;
    gap: 14px;
    align-items: center;
    transition: transform 0.2s ease;
  }

  .category-item:hover {
    transform: translateX(4px);
    border-color: #5d69fb44;
  }

  .category-text {
    flex: 1;
  }

  .category-text strong {
    display: block;
    font-size: 0.75rem;
    color: #5d69fb;
    margin-bottom: 2px;
    text-transform: uppercase;
    font-weight: 800;
    letter-spacing: 0.05rem;
  }

  .category-item p {
    margin: 0 !important;
    font-size: 0.75rem !important;
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

  :global(.layout.has-selected-area .air-marker),
  :global(.layout.has-selected-area .air-area-marker) {
    opacity: 0.4;
    transition:
      opacity 0.3s ease,
      filter 0.3s ease;
  }

  :global(.layout.has-selected-area .air-marker.active-glow),
  :global(.layout.has-selected-area .air-area-marker.active-glow),
  :global(.layout.has-selected-area .marker-container:hover .air-marker),
  :global(.layout.has-selected-area .marker-container:hover .air-area-marker) {
    opacity: 1;
  }

  :global(.hex-triangle) {
    transition:
      transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
      filter 0.25s ease,
      opacity 0.25s ease;
    transform-origin: center;
    cursor: pointer;
  }
  :global(.hex-triangle:hover) {
    transform: scale(1.15);
    filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.25));
    opacity: 0.95;
    z-index: 10;
    stroke-width: 1.5;
  }

  /* Two-way linkage: trigger SVG wedge highlight when domain tag on right is hovered */
  :global(
      .hexagon-container[data-hovered-domain="Wonen"]
        .hex-triangle[data-domain="Wonen"]
    ),
  :global(
      .hexagon-container[data-hovered-domain="Welzijn"]
        .hex-triangle[data-domain="Welzijn"]
    ),
  :global(
      .hexagon-container[data-hovered-domain="Cultuur"]
        .hex-triangle[data-domain="Cultuur"]
    ),
  :global(
      .hexagon-container[data-hovered-domain="Klimaat"]
        .hex-triangle[data-domain="Klimaat"]
    ),
  :global(
      .hexagon-container[data-hovered-domain="Voedsel"]
        .hex-triangle[data-domain="Voedsel"]
    ),
  :global(
      .hexagon-container[data-hovered-domain="Groen"]
        .hex-triangle[data-domain="Groen"]
    ),
  :global(
      .hexagon-container[data-hovered-domain="Circulair"]
        .hex-triangle[data-domain="Circulair"]
    ),
  :global(
      .hexagon-container[data-hovered-domain="Mobiliteit"]
        .hex-triangle[data-domain="Mobiliteit"]
    ),
  :global(
      .hexagon-container[data-hovered-domain="Energie"]
        .hex-triangle[data-domain="Energie"]
    ),
  :global(
      .hexagon-container[data-hovered-domain="default"]
        .hex-triangle[data-domain="default"]
    ) {
    transform: scale(1.15);
    filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.25));
    opacity: 0.95;
    z-index: 10;
    stroke-width: 1.5;
  }

  :global(.hexagon-container) {
    display: inline-block;
  }

  :global(.p-tag.domain-name-tag) {
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    transform-origin: left center;
    cursor: pointer;
  }

  /* Dim all domain tags by default when one is hovered */
  :global(.domains-layout-container.has-hovered-domain .domain-name-tag) {
    opacity: 0.45;
  }

  /* Keep hovered domain tag fully visible, scaled and bright */
  :global(
      .domains-layout-container.has-hovered-domain .domain-name-tag.light-up
    ) {
    opacity: 1;
    transform: scale(1.08);
    filter: brightness(1.15) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.2));
  }
</style>
