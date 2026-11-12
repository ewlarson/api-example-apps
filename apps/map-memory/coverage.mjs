// Dated availability, not an offline deck. Every game rechecks live images.
export const COVERAGE_DATE = '2026-11-12';
export const COVERAGE = {
  "chicago": 21,
  "san-francisco": 23,
  "seattle": 8,
  "new-york": 9,
  "los-angeles": 19,
  "houston": 22,
  "philadelphia": 18,
  "boston": 20,
  "washington": 17,
  "atlanta": 3,
  "austin": 22,
  "baltimore": 18,
  "columbus": 4,
  "dallas": 21,
  "denver": 2,
  "des-moines": 1,
  "detroit": 22,
  "indianapolis": 23,
  "miami": 0,
  "milwaukee": 3,
  "minneapolis": 20,
  "new-orleans": 3,
  "newark": 20,
  "omaha": 8,
  "portland": 4,
  "san-diego": 7
};
export function availabilityLabel(count) {
  if (!Number.isInteger(count)) return 'Availability not checked';
  return count < 4 ? `Not enough maps · ${count} found` : `${Math.min(count, 8)} pairs available${count < 8 ? ' · smaller board' : ''}`;
}
export function suggestedCities(city, cities, coverage) {
  const distance = other => (other.lat - city.lat) ** 2 + ((other.lon - city.lon) * Math.cos(city.lat * Math.PI / 180)) ** 2;
  return cities.filter(other => other.id !== city.id && coverage[other.id] >= 4)
    .sort((a, b) => Number(b.state === city.state) - Number(a.state === city.state) || distance(a) - distance(b)).slice(0, 3);
}

// Keep audited cities in the catalog for future coverage refreshes, but only
// offer cities that can currently supply the minimum four distinct maps.
export function playableCities(cities, coverage) {
  return cities.filter(city => Number.isInteger(coverage[city.id]) && coverage[city.id] >= 4);
}
