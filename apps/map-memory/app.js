import { CITIES, filterCities, normalize, chooseMaps, MemoryGame, LatestRequest } from './core.mjs';
import { COVERAGE, COVERAGE_DATE, availabilityLabel, suggestedCities, playableCities } from './coverage.mjs';
import { loadCity } from './api.mjs';
import { renderCityBasemap } from './basemap.mjs';
import { createCelebration } from './celebration.mjs';

const $ = id => document.getElementById(id);
const input = $('citySearch'), options = $('cityOptions'), board = $('board');
const availability = { ...COVERAGE };
const cityChoices = () => playableCities(CITIES, availability);
$('cityCount').textContent = `${cityChoices().length} cities`;
let city = CITIES[0], pendingCity = city, filtered = cityChoices(), active = -1;
let result = null, maps = [], buttons = [], loading = false;
const requests = new LatestRequest();
const basemapRequests = new LatestRequest();
let dialogOpener = null;
const celebration = createCelebration($('confetti'));
const game = new MemoryGame(renderGame);

function closePicker() {
  options.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
}
function showOptions() {
  options.replaceChildren();
  options.hidden = false; input.setAttribute('aria-expanded', 'true');
  filtered.forEach((item, index) => {
    const option = document.createElement('li');
    option.id = `city-${item.id}`; option.role = 'option';
    const name = document.createElement('span'); name.textContent = item.label;
    const detail = document.createElement('small'); detail.textContent = availabilityLabel(availability[item.id]);
    option.append(name, detail);
    option.setAttribute('aria-selected', String(index === active));
    option.addEventListener('mousedown', event => event.preventDefault());
    option.addEventListener('click', () => selectCity(item));
    options.append(option);
  });
  if (!filtered.length) {
    const empty = document.createElement('li'); empty.textContent = 'No cities found'; empty.role = 'presentation'; options.append(empty);
  }
  if (active >= 0 && filtered[active]) {
    input.setAttribute('aria-activedescendant', `city-${filtered[active].id}`);
    options.children[active].scrollIntoView({ block: 'nearest' });
  } else input.removeAttribute('aria-activedescendant');
}
function selectCity(item) {
  pendingCity = item; input.value = item.label; closePicker();
  $('cityHelp').textContent = `${item.label}: ${availabilityLabel(availability[item.id])}. Last checked ${COVERAGE_DATE}. Start game checks again.`;
}
input.addEventListener('focus', () => { filtered = pendingCity ? cityChoices() : filterCities(input.value, cityChoices()); active = -1; showOptions(); });
input.addEventListener('input', () => { pendingCity = null; filtered = filterCities(input.value, cityChoices()); active = -1; showOptions(); });
input.addEventListener('blur', closePicker);
input.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closePicker(); return; }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (filtered.length) active = (active + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length;
    showOptions();
  } else if (event.key === 'Enter' && !options.hidden && active >= 0) {
    event.preventDefault(); selectCity(filtered[active]);
  }
});
$('cityForm').addEventListener('submit', event => {
  event.preventDefault();
  const query = normalize(input.value);
  const selected = pendingCity || cityChoices().find(item => [item.label, item.name, ...item.aliases].some(label => normalize(label) === query));
  if (!selected) {
    $('cityHelp').textContent = 'Choose one of the listed cities before starting.';
    input.focus(); return;
  }
  selectCity(selected); startCity(selected);
});

