const BASE = 'https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers'

const HEADSHOTS = {
  max_verstappen:  `${BASE}/M/MAXVER01_Max_Verstappen/maxver01.png.transform/1col/image.png`,
  perez:           `${BASE}/S/SERPER01_Sergio_Perez/serper01.png.transform/1col/image.png`,
  leclerc:         `${BASE}/C/CHALEC01_Charles_Leclerc/chalec01.png.transform/1col/image.png`,
  sainz:           `${BASE}/C/CARSAI01_Carlos_Sainz/carsai01.png.transform/1col/image.png`,
  hamilton:        `${BASE}/L/LEWHAM01_Lewis_Hamilton/lewham01.png.transform/1col/image.png`,
  russell:         `${BASE}/G/GEORUS01_George_Russell/georus01.png.transform/1col/image.png`,
  norris:          `${BASE}/L/LANNOR01_Lando_Norris/lannor01.png.transform/1col/image.png`,
  piastri:         `${BASE}/O/OSCPIA01_Oscar_Piastri/oscpia01.png.transform/1col/image.png`,
  alonso:          `${BASE}/F/FERALO01_Fernando_Alonso/feralo01.png.transform/1col/image.png`,
  stroll:          `${BASE}/L/LANSTR01_Lance_Stroll/lanstr01.png.transform/1col/image.png`,
  gasly:           `${BASE}/P/PIEGAS01_Pierre_Gasly/piegas01.png.transform/1col/image.png`,
  ocon:            `${BASE}/E/ESTOCO01_Esteban_Ocon/estoco01.png.transform/1col/image.png`,
  albon:           `${BASE}/A/ALEALB01_Alexander_Albon/alealb01.png.transform/1col/image.png`,
  sargeant:        `${BASE}/L/LOGSAR01_Logan_Sargeant/logsar01.png.transform/1col/image.png`,
  tsunoda:         `${BASE}/Y/YUKTSU01_Yuki_Tsunoda/yuktsu01.png.transform/1col/image.png`,
  ricciardo:       `${BASE}/D/DANRIC01_Daniel_Ricciardo/danric01.png.transform/1col/image.png`,
  hulkenberg:      `${BASE}/N/NICHUL01_Nico_Hulkenberg/nichul01.png.transform/1col/image.png`,
  kevin_magnussen: `${BASE}/K/KEVMAG01_Kevin_Magnussen/kevmag01.png.transform/1col/image.png`,
  bottas:          `${BASE}/V/VALBOT01_Valtteri_Bottas/valbot01.png.transform/1col/image.png`,
  zhou:            `${BASE}/G/GUAZHO01_Guanyu_Zhou/guazho01.png.transform/1col/image.png`,
  bearman:         `${BASE}/O/OLIBEA01_Oliver_Bearman/olibea01.png.transform/1col/image.png`,
  colapinto:       `${BASE}/F/FRACOL01_Franco_Colapinto/fracol01.png.transform/1col/image.png`,
  lawson:          `${BASE}/L/LIALAW01_Liam_Lawson/lialaw01.png.transform/1col/image.png`,
  doohan:          `${BASE}/J/JACDOO01_Jack_Doohan/jacdoo01.png.transform/1col/image.png`,
  antonelli:       `${BASE}/A/ANDANT01_Andrea_Kimi_Antonelli/andant01.png.transform/1col/image.png`,
  hadjar:          `${BASE}/I/ISAHAD01_Isack_Hadjar/isahad01.png.transform/1col/image.png`,
  bortoleto:       `${BASE}/G/GABCOL01_Gabriel_Bortoleto/gabcol01.png.transform/1col/image.png`,
}

export function getDriverHeadshot(driverId) {
  return HEADSHOTS[driverId] ?? null
}

export function getDriverHeadshotHQ(driverId) {
  const url = getDriverHeadshot(driverId)
  if (!url) return null
  return url
    .replace('/d_driver_fallback_image.png', '')
    .replace('.transform/1col/image.png', '')
}
