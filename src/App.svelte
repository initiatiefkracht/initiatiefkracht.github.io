<script>
  import { onMount } from "svelte";
  import maplibregl from "maplibre-gl";
  import Papa from "papaparse";
  import "maplibre-gl/dist/maplibre-gl.css";

  // --- STATE ---
  let mapContainer = $state();
  let map = $state();
  let mapLoaded = $state(false);
  let allPlaces = $state([]);
  let markers = [];
  let markerMap = new Map();
  let visualMode = $state("domein");
  let allGeoFeatures = $state([]);
  let currentOpacities = new Map();
  let opacityAnimationFrame = null;

  /** @type {any} */
  let selectedPlace = $state(null);
  let activeMarkerElement = $state(null);
  let enlargedImage = $state(null);
  let isMobile = $state(window.innerWidth < 900);

  // --- MAP OPZETTEN ---
  function initMap(geoData) {
    map = new maplibregl.Map({
      container: mapContainer,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [4.47, 51.915],
      zoom: 12.5,
      attributionControl: true,
    });

    // Add navigation controls (zoom, rotate)
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    // Add geolocation control (current location)
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

      map.addLayer(
        {
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
        },
        "watername_ocean",
      );

      mapLoaded = true;
    });
  }

  function handleVisualToggle(mode) {
    visualMode = visualMode === mode ? "default" : mode;
  }

  // --- CONFIGURATIES ---
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
    "Energie van Rotterdam": "#F48A8A", // Energie (iets minder pastel rood/koraal)
    "Rotterdam Circulair": "#FBBF72", // Circulair (iets minder pastel oranje)
    Groen010: "#86EFAC", // Groen
    "De Groene Connectie": "#5EEAD4", // Teal
    "Rotterdams Weerwoord": "#7DD3FC", // Klimaat blauw
    "Welzijnscoalitie Delfshaven": "#D8B4FE", // Paars
    Thuismakerscollectief: "#F9A8D4", // Roze
    RoCoCo: "#A5B4FC", // Indigo
    default: "#5d69fb",
  };

  // --- UI STATE ---
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

  let hoveredAreaGebieden = $state([]);

  let showOnlyPoints = $state(false);
  let showAreasOnly = $state(false);
  let showAll = $state(true);
  let searchQuery = $state("");
  let highlightedSearchIndex = $state(-1);
  let mobileSidebarOpen = $state(false);

  $effect(() => {
    // Reset index whenever search query changes
    searchQuery;
    highlightedSearchIndex = -1;
  });

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
        searchQuery = ""; // Clear search after selection
      }
    }
  }

  function selectPlaceOnMap(place) {
    activatePlaceOnMap(place);
  }

  function activatePlaceOnMap(place) {
    if (activeMarkerElement) {
      activeMarkerElement.classList.remove("active-glow");
      activeMarkerElement.style.zIndex = "";
    }

    selectedPlace = place;
    const markerEntry = markerMap.get(place);
    if (markerEntry) {
      activeMarkerElement = markerEntry.element;
      markerEntry.element.classList.add("active-glow");
      markerEntry.element.style.zIndex = "9999";
    } else {
      activeMarkerElement = null;
    }

    const sidebarWidth = 280;
    const desktopPopupWidth = 320; // CSS width is 300px, + margin

    // Dynamische padding die de UI-elementen ontwijkt:
    // Op desktop: links de sidebar (280px), rechts de popup (320px).
    // Op mobiel: onderin het menu, bovenin de popup.
    const padding = isMobile
      ? {
          top: 240, // Ruimte voor popup
          bottom: mobileSidebarOpen ? window.innerHeight * 0.5 + 40 : 70,
          left: 20,
          right: 20,
        }
      : {
          top: 60,
          bottom: 60,
          left: sidebarWidth + 60,
          right: desktopPopupWidth + 60,
        };

    // We gebruiken nu padding om te centreren in de vrije ruimte tussen sidebar en popup.
    // De zoom-logica is nu voor beide gelijk: we vliegen naar de marker-locatie.
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
  // zorg dat alleen unieke koepels en enkele koepels in de filter getoond worden
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
        // Check if any selected filter matches
        matchesGebied = selectedGebieden.some((selected) => {
          if (selected === "Rotterdam") {
            // Rotterdam matches if: 15+ buurten OR place has Rotterdam in it
            return isMultiBuurt || parts.some((g) => g === "Rotterdam");
          }
          // Other gebieden: exact match on place
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
      const matchesLocation = showOnlyPoints
        ? p.location_type === "point"
        : showAreasOnly
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
        // loose fallback: match on normalized substring if unique
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

  // --- DATA INLADEN ---
  onMount(async () => {
    const handleResize = () => {
      isMobile = window.innerWidth < 900;
    };
    window.addEventListener("resize", handleResize);

    const response = await fetch("initiatieven.csv");
    const csvString = await response.text();
    const geoResponse = await fetch("rotterdam-buurten.json");
    const geoData = await geoResponse.json();

    // Assign numeric IDs for feature-state
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
        allPlaces = results.data.filter((p) => p.latitude && p.longitude);

        // Breid alle area-initiatieven met gebied "Rotterdam" uit naar alle buurten.
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
      activeMarkerElement.style.zIndex = "";
    }
    selectedPlace = null;
    activeMarkerElement = null;
    clickedAreaGebieden = [];
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

    // Un-highlight features that are no longer highlighted
    highlightedFeatureIds.forEach((id) => {
      if (!nextHighlightedIds.has(id)) {
        map.setFeatureState(
          { source: "rotterdam-buurten", id },
          { highlight: false },
        );
      }
    });

    // Highlight new features
    nextHighlightedIds.forEach((id) => {
      if (!highlightedFeatureIds.has(id)) {
        map.setFeatureState(
          { source: "rotterdam-buurten", id },
          { highlight: true },
        );
      }
    });

    highlightedFeatureIds = nextHighlightedIds;

    // --- ANIMATION LOOP ---
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

  // --- MARKERS UPDATEN ---
  $effect(() => {
    if (!map) return;
    markers.forEach((m) => m.remove());
    markers = [];
    markerMap.clear();

    filteredPlaces.forEach((place) => {
      const el = document.createElement("div");
      const isArea = place.location_type === "area";

      el.className = "air-marker";
      if (isArea) el.classList.add("air-area-marker");
      const domeinList = [
        ...new Set((place.domeinen || "").split(";").map((d) => d.trim())),
      ];

      let iconsHtml = "";
      domeinList.forEach((d) => {
        const iconColor = isArea
          ? "#ffffff"
          : DOMEIN_COLORS[d] || DOMEIN_COLORS.default;
        const iconClass = DOMEIN_ICONS[d] || DOMEIN_ICONS.default;
        iconsHtml += `<i class="ph ${iconClass}" style="color: ${iconColor};"></i>`;
      });
      if (isArea) {
        el.innerHTML = `<div class="area-marker-inner">${iconsHtml}</div>`;
      } else {
        el.innerHTML = iconsHtml;
      }

      if (isArea) {
        el.style.backgroundColor = "#5d69fb";
        if (visualMode === "koepel") {
          const koepelKey =
            (place.koepels || "").split(";").map((k) => k.trim())[0] ||
            "default";
          el.style.borderColor =
            KOEPEL_COLORS[koepelKey] || KOEPEL_COLORS.default;
        } else {
          el.style.borderColor = "#ffffff";
        }
        const areaGebieden = (place.gebied || "")
          .split(";")
          .map((g) => g.trim());
        el.addEventListener("mouseenter", () => {
          hoveredAreaGebieden = areaGebieden.filter(Boolean);
        });

        el.addEventListener("mouseleave", () => {
          hoveredAreaGebieden = [];
        });
      } else {
        if (visualMode === "gebied") {
          const gebiedKey = place.gebied || "default";
          el.style.borderColor =
            GEBIED_COLORS[gebiedKey] || GEBIED_COLORS.default;
        } else if (visualMode === "koepel") {
          const koepelKey =
            (place.koepels || "").split(";").map((k) => k.trim())[0] ||
            "default";
          el.style.borderColor =
            KOEPEL_COLORS[koepelKey] || KOEPEL_COLORS.default;
        } else {
          el.style.borderColor = "#737ac6";
        }
        el.style.backgroundColor = "#ffffff";
      }

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        activatePlaceOnMap(place);
      });

      const m = new maplibregl.Marker({ element: el })
        .setLngLat([place.longitude, place.latitude])
        .addTo(map);

      markers.push(m);
      markerMap.set(place, { element: el, marker: m });
    });
  });

  function toggleFilter(list, value) {
    if (list.includes(value)) return list.filter((i) => i !== value);
    return [...list, value];
  }

  // --- HULPFUNCTIE VOOR ZOOM ---
  function getAreaBounds(gebiedString) {
    // Check of de data wel geladen is
    if (!gebiedString || !allGeoFeatures || allGeoFeatures.length === 0)
      return null;

    const namen = gebiedString.split(";").map((g) => g.trim().toLowerCase());
    const bounds = new maplibregl.LngLatBounds();
    let found = false;

    allGeoFeatures.forEach((feature) => {
      const buurtNaam = feature.properties.buurtnaam?.toLowerCase();
      if (namen.includes(buurtNaam)) {
        const coords = feature.geometry.coordinates;

        // Helper om door geneste coördinaten te lopen (Polygon/MultiPolygon)
        const extendRecursive = (c) => {
          if (typeof c[0] === "number") {
            bounds.extend(c);
            found = true;
          } else {
            c.forEach(extendRecursive);
          }
        };
        extendRecursive(coords);
      }
    });

    return found ? bounds : null;
  }

  // --- Zet dit ergens los op root-niveau in je script ---
  $effect(() => {
    if (isMobile && selectedPlace && map) {
      // Re-trigger map positioning whenever mobile sidebar is opened or closed
      mobileSidebarOpen;
      activatePlaceOnMap(selectedPlace);
    }
  });

  // --- Schone versie van uniqueGebieden ---
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

<div class="layout" onclick={closePopup} role="presentation">
  <aside
    class="sidebar"
    class:open={mobileSidebarOpen}
    onclick={(e) => e.stopPropagation()}
    ontouchstart={(e) => e.stopPropagation()}
    ontouchmove={(e) => e.stopPropagation()}
    ontouchend={(e) => e.stopPropagation()}
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
    <div class="brand">Initiatievenkaart</div>

    <div class="sidebar-inner">
      <div class="search-group">
        <input
          type="search"
          class="search-input"
          placeholder="Zoek op initiatiefnaam"
          bind:value={searchQuery}
          onkeydown={handleSearchKeyDown}
        />
        {#if searchSuggestions.length > 0}
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

      <div class="accordion">
        <button class="accordion-header" onclick={() => toggleSection("info")}>
          <span>Informatie</span>
          <span class="icon">{openSections.info ? "−" : "+"}</span>
        </button>
        {#if openSections.info}
          <div class="accordion-content">
            <p>Informatie over initiatieven......</p>
            <button
              class="image-button"
              onclick={() => (enlargedImage = "waardebloem.png")}
              title="klik om te vergroten"
            >
              <img
                src="waardebloem.png"
                alt="Waardebloem"
                style="width: 100%; margin-top: 10px;"
              />
            </button>
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

      <!-- <div class="accordion">
        <button
          class="accordion-header"
          onclick={() => toggleSection("gebied")}
        >
          <span>Gebied</span>
          <span class="icon">{openSections.gebied ? "−" : "+"}</span>
        </button>
        {#if openSections.gebied}
          <div class="accordion-content"> -->
      <!-- <div class="visual-toggle-container">
            <span class="toggle-text">Toon kleuren per gebied</span>
            <label class="switch">
              <input
                type="checkbox"
                checked={visualMode === "gebied"}
                onchange={() => handleVisualToggle("gebied")}
              />
              <span class="slider"></span>
            </label>
          </div> -->
      <!-- <hr class="separator" />
            {#each uniqueGebieden as gebied}
              <label class="filter-item">
                <input
                  type="checkbox"
                  checked={selectedGebieden.includes(gebied)}
                  onchange={() =>
                    (selectedGebieden = toggleFilter(selectedGebieden, gebied))}
                />
                <span class="filter-text">{gebied}</span>
                <span
                  class="color-swatch"
                  style="background-color: {GEBIED_COLORS[gebied] ||
                    GEBIED_COLORS.default}"
                ></span>
              </label>
            {/each}
          </div>
        {/if}
      </div> -->

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

      <div class="location-filter">
        <label class="filter-item">
          <input
            type="checkbox"
            checked={showOnlyPoints}
            onchange={() => {
              showOnlyPoints = true;
              showAreasOnly = false;
              showAll = false;
            }}
          />
          <span class="legend-text">Toon alleen plekken</span>
          <span class="legend-marker legend-marker-point" aria-hidden="true"
          ></span>
        </label>

        <label class="filter-item">
          <input
            type="checkbox"
            checked={showAreasOnly}
            onchange={() => {
              showOnlyPoints = false;
              showAreasOnly = true;
              showAll = false;
            }}
          />
          <span class="legend-text">Toon alleen netwerken en wijken</span>
          <span class="legend-marker legend-marker-area" aria-hidden="true"
          ></span>
        </label>

        <label class="filter-item">
          <input
            type="checkbox"
            checked={showAll}
            onchange={() => {
              showOnlyPoints = false;
              showAreasOnly = false;
              showAll = true;
            }}
          />
          <span class="legend-text">Toon alle initiatieven</span>
        </label>
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
            <p
              style="font-size: 0.9rem; line-height: 1.5; color: #333; padding: 0 8px;"
            >
              Heb je opmerkingen over de vermelding van jouw initiatief? Of wil
              je je eigen initiatief op de kaart hebben? Stuur een mail naar <a
                href="mailto:office@airrotterdam.eu"
                style="color: #5d69fb; text-decoration: none; font-weight: 500;"
                >office@airrotterdam.eu</a
              >
            </p>
          </div>
        {/if}
      </div>

      <div class="stats">
        <strong>{filteredPlaces.length}</strong> initiatieven getoond
      </div>
    </div>
  </aside>

  {#if enlargedImage}
    <div
      class="image-modal"
      onclick={() => (enlargedImage = null)}
      role="presentation"
    >
      <img src={enlargedImage} alt="Enlarged" class="enlarged-image" />
    </div>
  {/if}

  <div class="map-container" bind:this={mapContainer}>
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
          <h3 class="popup-title">{selectedPlace.name}</h3>
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
            <div class="popup-tags">
              {#each [...new Set((selectedPlace.domeinen || "")
                    .split(";")
                    .map((d) => d.trim()))] as d}
                <span
                  class="p-tag"
                  style="background-color: {DOMEIN_COLORS[d.trim()] ||
                    DOMEIN_COLORS.default}"
                >
                  {d.trim()}
                </span>
              {/each}
            </div>
          </div>

          <div class="popup-info-row koepel-row">
            {#if selectedPlace.koepels}
              <span class="label">Koepel</span>
              <div class="popup-tags">
                {#each selectedPlace.koepels.split(";") as koepel}
                  <span
                    class="p-tag"
                    style="background-color: {KOEPEL_COLORS[koepel.trim()] ||
                      KOEPEL_COLORS.default}"
                  >
                    {koepel.trim()}
                  </span>
                {/each}
              </div>
            {/if}
          </div>

          <div class="popup-info-row website-row">
            {#if selectedPlace.website}
              <span class="label">Website</span>
              <div class="popup-footer">
                <a
                  href={selectedPlace.website}
                  target="_blank"
                  class="popup-link">Bezoek website ↗</a
                >
              </div>
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

  .layout {
    display: flex;
    width: 100vw;
    height: 100vh;
    position: fixed;
    top: 0;
    left: 0;
  }
  .sidebar {
    width: 280px;
    height: 100%;
    background: #fbf9f9;
    border-right: 1px solid rgba(0, 0, 0, 0.05);
    display: flex;
    flex-direction: column;
    z-index: 10;
    overflow-y: auto;
    scrollbar-gutter: stable;
    font-family: "Helvetica", Arial, sans-serif;
    position: relative;
  }

  @media (max-width: 900px) {
    .sidebar {
      position: fixed;
      top: auto;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 50vh;
      max-height: 50vh;
      border-right: none;
      border-top: 1px solid rgba(0, 0, 0, 0.1);
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
      z-index: 2000;
      transform: translateY(calc(50vh - 50px));
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
    .stats,
    .sidebar-collapse {
      display: none !important;
    }
    .accordion-content {
      max-height: 40vh;
      overflow-y: auto;
    }

    .sidebar {
      padding: 0 8px;
    }

    .fixed-air-popup {
      top: 10px !important;
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
    .koepel-row {
      grid-area: 2 / 1 / 3 / 2;
    }
    .website-row {
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

    /* Move map controls up on mobile to avoid sidebar handle */
    :global(.maplibregl-ctrl-bottom-right) {
      bottom: 50px !important;
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
    /* border-color: #5d69fb; */
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
  .filter-item {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 10px 0;
    font-size: 0.8rem;
    color: #333;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
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
  .stats strong {
    color: #5d69fb;
    font-size: 0.85rem;
  }
  input[type="checkbox"] {
    accent-color: #5d69fb;
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
    /* ensure we don't get forced too far down on iOS */
    bottom: auto;

    width: 300px;

    background: #fffcf4;
    border-radius: 6px;
    box-shadow:
      0 10px 30px rgba(0, 0, 0, 0.1),
      5px 5px 0px rgba(132, 80, 255, 0.15);
    z-index: 2000;
    /* animation: popup-slide-in 0.3s cubic-bezier(0.1, 1, 0.1, 1); */
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

  /* POINT MARKERS (Oude stijl met border) */
  :global(.air-marker) {
    min-width: 26px;
    height: 26px;
    border: 2px solid #737ac6;
    border-radius: 13px;
    cursor: pointer;
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 0 4px;
    box-sizing: border-box;
    z-index: 100 !important;

    /* IMPORTANT: no transform transition */
    transition:
      box-shadow 0.25s ease,
      border-color 0.25s ease;
  }
  :global(.air-marker i) {
    font-size: 14px;
    line-height: 1;
  }
  :global(.air-marker:hover) {
    z-index: 1000 !important;
    transform: scale(1.07);
  }

  :global(.air-marker.active-glow) {
    z-index: 9999 !important;
    border: 2.5px solid #5d69fb;
    box-shadow:
      0 0 0 3px #5d69fb33,
      0 0 15px 8px rgba(132, 80, 255, 0.15),
      0 2px 6px rgba(0, 0, 0, 0.2);
  }

  /* AREA MARKERS: Transparent style to blend with background */
  :global(.air-area-marker) {
    border: 2px solid #ffffff;
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
    font-size: 16px;
    width: 20px;
    text-align: center;
  }

  /* Legend items in location-filter */
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
    border: 2px solid #ffffff;
  }

  .image-button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    display: block;
    width: 100%;
  }
  .image-button:hover img {
    opacity: 0.9;
  }
  .image-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3000;
    cursor: pointer;
  }
  .enlarged-image {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
  }
</style>