function renderGame(message) {
  $('moves').textContent = game.moves;
  $('pairs').textContent = game.matched.size;
  buttons.forEach((button, index) => {
    const card = game.deck[index];
    if (!card) return;
    const matched = game.matched.has(card.map.id), revealed = matched || game.open.includes(index);
    const slot = button.parentElement;
    slot.dataset.revealed = String(revealed);
    const tooltip = slot.querySelector('.card-title');
    tooltip.textContent = revealed ? card.map.title : '';
    const explore = slot.querySelector('.explore-map');
    explore.hidden = !revealed;
    if (revealed) explore.setAttribute('aria-label', `Explore map: ${card.map.title}`);
    else explore.removeAttribute('aria-label');
    button.classList.toggle('revealed', revealed); button.classList.toggle('matched', matched);
    button.setAttribute('aria-label', revealed ? `Card ${index + 1}: ${card.map.title}${matched ? ', matched' : ''}` : `Card ${index + 1} of ${game.deck.length}, face down`);
    // Keep focus on the activated button, including when it becomes a match.
    button.setAttribute('aria-disabled', String(matched || revealed || game.open.length === 2));
  });
  $('announcement').textContent = message;
  $('completion').hidden = !game.complete;
  celebration.update(game.complete);
  $('collection').hidden = !game.complete;
  if (game.complete) $('status').textContent = `Live BTAA maps · ${maps.length} pairs found · Collection complete.`;
  if (game.complete) $('completionText').textContent = `You found ${maps.length} pairs in ${game.moves} moves. Explore your maps below, or play again.`;
}
function deal(nextMaps) {
  maps = nextMaps; buttons = []; game.reset(maps);
  const fragment = document.createDocumentFragment();
  game.deck.forEach((card, index) => {
    const slot = document.createElement('div'); slot.className = 'card-slot';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'card';
    const image = document.createElement('img'); image.src = card.map.imageUrl; image.alt = ''; image.draggable = false; image.setAttribute('aria-hidden', 'true');
    const back = document.createElement('span'); back.className = 'card-back'; back.setAttribute('aria-hidden', 'true');
    const compass = document.createElement('span'); compass.className = 'compass'; compass.textContent = '✧';
    const number = document.createElement('span'); number.className = 'card-number'; number.textContent = String(index + 1).padStart(2, '0');
    const basemap = document.createElement('span'); basemap.className = 'city-basemap';
    back.append(basemap, compass, number); button.append(image, back);
    button.addEventListener('click', () => game.flip(index));
    const explore = document.createElement('button'); explore.type = 'button'; explore.className = 'explore-map'; explore.textContent = '⤢'; explore.hidden = true;
    explore.addEventListener('click', () => openMap(card.map, button));
    const tooltip = document.createElement('span'); tooltip.className = 'card-title'; tooltip.role = 'tooltip';
    tooltip.id = `card-title-${index}`;
    explore.setAttribute('aria-describedby', tooltip.id);
    slot.addEventListener('keydown', event => {
      if (event.key === 'Escape') slot.classList.add('title-dismissed');
    });
    slot.addEventListener('pointerleave', () => slot.classList.remove('title-dismissed'));
    slot.addEventListener('focusout', event => {
      if (!slot.contains(event.relatedTarget)) slot.classList.remove('title-dismissed');
    });
    slot.append(button, explore, tooltip); fragment.append(slot); buttons.push(button);
  });
  board.replaceChildren(fragment); board.setAttribute('aria-busy', 'false');
  $('pairTotal').textContent = ` / ${maps.length}`;
  $('playAgain').disabled = false;
  $('newMaps').disabled = result.pool.length <= maps.length;
  $('newMaps').title = result.pool.length <= maps.length ? 'All usable maps are already in this game.' : 'Deal a different selection from this city’s loaded maps.';
  $('status').textContent = maps.length < 8
    ? `A smaller discovery: ${maps.length} distinct maps with usable thumbnails were available. Match ${maps.length} pairs, or try another city.`
    : `Live BTAA maps · ${maps.length} pairs · Flip a card to begin.`;
  if (result.warning) $('status').textContent += ` ${result.warning}`;
  renderCollection(); renderGame('New game ready. Choose a card.');
}
function renderCollection() {
  $('mapList').replaceChildren();
  maps.forEach(map => {
    const li = document.createElement('li'), image = document.createElement('img'), detail = document.createElement('div');
    const preview = document.createElement('button'); preview.type = 'button'; preview.className = 'collection-preview';
    preview.setAttribute('aria-label', `Explore map: ${map.title}`);
    preview.addEventListener('click', () => openMap(map, preview));
    image.src = map.imageUrl; image.alt = '';
    const hint = document.createElement('span'); hint.className = 'collection-zoom'; hint.textContent = '⤢ Explore full map';
    preview.append(image, hint);
    const link = document.createElement('a'); link.href = map.recordUrl; link.textContent = map.title;
    const meta = document.createElement('small'); meta.textContent = [map.date || 'Date not supplied', map.institution || 'Institution not supplied'].join(' · ');
    detail.className = 'collection-detail';
    detail.append(link, meta); li.append(preview, detail); $('mapList').append(li);
  });
}
function startCity(selected) {
  if ($('mapDialog').open) $('mapDialog').close();
  city = selected; loading = true; buttons = []; game.reset(); board.replaceChildren();
  result?.dispose(); result = null; maps = []; $('mapList').replaceChildren();
  board.style.removeProperty('--city-basemap'); $('basemapCredit').hidden = true;
  basemapRequests.run(signal => renderCityBasemap(selected, signal), url => {
    if (url) { board.style.setProperty('--city-basemap', `url("${url}")`); $('basemapCredit').hidden = false; }
  }, () => { /* The original pattern remains if WebGL or tiles are unavailable. */ });
  $('boardTitle').textContent = city.label; $('pairTotal').textContent = ' / —';
  $('playAgain').disabled = $('newMaps').disabled = true; $('retry').hidden = true; $('unavailable').hidden = true;
  board.setAttribute('aria-busy', 'true'); $('status').textContent = `Finding and checking maps of ${city.name}…`;
  requests.run(signal => loadCity(selected, signal), loaded => {
    result = loaded; loading = false;
    if (!loaded.diagnostics.failed && !loaded.warning) {
      availability[selected.id] = loaded.pool.length;
      $('cityCount').textContent = `${cityChoices().length} cities`;
      if (!options.hidden) {
        filtered = pendingCity ? cityChoices() : filterCities(input.value, cityChoices());
        active = -1; showOptions();
      }
    }
    if (loaded.pool.length < 4) {
      board.setAttribute('aria-busy', 'false'); $('retry').hidden = false;
      const { candidates, failed, timedOut } = loaded.diagnostics;
      $('status').textContent = failed
        ? `Only ${loaded.pool.length} maps could be checked for ${selected.label}; ${failed} image request${failed === 1 ? '' : 's'} failed${timedOut ? ' or timed out' : ''}. Retry to check availability again.`
        : candidates === 0 ? `No suitable city-map records were found for ${selected.label}.`
        : `Found ${loaded.pool.length} distinct map${loaded.pool.length === 1 ? '' : 's'} with usable images for ${selected.label}. A game needs at least four.`;
      $('unavailableTitle').textContent = failed ? 'Some map images could not be checked' : 'Not enough maps for a game yet';
      $('unavailableReason').textContent = 'Library collections vary. Covers, index masks, duplicate images, and unrelated places do not count as playable maps. You can retry this city or choose another below.';
      $('suggestions').replaceChildren();
      for (const alternative of suggestedCities(selected, CITIES, availability)) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = `Play ${alternative.label}`;
        button.addEventListener('click', () => { selectCity(alternative); startCity(alternative); });
        $('suggestions').append(button);
      }
      $('unavailable').hidden = false;
      return;
    }
    deal(chooseMaps(loaded.pool));
  }, error => {
    loading = false; board.setAttribute('aria-busy', 'false'); $('retry').hidden = false;
    $('status').textContent = error.name === 'TimeoutError' ? 'The map service took too long. Retry, or choose another city.' : `Could not load maps. ${error.message}`;
  });
}
function openMap(map, opener) {
  dialogOpener = opener;
  game.pause();
  $('mapDialogTitle').textContent = map.title;
  $('mapDescription').textContent = map.description || '';
  $('mapMetadata').replaceChildren();
  for (const [label, value] of [['Preview', map.previewNote], ['Date', map.date], ['Institution', map.institution], ['Creator', map.creator], ['Place', map.spatial], ['Rights', map.rights]]) {
    if (!value) continue;
    const term = document.createElement('dt'), detail = document.createElement('dd');
    term.textContent = label; detail.textContent = value; $('mapMetadata').append(term, detail);
  }
  $('mapRecordLink').href = $('viewerRecordLink').href = map.recordUrl;
  $('mapViewer').title = `Full map viewer: ${map.title}`;
  $('mapViewer').src = map.viewerUrl;
  $('mapDialog').showModal();
}
$('closeMap').addEventListener('click', () => $('mapDialog').close());
$('mapDialog').addEventListener('close', () => {
  $('mapViewer').removeAttribute('src');
  game.resume();
  if (dialogOpener?.isConnected) dialogOpener.focus();
});
$('retry').addEventListener('click', () => startCity(city));
$('playAgain').addEventListener('click', () => { if (!loading && maps.length) deal(maps); });
$('newMaps').addEventListener('click', () => { if (!loading && result?.pool.length > maps.length) deal(chooseMaps(result.pool, maps)); });
startCity(city);
