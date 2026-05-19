export const TEAM_COLOURS = {
  red_bull:     '#3671C6',
  ferrari:      '#E8002D',
  mercedes:     '#27F4D2',
  mclaren:      '#FF8000',
  aston_martin: '#229971',
  alpine:       '#FF87BC',
  haas:         '#B6BABD',
  rb:           '#6692FF',
  williams:     '#64C4FF',
  sauber:       '#52E252',
}

const NAME_PATTERNS = [
  [/red.bull/i,            '#3671C6'],
  [/ferrari/i,             '#E8002D'],
  [/mercedes/i,            '#27F4D2'],
  [/mclaren/i,             '#FF8000'],
  [/aston.martin/i,        '#229971'],
  [/alpine/i,              '#FF87BC'],
  [/haas/i,                '#B6BABD'],
  [/racing bulls|toro rosso|alphatauri|alpha tauri|\brb\b/i, '#6692FF'],
  [/williams/i,            '#64C4FF'],
  [/sauber|alfa romeo|kick/i, '#52E252'],
]

// driver_id → team colour fallback for rounds where team_name/team_colour are null in the DB
const DRIVER_COLOURS = {
  max_verstappen:  '#3671C6',
  perez:           '#3671C6',
  norris:          '#FF8000',
  piastri:         '#FF8000',
  leclerc:         '#E80020',
  sainz:           '#E80020',
  bearman:         '#E80020',
  hamilton:        '#27F4D2',
  russell:         '#27F4D2',
  antonelli:       '#27F4D2',
  alonso:          '#229971',
  stroll:          '#229971',
  gasly:           '#0093cc',
  ocon:            '#0093cc',
  doohan:          '#FF87BC',
  albon:           '#64C4FF',
  sargeant:        '#64C4FF',
  colapinto:       '#64C4FF',
  tsunoda:         '#6692FF',
  ricciardo:       '#6692FF',
  lawson:          '#6692FF',
  hadjar:          '#6692FF',
  hulkenberg:      '#B6BABD',
  kevin_magnussen: '#B6BABD',
  bottas:          '#52E252',
  zhou:            '#52E252',
  bortoleto:       '#52E252',
}

export function getTeamColour(nameOrId) {
  if (!nameOrId) return '#888888'
  if (TEAM_COLOURS[nameOrId]) return TEAM_COLOURS[nameOrId]
  for (const [pattern, colour] of NAME_PATTERNS) {
    if (pattern.test(nameOrId)) return colour
  }
  return '#888888'
}

export function getTeamColourByDriverId(driverId) {
  return DRIVER_COLOURS[driverId] ?? '#888888'
}
