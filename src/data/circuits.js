import trackPathsJson from './trackPaths.json'

export const CIRCUIT_LENGTHS = {
  bahrain:       5.412,
  jeddah:        6.174,
  albert_park:   5.278,
  suzuka:        5.807,
  shanghai:      5.451,
  miami:         5.412,
  imola:         4.909,
  monaco:        3.337,
  villeneuve:    4.361,
  catalunya:     4.657,
  red_bull_ring: 4.318,
  silverstone:   5.891,
  hungaroring:   4.381,
  spa:           7.004,
  zandvoort:     4.259,
  monza:         5.793,
  baku:          6.003,
  marina_bay:    4.940,
  americas:      5.513,
  rodriguez:     4.304,
  interlagos:    4.309,
  vegas:         6.201,
  losail:        5.380,
  yas_marina:    5.281,
}

export const CIRCUIT_CORNERS = {
  bahrain:       15,
  jeddah:        27,
  albert_park:   14,
  suzuka:        18,
  shanghai:      16,
  miami:         19,
  imola:         19,
  monaco:        19,
  villeneuve:    14,
  catalunya:     16,
  red_bull_ring: 10,
  silverstone:   18,
  hungaroring:   14,
  spa:           19,
  zandvoort:     14,
  monza:         11,
  baku:          20,
  marina_bay:    23,
  americas:      20,
  rodriguez:     17,
  interlagos:    15,
  vegas:         17,
  losail:        16,
  yas_marina:    16,
}

// Clockwise rotation in degrees to match F1 broadcast canonical orientation.
// 0 = north-up (default after Y-flip). Adjust per circuit as needed.
export const CIRCUIT_ROTATIONS = {
  bahrain:       270,
  jeddah:        225,
  albert_park:   320,
  suzuka:        0,
  shanghai:      122,
  miami:         0,
  imola:         0,
  monaco:        45,
  villeneuve:    300,
  catalunya:     57.5,
  red_bull_ring: 0,
  silverstone:   90,
  hungaroring:   50,
  spa:           270,
  zandvoort:     180,
  monza:         270,
  baku:          45,
  marina_bay:    0,
  americas:      0,
  rodriguez:     0,
  interlagos:    90,
  vegas:         270,
  losail:        300,
  yas_marina:    90,
}

export function getCircuitPath(circuitId) {
  return trackPathsJson[circuitId] ?? null
}

// Returns {min_x, min_y, scale, offset_x, offset_y} for circuits generated from
// warehouse GPS. Returns null for circuits that fell back to FastF1 data.
export function getCircuitNormalization(circuitId) {
  return trackPathsJson[circuitId]?.normalization ?? null
}
