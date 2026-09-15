// ─── Master color knobs ────────────────────────────────────────────────────
// Change these two values to repaint all water or all greenery on the map.

export const WATER_COLOR = '#efefffff'// all water bodies & labels
export const GREENERY_COLOR = 'rgba(255, 255, 255, 1)' // base green for parks / woods / scrub etc.
export const BUILDINGS_COLOR = '#6d6dacff'

// Derived greenery tones (slightly lighter / darker variants of the base)
// You can override these individually if you want more control.
const GREENERY_PARK = GREENERY_COLOR // park_a / park_b / zoo
const GREENERY_WOOD = GREENERY_COLOR  // wood_a / wood_b
const GREENERY_SCRUB = GREENERY_COLOR  // scrub_a / scrub_b
const GREENERY_GRASS = GREENERY_COLOR // landcover.grassland
const GREENERY_FARM = GREENERY_COLOR  // landcover.farmland
const GREENERY_FOREST = GREENERY_COLOR                  // landcover.forest

/** Utility: mix color toward white by `amount` (0-1). Works on rgba() strings. */
function lighten(rgba: string, amount: number): string {
  const m = rgba.match(/[\d.]+/g)
  if (!m || m.length < 3) return rgba
  const blend = (v: number) => Math.round(v + (255 - v) * amount)
  return `rgba(${blend(+m[0])}, ${blend(+m[1])}, ${blend(+m[2])}, ${m[3] ?? '1'})`
}

// ─── Full basemap flavor ───────────────────────────────────────────────────

export const ALLMAPS_FLAVOR = {
  background: 'rgba(255, 252, 244, 1)',
  earth: 'rgba(255, 252, 244, 1)',

  // Greenery
  park_a: GREENERY_PARK,
  park_b: GREENERY_PARK,
  wood_a: GREENERY_WOOD,
  wood_b: GREENERY_WOOD,
  scrub_a: GREENERY_SCRUB,
  scrub_b: GREENERY_SCRUB,
  zoo: GREENERY_PARK,

  // Water
  water: WATER_COLOR,
  pier: WATER_COLOR,

  // Buildings
  hospital: BUILDINGS_COLOR,
  industrial: BUILDINGS_COLOR,
  school: BUILDINGS_COLOR,
  pedestrian: BUILDINGS_COLOR,
  glacier: BUILDINGS_COLOR,
  sand: BUILDINGS_COLOR,
  beach: 'rgba(255, 239, 203, 1)',
  aerodrome: 'rgba(245, 245, 249, 1)',
  runway: 'rgba(193, 195, 217, 1)',
  military: 'rgba(246, 241, 231, 1)',

  tunnel_other_casing: 'rgba(255, 252, 244, 1)',
  tunnel_minor_casing: 'rgba(255, 252, 244, 1)',
  tunnel_link_casing: 'rgba(255, 252, 244, 1)',
  tunnel_medium_casing: 'rgba(255, 252, 244, 1)',
  tunnel_major_casing: 'rgba(255, 252, 244, 1)',
  tunnel_highway_casing: 'rgba(255, 252, 244, 1)',
  tunnel_other: 'rgba(222, 220, 216, 1)',
  tunnel_minor: 'rgba(222, 220, 216, 1)',
  tunnel_link: 'rgba(222, 220, 216, 1)',
  tunnel_medium: 'rgba(222, 220, 216, 1)',
  tunnel_major: 'rgba(205, 204, 200, 1)',
  tunnel_highway: 'rgba(205, 204, 200, 1)',

  transit_pier: 'rgba(205, 241, 240, 1)',
  buildings: BUILDINGS_COLOR,

  minor_service_casing: 'rgba(255, 252, 244, 1)',
  minor_casing: 'rgba(255, 252, 244, 1)',
  link_casing: 'rgba(255, 252, 244, 1)',
  medium_casing: 'rgba(255, 252, 244, 1)',
  major_casing_late: 'rgba(255, 252, 244, 1)',
  highway_casing_late: 'rgba(255, 252, 244, 1)',
  other: 'rgba(192, 192, 192, 1)',
  minor_service: 'rgba(192, 192, 192, 1)',
  minor_a: '#c0c0c0',
  minor_b: '#c0c0c0',
  link: 'rgba(192, 192, 192, 1)',
  medium: 'rgba(192, 192, 192, 1)',
  major_casing_early: 'rgba(255, 252, 244, 1)',
  major: 'rgba(170, 170, 170, 1)',
  highway_casing_early: 'rgba(255, 252, 244, 1)',
  highway: 'rgba(170, 170, 170, 1)',

  railway: 'rgba(192, 192, 192, 1)',
  boundaries: '#bfad81',
  waterway_label: 'rgba(43, 168, 180, 1)',   // darker tint of WATER_COLOR — adjust alongside WATER_COLOR

  bridges_other_casing: 'rgba(255, 252, 244, 1)',
  bridges_minor_casing: 'rgba(255, 252, 244, 1)',
  bridges_link_casing: 'rgba(255, 252, 244, 1)',
  bridges_medium_casing: 'rgba(255, 252, 244, 1)',
  bridges_major_casing: 'rgba(255, 252, 244, 1)',
  bridges_highway_casing: 'rgba(255, 252, 244, 1)',
  bridges_other: 'rgba(192, 192, 192, 1)',
  bridges_minor: 'rgba(192, 192, 192, 1)',
  bridges_link: 'rgba(192, 192, 192, 1)',
  bridges_medium: 'rgba(192, 192, 192, 1)',
  bridges_major: 'rgba(169, 169, 169, 1)',
  bridges_highway: 'rgba(169, 169, 169, 1)',

  roads_label_minor: 'rgba(138, 137, 134, 1)',
  roads_label_minor_halo: 'rgba(255, 252, 244, 1)',
  roads_label_major: 'rgba(123, 122, 119, 1)',
  roads_label_major_halo: 'rgba(255, 252, 244, 1)',
  ocean_label: 'rgba(67, 145, 155, 1)',
  peak_label: 'rgba(119, 111, 93, 1)',
  subplace_label: 'rgba(169, 167, 163, 1)',
  subplace_label_halo: 'rgba(255, 252, 244, 1)',
  city_label: '#5c5c5c',
  city_label_halo: '#fffcf4',
  state_label: 'rgba(169, 164, 154, 1)',
  state_label_halo: 'rgba(0,0,0,0)',
  country_label: 'rgba(143, 140, 133, 1)',

  address_label: '#5c5c5c',
  address_label_halo: 'rgba(255, 252, 244, 1)',

  regular: 'Roboto Regular',
  bold: 'Roboto Medium',
  italic: 'Roboto Italic',

  landcover: {
    grassland: GREENERY_GRASS,
    barren: GREENERY_COLOR,
    urban_area: GREENERY_COLOR,
    farmland: GREENERY_FARM,
    glacier: GREENERY_COLOR,
    scrub: GREENERY_SCRUB,
    forest: GREENERY_FOREST,
  }
}

export const TERRAIN_COLORS = {
  hillshade_shadow_color: 'rgba(76, 63, 34, 1)',
  hillshade_accent_color: 'rgba(98, 105, 189, 1)',
  contour_line_color: 'black'
}