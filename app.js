const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const state = {
  tab: 'flights',
  adults: 1,
  children: 0,
  infant: 0,
  hotelAdult: 2,
  hotelChild: 0,
  bannerIndex: 0,
  cardIndexes: { hotels: 0, transit: 0, destinations: 0 },
  autoBanner: null,
  features: { flights: true, hotels: true, homes: true, visa: true, tours: true, esim: true }
};

const icon = (id) => `<svg><use href="#${id}"></use></svg>`;
const escapeHtml = (value) => String(value).replace(/[&<>\"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[character]));
const appConfig = window.APP_CONFIG || { apiBase: document.body?.dataset.apiBase || '', liveApi: document.body?.dataset.liveApi === 'true' };
const API_BASE = appConfig.apiBase || '';

const apiRequest = (path, options = {}, canRefresh = true) => window.SadikApi.request(path, options, canRefresh);

async function applySiteSettings() {
  try {
    const response = await apiRequest('/site/settings');
    const features = { ...state.features, ...(response.features || {}) };
    state.features = features;
    if (response.logoUrl) document.querySelectorAll('[data-brand-logo]').forEach(image => { image.src = response.logoUrl; });
    if (response.brand) document.title = `${response.brand} | Online Travel Agency`;
    const supportPhone = response.support?.phone;
    const supportEmail = response.support?.email;
    if (supportPhone) document.querySelectorAll('[data-support-phone]').forEach(node => { node.textContent = supportPhone; node.href = `tel:${supportPhone.replace(/[^+\d]/g, '')}`; });
    if (supportEmail) document.querySelectorAll('[data-support-email]').forEach(node => { node.textContent = supportEmail; node.href = `mailto:${supportEmail}`; });
    const featureTargets = ['flights', 'hotels', 'homes', 'visa', 'tours', 'esim'];
    featureTargets.forEach(name => {
      const enabled = features[name] !== false;
      document.querySelectorAll(`.travel-tab[data-target="${name}"], [data-nav-tab="${name}"], #${name}`).forEach(element => {
        if (element.classList.contains('tab-pane')) element.hidden = !enabled;
        else element.style.display = enabled ? '' : 'none';
      });
    });
    const activePane = document.querySelector('.tab-pane.active');
    if (activePane && features[activePane.id] === false) {
      const next = featureTargets.find(name => features[name] !== false && document.getElementById(name));
      if (next) activateTab(next);
    }
  } catch { /* Feature flags fail open for the public shell. */ }
}

async function applyPublicContent() {
  try {
    const response = await apiRequest('/site/content');
    const items = response.content || [];
    const banners = items.filter(item => item.type === 'banner' && item.imageUrl);
    if (banners.length) {
      const track = $('#bannerTrack');
      track.innerHTML = banners.map(item => `<a class="banner-slide" href="#offers"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" /><span class="banner-copy"><small>Sadik Travels</small><strong>${escapeHtml(item.title)}</strong><em>${escapeHtml(item.subtitle || '')}</em></span></a>`).join('');
      state.bannerIndex = 0;
      bindPromotionalInteractions(track);
      updateBannerSlider();
    }
    const destinations = items.filter(item => item.type === 'destination' && item.imageUrl);
    if (destinations.length) {
      const track = $('#destinationTrack');
      track.innerHTML = destinations.map(item => `<a class="destination-card" href="#destination" data-destination="${escapeHtml(item.title)}"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" /><strong>${escapeHtml(item.title)}</strong></a>`).join('');
      bindPromotionalInteractions(track);
      updateCardSlider('destinations');
    }
    const hotels = items.filter(item => item.type === 'hotel' && item.imageUrl);
    if (hotels.length) {
      const track = $('#hotelTrack');
      track.innerHTML = hotels.map(item => `<a class="travel-card" href="#hotel-details" data-card-title="${escapeHtml(item.title)}"><div class="card-image"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" /></div><div class="card-caption">${escapeHtml(item.title)}</div></a>`).join('');
      bindPromotionalInteractions(track);
      updateCardSlider('hotels');
    }
  } catch { /* Empty content keeps the curated brand shell available. */ }
}

function showToast(message, type = '') {
  const region = $('#toastRegion');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  region.appendChild(toast);
  setTimeout(() => toast.remove(), 3600);
}

function closeDropdowns(except = '') {
  $$('.mini-menu.open,.passenger-menu.open').forEach(menu => {
    if (menu.id !== except) menu.classList.remove('open');
  });
}

function toggleDropdown(id) {
  const menu = document.getElementById(id);
  if (!menu) return;
  const isOpen = menu.classList.contains('open');
  closeDropdowns(id);
  menu.classList.toggle('open', !isOpen);
}

$$('[data-dropdown]').forEach(button => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleDropdown(button.dataset.dropdown);
  });
});

$$('.mini-menu button[data-value]').forEach(button => {
  button.addEventListener('click', () => {
    const menu = button.closest('.mini-menu');
    const target = menu.previousElementSibling?.querySelector('span');
    if (target) target.textContent = button.dataset.value;
    menu.classList.remove('open');
  });
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.compact-select-wrap')) closeDropdowns();
});

function updatePassengerSummary() {
  const total = state.adults + state.children + state.infant;
  $('#adultCount').textContent = state.adults;
  $('#childCount').textContent = state.children;
  $('#infantCount').textContent = state.infant;
  $('#passengerValue').textContent = total;
  $('#hotelAdultCount').textContent = state.hotelAdult;
  $('#hotelChildCount').textContent = state.hotelChild;
  $('#guestValue').textContent = `Guests - ${state.hotelAdult + state.hotelChild}`;
}

$$('[data-step]').forEach(button => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const key = button.dataset.step;
    const direction = Number(button.dataset.dir);
    const limits = { adult: [1, 9], child: [0, 4], infant: [0, 1], hotelAdult: [1, 9], hotelChild: [0, 4] };
    const stateKey = key === 'adult' ? 'adults' : key === 'child' ? 'children' : key === 'infant' ? 'infant' : key;
    const [min, max] = limits[key];
    state[stateKey] = Math.max(min, Math.min(max, state[stateKey] + direction));
    updatePassengerSummary();
  });
});

$$('[data-close-dropdown]').forEach(button => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    document.getElementById(button.dataset.closeDropdown)?.classList.remove('open');
  });
});

function activateTab(tabName, shouldScroll = false) {
  if (state.features[tabName] === false) { showToast(`${tabName[0].toUpperCase()}${tabName.slice(1)} is currently unavailable.`, 'error'); return; }
  const tab = document.querySelector(`.travel-tab[data-target="${tabName}"]`);
  const pane = document.getElementById(tabName);
  if (!tab || !pane) return;
  state.tab = tabName;
  $$('.travel-tab').forEach(item => {
    const active = item === tab;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  $$('.tab-pane').forEach(item => {
    const active = item === pane;
    item.classList.toggle('active', active);
    item.hidden = !active;
  });
  $$('.nav-links a[data-nav-tab]').forEach(item => item.classList.toggle('active', item.dataset.navTab === tabName));
  $$('.mobile-nav-item[data-nav-tab]').forEach(item => item.classList.toggle('active', item.dataset.navTab === tabName));
  if (shouldScroll) $('#searchPanel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$$('.travel-tab').forEach(tab => tab.addEventListener('click', () => activateTab(tab.dataset.target)));
$$('[data-nav-tab]').forEach(link => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    activateTab(link.dataset.navTab, true);
    if (window.innerWidth < 1024) closeSidebar();
  });
});

const syncTripType = () => {
  const value = $('input[name="tripType"]:checked')?.value;
  const returnField = $('.return-field');
  const multiRow = $('#multiCityRow');
  const returnInput = $('#returnDate');
  const isMulti = value === 'multicity';
  const isOneWay = value === 'oneway';
  if (returnField) returnField.style.display = isOneWay || isMulti ? 'none' : '';
  if (returnInput) returnInput.disabled = isOneWay || isMulti;
  if (multiRow) multiRow.hidden = !isMulti;
};
$$('input[name="tripType"]').forEach(input => input.addEventListener('change', syncTripType));
syncTripType();

$$('input[name="esimScope"]').forEach(input => input.addEventListener('change', () => {
  const label = $('#esimLocationLabel');
  const field = $('#esimDestination');
  if (input.checked && input.value === 'global') {
    label.textContent = 'Destination Region';
    field.placeholder = 'Search region...';
    field.value = '';
  } else if (input.checked) {
    label.textContent = 'Destination Country';
    field.placeholder = 'Search country...';
    field.value = 'Singapore';
  }
}));

const globalSearchCities = [
  { label: 'Dhaka', detail: 'Bangladesh' }, { label: "Cox's Bazar", detail: 'Bangladesh' }, { label: 'Chattogram', detail: 'Bangladesh' }, { label: 'Dubai', detail: 'United Arab Emirates' }, { label: 'Singapore', detail: 'Singapore' }, { label: 'Bangkok', detail: 'Thailand' }, { label: 'Kuala Lumpur', detail: 'Malaysia' }, { label: 'Male', detail: 'Maldives' }
];
function renderGlobalSuggestions(query = '') { const input = $('#globalSearchInput'); const menu = $('#globalSearchSuggestions'); if (!input || !menu) return; const q = query.toLowerCase().trim(); const matches = globalSearchCities.filter(city => `${city.label} ${city.detail}`.toLowerCase().includes(q)).slice(0, 6); menu.innerHTML = matches.map(city => `<button type="button" data-global-city="${escapeHtml(city.label)}"><strong>${escapeHtml(city.label)}</strong><small>${escapeHtml(city.detail)}</small></button>`).join(''); menu.classList.toggle('open', matches.length > 0); $$('[data-global-city]', menu).forEach(button => button.addEventListener('click', () => { input.value = button.dataset.globalCity; menu.classList.remove('open'); activateTab('flights', true); if ($('#toAirport')) $('#toAirport').value = button.dataset.globalCity; })); }
$('#globalSearchInput')?.addEventListener('focus', () => renderGlobalSuggestions($('#globalSearchInput').value));
$('#globalSearchInput')?.addEventListener('input', event => renderGlobalSuggestions(event.target.value));
$('#globalSearch')?.addEventListener('submit', event => { event.preventDefault(); const value = $('#globalSearchInput').value.trim(); if (!value) return; activateTab('flights', true); if ($('#toAirport')) $('#toAirport').value = value; $('#globalSearchSuggestions')?.classList.remove('open'); });
$('#appBtn')?.addEventListener('click', () => $('#appTitle')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
$$('[data-app-download]').forEach(button => button.addEventListener('click', () => showToast(`${button.dataset.appDownload} download link is not configured for this deployment yet.`, 'error')));
document.addEventListener('click', event => { if (!event.target.closest('.global-search')) $('#globalSearchSuggestions')?.classList.remove('open'); });

$('#swapAirports')?.addEventListener('click', () => {
  const from = $('#fromAirport');
  const to = $('#toAirport');
  [from.value, to.value] = [to.value, from.value];
  showToast('Journey From and Journey To swapped.');
});

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function isoDateFromToday(offsetDays) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}
function setDefaultDates() {
  const tomorrow = isoDateFromToday(1);
  const weekLater = isoDateFromToday(8);
  [['departureDate', tomorrow], ['returnDate', weekLater], ['checkinDate', tomorrow], ['checkoutDate', isoDateFromToday(2)], ['homeCheckin', tomorrow], ['homeCheckout', isoDateFromToday(2)]].forEach(([id, value]) => { const input = $(`#${id}`); if (input && !input.value) input.value = value; if (input) input.min = tomorrow; });
}
function syncDateLabels() {
  const pairs = [
    ['departureDate', document.querySelector('#departureDate')?.closest('.form-field')?.querySelector('small')],
    ['returnDate', document.querySelector('#returnDate')?.closest('.form-field')?.querySelector('small')],
    ['checkinDate', document.querySelector('#checkinDate')?.closest('.form-field')?.querySelector('small')],
  ];
  pairs.forEach(([id, label]) => { if (label) label.textContent = formatDate($(`#${id}`)?.value); });
  const checkout = $('#checkoutDate');
  const nightLabel = checkout?.closest('.form-field')?.querySelector('small');
  if (checkout && nightLabel) {
    const checkin = $('#checkinDate')?.value;
    const days = checkin && checkout.value ? Math.max(1, Math.round((new Date(`${checkout.value}T00:00:00`) - new Date(`${checkin}T00:00:00`)) / 86400000)) : 1;
    nightLabel.textContent = `${days} night${days === 1 ? '' : 's'}`;
  }
}
setDefaultDates();
$$('input[type="date"]').forEach(input => input.addEventListener('change', syncDateLabels));
syncDateLabels();

const suggestionData = {
  airport: [
    { code: 'DAC', city: 'Dhaka', name: 'Hazrat Shahjalal International Airport' },
    { code: 'CXB', city: "Cox's Bazar", name: 'Cox’s Bazar Airport' },
    { code: 'CGP', city: 'Chattogram', name: 'Shah Amanat International Airport' },
    { code: 'DXB', city: 'Dubai', name: 'Dubai International Airport' },
    { code: 'DOH', city: 'Doha', name: 'Hamad International Airport' },
    { code: 'SIN', city: 'Singapore', name: 'Singapore Changi Airport' },
    { code: 'BKK', city: 'Bangkok', name: 'Suvarnabhumi Airport' },
    { code: 'KUL', city: 'Kuala Lumpur', name: 'Kuala Lumpur International Airport' },
    { code: 'DEL', city: 'Delhi', name: 'Indira Gandhi International Airport' },
    { code: 'JED', city: 'Jeddah', name: 'King Abdulaziz International Airport' }
  ],
  city: [
    { code: 'CXB', city: "Cox's Bazar", name: 'Bangladesh' },
    { code: 'DAC', city: 'Dhaka', name: 'Bangladesh' },
    { code: 'CTG', city: 'Chattogram', name: 'Bangladesh' },
    { code: 'DXB', city: 'Dubai', name: 'United Arab Emirates' },
    { code: 'BKK', city: 'Bangkok', name: 'Thailand' },
    { code: 'SIN', city: 'Singapore', name: 'Singapore' },
    { code: 'KUL', city: 'Kuala Lumpur', name: 'Malaysia' },
    { code: 'MLE', city: 'Male', name: 'Maldives' }
  ],
  country: [
    { code: 'BD', city: 'Bangladesh', name: 'South Asia' },
    { code: 'AE', city: 'United Arab Emirates', name: 'Middle East' },
    { code: 'SA', city: 'Saudi Arabia', name: 'Middle East' },
    { code: 'TH', city: 'Thailand', name: 'South East Asia' },
    { code: 'MY', city: 'Malaysia', name: 'South East Asia' },
    { code: 'SG', city: 'Singapore', name: 'South East Asia' },
    { code: 'MV', city: 'Maldives', name: 'South Asia' },
    { code: 'GB', city: 'United Kingdom', name: 'Europe' },
    { code: 'US', city: 'United States', name: 'North America' }
  ],
  category: [
    { code: 'VIS', city: 'Tourist Visa', name: 'Short stay and holiday travel' },
    { code: 'BUS', city: 'Business Visa', name: 'Business and professional travel' },
    { code: 'STU', city: 'Student Visa', name: 'Study abroad applications' },
    { code: 'FAM', city: 'Family Visa', name: 'Family visit and reunion' }
  ]
};

function renderSuggestions(input, suggestions, type) {
  const field = input.closest('.autocomplete-field');
  const menu = field?.querySelector('.suggestions');
  if (!menu) return;
  const query = input.value.trim().toLowerCase();
  const matches = suggestionData[type].filter(item => `${item.city} ${item.name} ${item.code}`.toLowerCase().includes(query)).slice(0, 6);
  menu.innerHTML = matches.length ? matches.map(item => `<button type="button" class="suggestion" data-value="${item.city} (${item.code})"><span class="suggestion-code">${item.code}</span><span class="suggestion-copy"><strong>${item.city}</strong><small>${item.name}</small></span></button>`).join('') : '<div class="suggestion"><span class="suggestion-copy"><strong>No matches found</strong><small>Try another search</small></span></div>';
  menu.classList.add('open');
  $$('.suggestion[data-value]', menu).forEach(button => button.addEventListener('click', () => {
    input.value = button.dataset.value;
    menu.classList.remove('open');
    input.dispatchEvent(new Event('change'));
  }));
}

$$('.autocomplete-field').forEach(field => {
  const input = $('input', field);
  const type = field.dataset.autocomplete || 'city';
  input.addEventListener('focus', () => renderSuggestions(input, suggestionData[type], type));
  input.addEventListener('input', () => renderSuggestions(input, suggestionData[type], type));
});

document.addEventListener('click', event => {
  if (!event.target.closest('.autocomplete-field')) $$('.suggestions.open').forEach(menu => menu.classList.remove('open'));
});

function buildSearchSummary(type) {
  if (type === 'flight') {
    const trip = $('input[name="tripType"]:checked')?.nextElementSibling?.textContent || 'One Way';
    const passengers = `${state.adults} adult${state.adults === 1 ? '' : 's'}${state.children ? `, ${state.children} child${state.children === 1 ? '' : 'ren'}` : ''}`;
    return `<strong>Flights · ${trip}</strong><br>${$('#fromAirport').value || 'Dhaka (DAC)'} → ${$('#toAirport').value || 'Dubai (DXB)'}<br><span>${formatDate($('#departureDate').value)} · ${passengers} · ${$('#cabinValue').textContent}</span>`;
  }
  if (type === 'hotel') return `<strong>Hotels</strong><br>${$('#hotelDestination').value || "Cox's Bazar"}<br><span>${formatDate($('#checkinDate').value)} to ${formatDate($('#checkoutDate').value)} · ${$('#guestValue').textContent}</span>`;
  if (type === 'homes') return `<strong>Sadik Homes · ${$('input[name="homesType"]:checked')?.value === 'buy' ? 'Buy' : 'Rent'}</strong><br>${$('#homeDestination').value || 'Dhaka'}<br><span>${formatDate($('#homeCheckin').value)} to ${formatDate($('#homeCheckout').value)}</span>`;
  if (type === 'visa') return `<strong>Visa services</strong><br>${$('#visaCountry').value || 'United Arab Emirates'} · ${$('#visaCategory').value || 'Tourist Visa'}`;
  return `<strong>eSIM</strong><br>${$('#esimDestination').value || 'Singapore'}<br><span>Instant travel connectivity with Sadik Travels</span>`;
}

let modalReturnFocus = null;
function openModal(modal) {
  if (!modal) return;
  modalReturnFocus = document.activeElement;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => (modal.querySelector('input,button,select,textarea,[tabindex]:not([tabindex="-1"])') || modal.querySelector('.modal-close'))?.focus());
}
function closeModal(modal) {
  if (!modal) return;
  modal.hidden = true;
  if (![...document.querySelectorAll('.modal')].some(item => !item.hidden)) {
    document.body.style.overflow = '';
    if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
    modalReturnFocus = null;
  }
}
function openTemplateModal(templateId, summary = '') {
  const modal = $('#genericModal');
  const template = document.getElementById(templateId);
  if (!template) return;
  $('#modalContent').innerHTML = template.innerHTML;
  const summaryNode = $('#resultSummary');
  if (summary && summaryNode) summaryNode.innerHTML = summary;
  openModal(modal);
  bindDynamicModalEvents();
}

function bindDynamicModalEvents() {
  $('#trackForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter || $('#trackForm button[type="submit"]');
    const reference = $('#trackReference')?.value.trim();
    const identity = $('#trackIdentity')?.value.trim();
    if (!reference || !identity) { showToast('Enter both the booking reference and the contact used for the booking.', 'error'); return; }
    button.disabled = true;
    try {
      const response = await apiRequest('/bookings/track', { method: 'POST', body: JSON.stringify({ bookingReference: reference, identity }) });
      const booking = response.booking;
      $('#modalContent').innerHTML = `<div class="modal-heading"><div class="modal-icon blue">${icon('i-search')}</div><h2 id="modalTitle">Booking status</h2></div><p class="modal-subtitle">Reference <strong>${escapeHtml(booking.id)}</strong></p><div class="result-summary"><strong>${escapeHtml(booking.vertical)} · ${escapeHtml(booking.status)}</strong><br><span>Created ${escapeHtml(new Date(booking.createdAt).toLocaleString())}</span>${booking.providerRef ? `<br><span>Provider reference: ${escapeHtml(booking.providerRef)}</span>` : ''}</div><button type="button" class="btn btn-primary full-btn" data-close-modal>Done</button>`;
    } catch (error) { showToast(error.message || 'Unable to find that booking.', 'error'); } finally { button.disabled = false; }
  });
  $('#chatForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = $('#chatForm');
    const button = event.submitter || form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    try {
      const response = await apiRequest('/support/tickets', { method: 'POST', body: JSON.stringify(data) });
      $('#modalContent').innerHTML = `<div class="modal-heading"><div class="modal-icon green">${icon('i-check')}</div><h2 id="modalTitle">Support request received</h2></div><p class="modal-subtitle">Our support team will review your request.</p><div class="result-summary"><strong>Ticket ${escapeHtml(response.ticket.id)}</strong><br><span>Status: ${escapeHtml(response.ticket.status)}</span></div><button type="button" class="btn btn-primary full-btn" data-close-modal>Close</button>`;
    } catch (error) { showToast(error.message || 'Unable to create a support request.', 'error'); } finally { button.disabled = false; }
  });
}

function searchPayload(type) {
  if (type === 'flight') { const tripType = $('input[name="tripType"]:checked')?.value || 'oneway'; return { tripType, cabin: $('#cabinValue')?.textContent, adults: state.adults, children: state.children, infants: state.infant, from: $('#fromAirport')?.value, to: $('#toAirport')?.value, depart: $('#departureDate')?.value, return: tripType === 'roundtrip' ? ($('#returnDate')?.value || null) : null, direct: $('#directFlight')?.checked || false }; }
  if (type === 'hotel') return { destination: $('#hotelDestination')?.value, checkIn: $('#checkinDate')?.value, checkOut: $('#checkoutDate')?.value, adults: state.hotelAdult, children: state.hotelChild, rooms: $('#roomValue')?.textContent };
  if (type === 'homes') return { mode: $('input[name="homesType"]:checked')?.value || 'rent', location: $('#homeDestination')?.value, checkIn: $('#homeCheckin')?.value, checkOut: $('#homeCheckout')?.value };
  if (type === 'visa') return { country: $('#visaCountry')?.value, category: $('#visaCategory')?.value };
  if (type === 'tour') return { destination: $('#tourDestination')?.value, tourType: $('#tourType')?.value, maxPrice: $('#tourBudget')?.value ? Number($('#tourBudget').value) : undefined, sort: $('#tourSort')?.value || 'newest' };
  return { scope: $('input[name="esimScope"]:checked')?.value || 'local', destination: $('#esimDestination')?.value };
}

function tourQueryFromForm() {
  return { destination: $('#tourDestination')?.value.trim() || '', tourType: $('#tourType')?.value || '', maxPrice: $('#tourBudget')?.value || '', sort: $('#tourSort')?.value || 'newest' };
}
function tourQueryFromFilters() {
  return { destination: $('#tourFilterDestination')?.value.trim() || '', tourType: $('#tourFilterType')?.value || '', maxPrice: $('#tourFilterBudget')?.value || '', sort: $('#tourResultsSort')?.value || 'newest' };
}
function tourQueryString(query) {
  const params = new URLSearchParams({ type: 'tour' });
  if (query.destination) params.set('destination', query.destination);
  if (query.tourType) params.set('tour_type', query.tourType);
  if (query.maxPrice) params.set('max_price', query.maxPrice);
  if (query.sort && query.sort !== 'newest') params.set('sort', query.sort);
  return params.toString();
}
function tourImage(tour) {
  return tour.imageUrl || 'assets/images__maldives.jpg';
}
function renderTourResults(tours, query) {
  const grid = $('#tourResultsGrid');
  const empty = $('#tourEmpty');
  const count = $('#tourResultsCount');
  if (!grid || !empty || !count) return;
  count.textContent = `${tours.length} tour${tours.length === 1 ? '' : 's'} found`;
  empty.hidden = tours.length > 0;
  grid.innerHTML = tours.map(tour => `<article class="tour-package-card" data-tour-id="${escapeHtml(tour.id)}"><div class="tour-package-image"><img src="${escapeHtml(tourImage(tour))}" alt="${escapeHtml(tour.title)}" loading="lazy" /><span class="tour-duration">${escapeHtml(tour.durationDays)} Days ${escapeHtml(tour.durationNights)} Nights</span><span class="tour-country"><svg><use href="#i-location"></use></svg>${escapeHtml(tour.country)}</span></div><div class="tour-package-content"><div class="tour-package-top"><h3>${escapeHtml(tour.title)}</h3><div class="tour-destination-list">${tour.destinations.map(destination => `<span>${escapeHtml(destination)}</span>`).join('')}</div></div><div class="tour-package-bottom"><div class="tour-price"><small>Starting from:</small><strong>৳${Number(tour.priceBdt).toLocaleString('en-BD')}</strong><span>per person</span></div><button type="button" class="tour-view-details" data-tour-details="${escapeHtml(tour.id)}">View Details <span>→</span></button></div></div></article>`).join('');
  $$('.tour-view-details', grid).forEach(button => button.addEventListener('click', () => { const tour = tours.find(item => item.id === button.dataset.tourDetails); if (tour) openTourDetails(tour); }));
  $$('.tour-package-card', grid).forEach(card => card.addEventListener('click', event => { if (event.target.closest('button')) return; const tour = tours.find(item => item.id === card.dataset.tourId); if (tour) openTourDetails(tour); }));
}
function openTourResultsSection() {
  const section = $('#tourResultsSection');
  if (!section) return;
  section.hidden = false;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function searchTours(query, updateUrl = true) {
  try {
    const url = new URL(`${API_BASE}/tours`, window.location.origin);
    if (query.destination) url.searchParams.set('destination', query.destination);
    if (query.tourType) url.searchParams.set('tour_type', query.tourType);
    if (query.maxPrice) url.searchParams.set('max_price', query.maxPrice);
    if (query.sort) url.searchParams.set('sort', query.sort);
    const response = await apiRequest(`${url.pathname}${url.search}`, { method: 'GET' });
    const tours = response.tours || [];
    $('#tourFilterDestination').value = query.destination || '';
    $('#tourFilterType').value = query.tourType || '';
    $('#tourFilterBudget').value = query.maxPrice || '';
    $('#tourResultsSort').value = query.sort || 'newest';
    renderTourResults(tours, query);
    openTourResultsSection();
    if (updateUrl) history.pushState({}, '', `/search?${tourQueryString(query)}`);
  } catch (error) { showToast(error.message || 'Tour search is unavailable.', 'error'); }
}
function openTourDetails(tour) {
  const modal = $('#genericModal');
  $('#modalContent').innerHTML = `<div class="tour-detail-modal"><img class="tour-detail-image" src="${escapeHtml(tourImage(tour))}" alt="${escapeHtml(tour.title)}" /><div class="modal-heading"><div class="modal-icon blue">${icon('i-map')}</div><h2 id="modalTitle">${escapeHtml(tour.title)}</h2></div><p class="modal-subtitle">${escapeHtml(tour.durationDays)} days / ${escapeHtml(tour.durationNights)} nights · ${escapeHtml(tour.country)}</p><p class="tour-detail-description">${escapeHtml(tour.description || 'A carefully planned journey with Sadik Travels support.')}</p><div class="result-summary"><strong>Starting from ৳${Number(tour.priceBdt).toLocaleString('en-BD')} per person</strong><br><span>${tour.destinations.map(escapeHtml).join(' · ')}</span></div><form id="tourBookForm"><label class="modal-field"><span>Travellers</span><input id="tourTravellers" type="number" min="1" max="30" value="2" required /></label><label class="modal-field"><span>Preferred travel date</span><input id="tourTravelDate" type="date" required /></label><button class="btn btn-primary full-btn" type="submit">Book this tour</button></form></div>`;
  openModal(modal);
  $('#tourBookForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const response = await apiRequest('/bookings', { method: 'POST', body: JSON.stringify({ vertical: 'tour', payload: { tourId: tour.id, slug: tour.slug, title: tour.title, travellers: Number($('#tourTravellers').value), travelDate: $('#tourTravelDate').value, priceBdt: tour.priceBdt } }) });
      closeModal(modal);
      openBookingNextSteps(response.booking);
    } catch (error) { if (error.status === 401 || error.code === 'AUTH_REQUIRED') { closeModal(modal); openLogin(); showToast('Please login to book this tour.'); } else showToast(error.message || 'Unable to create tour booking.', 'error'); }
  });
}

function openLiveSearchResults(type, payload, queryPayload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const modal = $('#genericModal');
  const title = `${type[0].toUpperCase()}${type.slice(1)} search results`;
  const resultHtml = results.slice(0, 5).map((item, index) => {
    const safeItem = item && typeof item === 'object' ? item : { value: item };
    const values = Object.entries(safeItem).filter(([key]) => key !== 'id').slice(0, 4).map(([key, value]) => `<span><b>${escapeHtml(key.replace(/[A-Z]/g, m => ` ${m}`).replace(/^./, m => m.toUpperCase()))}</b> ${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : value)}</span>`).join('');
    const resultId = safeItem.id ? String(safeItem.id) : '';
    return `<div class="live-result"><div class="result-rank">${index + 1}</div><div class="live-result-copy">${values}</div>${resultId ? `<button type="button" class="btn btn-outline result-select" data-result-id="${escapeHtml(resultId)}">Select</button>` : '<span class="result-unavailable">No booking id</span>'}</div>`;
  }).join('');
  $('#modalContent').innerHTML = `<div class="modal-heading"><div class="modal-icon green">${icon('i-check')}</div><h2 id="modalTitle">${title}</h2></div><p class="modal-subtitle">Live availability returned by the configured provider.</p><div class="result-summary">${buildSearchSummary(type)}</div><div class="live-result-list">${resultHtml || '<div class="result-summary">No live results were returned.</div>'}</div><button type="button" class="btn btn-primary full-btn" data-close-modal>Close</button>`;
  openModal(modal);
  $$('.result-select', modal).forEach(button => button.addEventListener('click', () => { void createBooking(type, button.dataset.resultId, queryPayload); }));
}

async function createBooking(type, resultId, searchPayloadData) {
  try {
    const response = await apiRequest('/bookings', { method: 'POST', body: JSON.stringify({ vertical: type, payload: { ...searchPayloadData, resultId } }) });
    closeModal($('#genericModal'));
    openBookingNextSteps(response.booking);
  } catch (error) {
    if (error.status === 401 || error.code === 'AUTH_REQUIRED') { closeModal($('#genericModal')); openLogin(); showToast('Please login to continue with this booking.'); return; }
    showToast(error.message || 'Unable to create booking.', 'error');
  }
}

function openBookingNextSteps(booking) {
  const modal = $('#genericModal');
  const isOperatorReview = ['new', 'reviewing'].includes(booking?.status);
  const suggestedAmount = Number(booking?.request?.priceBdt || booking?.request?.price || 0);
  const paymentAction = isOperatorReview
    ? '<div class="result-summary"><strong>Request submitted for operator review.</strong><br><span>We will contact you when the package is accepted and payment is ready. No payment has been taken.</span></div><button type="button" class="btn btn-primary full-btn" data-close-modal>Done</button>'
    : `<label class="modal-field"><span>Amount (BDT)</span><input id="paymentAmount" type="number" min="1" value="${suggestedAmount || ''}" placeholder="Enter amount from provider" required /></label><button type="button" class="btn btn-primary full-btn" id="payBookingBtn">Continue to payment</button>`;
  $('#modalContent').innerHTML = `<div class="modal-heading"><div class="modal-icon green">${icon('i-check')}</div><h2 id="modalTitle">Booking request created</h2></div><p class="modal-subtitle">Your booking reference is <strong>${escapeHtml(booking.id)}</strong>.</p><div class="result-summary"><strong>Status: ${escapeHtml(booking.status)}</strong><br><span>Your request has been saved to Sadik Travels.</span></div>${paymentAction}`;
  openModal(modal);
  $('#payBookingBtn')?.addEventListener('click', async () => {
    const button = $('#payBookingBtn');
    const amount = Number($('#paymentAmount').value);
    if (!Number.isFinite(amount) || amount <= 0) { showToast('Enter the amount returned by the live provider.', 'error'); return; }
    button.disabled = true;
    try {
      const response = await apiRequest('/payments/intents', { method: 'POST', body: JSON.stringify({ bookingId: booking.id, amount, currency: 'BDT' }) });
      $('#modalContent').innerHTML = `<div class="modal-heading"><div class="modal-icon green">${icon('i-check')}</div><h2 id="modalTitle">Payment initiated</h2></div><p class="modal-subtitle">Transaction reference: <strong>${escapeHtml(response.payment?.transactionRef || 'pending')}</strong></p><div class="result-summary">${response.checkoutUrl ? 'Continue through the configured payment gateway to complete the booking.' : 'Payment intent created successfully.'}</div>${response.checkoutUrl ? `<a class="btn btn-primary full-btn" href="${escapeHtml(response.checkoutUrl)}" target="_blank" rel="noopener">Open payment gateway</a>` : '<button type="button" class="btn btn-primary full-btn" data-close-modal>Done</button>'}`;
    } catch (error) { showToast(error.message || 'Unable to start payment.', 'error'); } finally { button.disabled = false; }
  });
}
function validateSearchPayload(type, payload) {
  if (type === 'flight') {
    if (!payload.from || !payload.to) return 'Choose both departure and destination airports.';
    if (payload.from === payload.to) return 'Departure and destination must be different.';
    if (!payload.depart) return 'Choose a departure date.';
    if (payload.tripType === 'roundtrip' && (!payload.return || payload.return < payload.depart)) return 'Return date must be on or after the departure date.';
  }
  if (['hotel', 'homes'].includes(type) && (!payload.destination && !payload.location)) return 'Choose a destination.';
  if (type === 'hotel' && payload.checkOut <= payload.checkIn) return 'Check-out must be after check-in.';
  if (type === 'homes' && payload.checkOut <= payload.checkIn) return 'Check-out must be after check-in.';
  if (type === 'visa' && (!payload.country || !payload.category)) return 'Choose a country and visa category.';
  if (type === 'esim' && !payload.destination) return 'Choose a destination country or region.';
  return '';
}
async function submitSearch(type) {
  if (!appConfig.liveApi) { showToast('Live API is not configured.', 'error'); return; }
  try {
    const payload = searchPayload(type);
    const validationMessage = validateSearchPayload(type, payload);
    if (validationMessage) { showToast(validationMessage, 'error'); return; }
    const response = await apiRequest(`/search/${type}`, { method: 'POST', body: JSON.stringify(payload) });
    openLiveSearchResults(type, response, payload);
  } catch (error) {
    showToast(error.message || 'Search service is unavailable.', 'error');
  }
}

[['flightForm', 'flight'], ['hotelForm', 'hotel'], ['homesForm', 'homes'], ['visaForm', 'visa'], ['esimForm', 'esim']].forEach(([id, type]) => {
  document.getElementById(id)?.addEventListener('submit', event => { event.preventDefault(); void submitSearch(type); });
});
$('#toursForm')?.addEventListener('submit', event => { event.preventDefault(); void searchTours(tourQueryFromForm()); });
$('#applyTourFilters')?.addEventListener('click', () => void searchTours(tourQueryFromFilters()));
$('#tourResultsSort')?.addEventListener('change', () => void searchTours(tourQueryFromFilters()));
$('#clearTourFilters')?.addEventListener('click', () => { const query = { destination: '', tourType: '', maxPrice: '', sort: 'newest' }; $('#tourFilterDestination').value = ''; $('#tourFilterType').value = ''; $('#tourFilterBudget').value = ''; $('#tourResultsSort').value = 'newest'; void searchTours(query); });
$('#closeTourResults')?.addEventListener('click', () => { $('#tourResultsSection').hidden = true; $('#searchPanel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });

let otpChallengeId = '';
let otpTimer = null;
let currentUser = null;
let notificationsCache = [];
function stopOtpCountdown() { if (otpTimer) clearInterval(otpTimer); otpTimer = null; }
function startOtpCountdown(seconds) {
  stopOtpCountdown();
  const button = $('#requestOtpBtn');
  const note = $('#otpCountdown');
  let remaining = seconds;
  const update = () => { if (note) note.textContent = remaining > 0 ? `You can request another code in ${remaining}s.` : 'You can request a new code.'; if (button) { button.disabled = remaining > 0; button.textContent = remaining > 0 ? `Code sent · ${remaining}s` : 'Resend verification code'; } if (remaining <= 0) stopOtpCountdown(); remaining -= 1; };
  update();
  otpTimer = setInterval(update, 1000);
}
function renderNotifications() {
  const list = $('#notificationList');
  const count = $('#notificationCount');
  if (!list || !count) return;
  const unread = notificationsCache.filter(item => !item.readAt).length;
  count.textContent = unread > 99 ? '99+' : String(unread);
  count.hidden = unread === 0;
  list.innerHTML = notificationsCache.length ? notificationsCache.map(item => `<button type="button" class="notification-item ${item.readAt ? 'read' : 'unread'}" data-notification-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span><small>${new Date(item.createdAt).toLocaleString()}</small></button>`).join('') : '<div class="notification-empty">No notifications yet.</div>';
  $$('.notification-item', list).forEach(item => item.addEventListener('click', async () => { if (item.classList.contains('unread')) { await apiRequest(`/notifications/${item.dataset.notificationId}/read`, { method: 'PATCH' }).catch(() => undefined); await loadNotifications(); } }));
}
async function loadNotifications() { if (!currentUser) { notificationsCache = []; renderNotifications(); return; } try { const response = await apiRequest('/notifications'); notificationsCache = response.notifications || []; renderNotifications(); } catch { notificationsCache = []; renderNotifications(); } }
function openNotificationModal() { const modal = $('#genericModal'); const list = notificationsCache.length ? notificationsCache.map(item => `<button type="button" class="notification-item ${item.readAt ? 'read' : 'unread'}" data-notification-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span><small>${new Date(item.createdAt).toLocaleString()}</small></button>`).join('') : '<div class="notification-empty">No notifications yet.</div>'; $('#modalContent').innerHTML = `<div class="modal-heading"><div class="modal-icon blue">${icon('i-bell')}</div><h2 id="modalTitle">Notifications</h2></div><div class="notification-modal-list">${list}</div><button type="button" class="btn btn-primary full-btn" data-close-modal>Close</button>`; openModal(modal); $$('.notification-item', modal).forEach(item => item.addEventListener('click', async () => { await apiRequest(`/notifications/${item.dataset.notificationId}/read`, { method: 'PATCH' }).catch(() => undefined); await loadNotifications(); openNotificationModal(); })); }
$('#notificationBtn')?.addEventListener('click', async event => { event.stopPropagation(); if (!currentUser) { openLogin(); return; } const panel = $('#notificationPanel'); panel.hidden = !panel.hidden; $('#notificationBtn').setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) await loadNotifications(); });
$('#markNotificationsRead')?.addEventListener('click', async () => { await Promise.all(notificationsCache.filter(item => !item.readAt).map(item => apiRequest(`/notifications/${item.id}/read`, { method: 'PATCH' }).catch(() => undefined))); await loadNotifications(); });
document.addEventListener('click', event => { if (!event.target.closest('.notification-wrap')) { $('#notificationPanel')?.setAttribute('hidden', ''); $('#notificationBtn')?.setAttribute('aria-expanded', 'false'); } });

function updateAuthUi(user) {
  currentUser = user || null;
  void loadNotifications();
  const label = currentUser ? 'My Account' : 'Login';
  const loginLabel = $('#loginBtn span');
  if (loginLabel) loginLabel.textContent = label;
  $('#mobileLoginBtn')?.setAttribute('aria-label', label);
  const sidebarLabel = $('#sidebarLogin');
  if (sidebarLabel) sidebarLabel.textContent = currentUser ? 'Account' : 'Login';
}
async function openAccount() {
  try {
    const response = await apiRequest('/bookings');
    const bookings = response.bookings || [];
    const list = bookings.length ? bookings.slice(0, 5).map(item => `<div class="account-booking"><strong>${escapeHtml(item.vertical)}</strong><span>${escapeHtml(item.id)}</span><em>${escapeHtml(item.status)}</em></div>`).join('') : '<div class="result-summary">No bookings yet.</div>';
    const modal = $('#genericModal');
    $('#modalContent').innerHTML = `<div class="modal-heading"><div class="modal-icon blue">${icon('i-user')}</div><h2 id="modalTitle">My Account</h2></div><p class="modal-subtitle">${escapeHtml(currentUser?.phone || currentUser?.email || 'Signed-in traveller')}</p><div class="account-bookings"><h3>Recent bookings</h3>${list}</div><button class="btn btn-outline full-btn" id="logoutBtn">Logout</button>`;
    openModal(modal);
    $('#logoutBtn')?.addEventListener('click', async () => { await apiRequest('/auth/logout', { method: 'POST' }, false).catch(() => undefined); updateAuthUi(null); closeModal(modal); showToast('You have been logged out.'); });
  } catch (error) { if (error.status === 401) openLogin(); else showToast(error.message || 'Unable to load account.', 'error'); }
}
function handleLoginClick() { currentUser ? void openAccount() : openLogin(); }
function openLogin() { openModal($('#loginModal')); $('#loginIdentity')?.focus(); }
$('#loginBtn')?.addEventListener('click', handleLoginClick);
$('#mobileLoginBtn')?.addEventListener('click', handleLoginClick);

$('#sidebarLogin')?.addEventListener('click', () => { if (window.innerWidth < 1024) closeSidebar(); currentUser ? void openAccount() : openLogin(); });
$('#requestOtpBtn')?.addEventListener('click', async () => {
  const identity = $('#loginIdentity')?.value.trim();
  if (!identity) { showToast('Enter your mobile number or email first.', 'error'); return; }
  try {
    const response = await apiRequest('/auth/request-otp', { method: 'POST', body: JSON.stringify({ identity }) });
    otpChallengeId = response.challengeId;
    $('#otpStep').hidden = false;
    $('#loginOtp').required = true;
    $('#authNote').textContent = `Code sent to ${response.maskedDestination}. It expires in 5 minutes.`;
    if (response.devCode) $('#authNote').textContent += ` Development code: ${response.devCode}`;
    startOtpCountdown(60);
    $('#loginOtp')?.focus();
  } catch (error) { showToast(error.code === 'SMS_NOT_CONFIGURED' ? 'BulkSMSBD is not configured on the backend.' : error.code === 'EMAIL_NOT_CONFIGURED' ? 'SMTP email is not configured on the backend.' : (error.message || 'Unable to send OTP.'), 'error'); }
});
$('#changeIdentityBtn')?.addEventListener('click', () => { otpChallengeId = ''; stopOtpCountdown(); $('#otpStep').hidden = true; $('#loginOtp').required = false; $('#requestOtpBtn').disabled = false; $('#requestOtpBtn').textContent = 'Send verification code'; $('#otpCountdown').textContent = ''; $('#authNote').textContent = 'We’ll send a secure OTP. Your account is created automatically on first login.'; $('#loginIdentity')?.focus(); });
$('#loginForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!otpChallengeId) { showToast('Request a verification code first.', 'error'); return; }
  try {
    const response = await apiRequest('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ challengeId: otpChallengeId, code: $('#loginOtp').value.trim() }) });
    stopOtpCountdown();
    closeModal($('#loginModal'));
    updateAuthUi(response.user);
    showToast('Welcome back to Sadik Travels.', 'success');
    $('#requestOtpBtn').disabled = false;
  } catch (error) { showToast(error.message || 'Unable to verify OTP.', 'error'); }
});
$('#forgotPassword')?.addEventListener('click', () => showToast('Sadik Travels uses passwordless OTP login. Contact support if you cannot access your number or email.'));
$('#createAccount')?.addEventListener('click', () => { showToast('New accounts are created automatically after OTP verification.'); $('#loginIdentity')?.focus(); });

function openChat() { openTemplateModal('chatTemplate'); }
$('#chatBubble')?.addEventListener('click', openChat);
$('#supportBtn')?.addEventListener('click', openChat);
$('#supportSideBtn')?.addEventListener('click', () => { if (window.innerWidth < 1024) closeSidebar(); openChat(); });
$('#trackBookingBtn')?.addEventListener('click', () => { if (window.innerWidth < 1024) closeSidebar(); openTemplateModal('trackTemplate'); });

$$('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.closest('.modal'))));
document.addEventListener('click', event => {
  const closeButton = event.target.closest('[data-close-modal]');
  if (closeButton) closeModal(closeButton.closest('.modal'));
  if (event.target.classList.contains('modal')) closeModal(event.target);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    document.querySelectorAll('.modal:not([hidden])').forEach(closeModal);
    if (window.innerWidth < 1024 && $('#amySidebar')?.classList.contains('open')) closeSidebar();
  }
  const sidebar = $('#amySidebar');
  if (event.key === 'Tab' && window.innerWidth < 1024 && sidebar?.classList.contains('open')) {
    const focusable = $$('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])', sidebar);
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

function openHotelDetails(title) {
  const modal = $('#genericModal');
  $('#modalContent').innerHTML = `<div class="modal-heading"><div class="modal-icon blue">${icon('i-hotel')}</div><h2 id="modalTitle">${escapeHtml(title)}</h2></div><p class="modal-subtitle">Featured hotel inspiration from Sadik Travels.</p><div class="result-summary"><strong>Promotional information</strong><br><span>Availability, room rates and booking confirmation come only from the configured live hotel provider. This card does not represent live inventory.</span></div><button type="button" class="btn btn-primary full-btn" id="hotelBookCta">Search live rooms</button>`;
  openModal(modal);
  $('#hotelBookCta')?.addEventListener('click', () => { closeModal(modal); activateTab('hotels', true); showToast('Hotel search is ready. Submit your dates to request live availability.'); });
}
function bindPromotionalInteractions(scope = document) {
  $$('.travel-card', scope).forEach(card => { if (card.dataset.interactionBound) return; card.dataset.interactionBound = 'true'; card.addEventListener('click', event => { event.preventDefault(); openHotelDetails(card.dataset.cardTitle || card.textContent.trim()); }); });
  $$('.destination-card', scope).forEach(card => { if (card.dataset.interactionBound) return; card.dataset.interactionBound = 'true'; card.addEventListener('click', event => { event.preventDefault(); showToast(`Destination selected: ${card.dataset.destination}.`); activateTab('flights', true); $('#toAirport').value = card.dataset.destination; }); });
  $$('.banner-slide', scope).forEach(slide => { if (slide.dataset.interactionBound) return; slide.dataset.interactionBound = 'true'; slide.addEventListener('click', event => { event.preventDefault(); showToast(`${slide.querySelector('img')?.alt || 'Offer'} selected.`); }); });
}
bindPromotionalInteractions();

let sidebarReturnFocus = null;
let desktopSidebarCollapsed = false;
function syncSidebarState(open) {
  const sidebar = $('#amySidebar');
  const backdrop = $('#pageBackdrop');
  const desktop = window.innerWidth >= 1024;
  if (!sidebar) return;
  const visible = desktop ? !desktopSidebarCollapsed : open;
  sidebar.classList.toggle('open', visible);
  sidebar.classList.toggle('desktop-collapsed', desktop && desktopSidebarCollapsed);
  sidebar.setAttribute('aria-hidden', String(!visible));
  if (backdrop) backdrop.hidden = desktop || !open;
  document.body.classList.toggle('sidebar-open', !desktop && open);
  document.body.classList.toggle('desktop-sidebar-collapsed', desktop && desktopSidebarCollapsed);
  $('#menuToggle')?.setAttribute('aria-expanded', String(visible));
  $('#menuToggle')?.setAttribute('aria-label', visible ? 'Close menu' : 'Open menu');
  if (!desktop && open) $('#sidebarClose')?.focus();
  if (!open && sidebarReturnFocus && !desktop) { sidebarReturnFocus.focus?.(); sidebarReturnFocus = null; }
}
function openSidebar() {
  sidebarReturnFocus = document.activeElement;
  if (window.innerWidth >= 1024) desktopSidebarCollapsed = false;
  syncSidebarState(true);
}
function closeSidebar() {
  if (window.innerWidth >= 1024) { desktopSidebarCollapsed = true; syncSidebarState(false); return; }
  syncSidebarState(false);
}
function toggleSidebar() {
  if (window.innerWidth >= 1024) { desktopSidebarCollapsed = !desktopSidebarCollapsed; syncSidebarState(!desktopSidebarCollapsed); return; }
  const open = $('#amySidebar')?.classList.contains('open');
  open ? closeSidebar() : openSidebar();
}
$('#menuToggle')?.addEventListener('click', toggleSidebar);
$('#sidebarClose')?.addEventListener('click', closeSidebar);
$('#pageBackdrop')?.addEventListener('click', closeSidebar);
window.addEventListener('resize', () => syncSidebarState(false));
syncSidebarState(false);

function visibleCount(kind) {
  if (kind === 'banners') return window.innerWidth <= 560 ? 1 : window.innerWidth <= 1000 ? 2 : 3;
  if (kind === 'destinations') return window.innerWidth <= 560 ? 2 : window.innerWidth <= 900 ? 3 : 5;
  return window.innerWidth <= 560 ? 1 : window.innerWidth <= 900 ? 2 : 3;
}

function updateBannerSlider() {
  const track = $('#bannerTrack');
  if (!track) return;
  const slides = $$('.banner-slide', track);
  const visible = visibleCount('banners');
  const max = Math.max(0, slides.length - visible);
  state.bannerIndex = Math.max(0, Math.min(max, state.bannerIndex));
  const slideWidth = slides[0]?.getBoundingClientRect().width || 0;
  track.style.transform = `translateX(-${state.bannerIndex * (slideWidth + 14)}px)`;
  const dots = $('#bannerDots');
  const pageCount = max + 1;
  dots.innerHTML = Array.from({ length: Math.min(pageCount, 8) }, (_, i) => `<button type="button" aria-label="Go to banner ${i + 1}" class="${i === Math.min(state.bannerIndex, 7) ? 'active' : ''}"></button>`).join('');
  $$('button', dots).forEach((button, i) => button.addEventListener('click', () => { state.bannerIndex = Math.min(i, max); updateBannerSlider(); }));
}
function moveBanner(direction) { state.bannerIndex += direction; updateBannerSlider(); }
$('[data-slider-prev="banners"]')?.addEventListener('click', () => moveBanner(-1));
$('[data-slider-next="banners"]')?.addEventListener('click', () => moveBanner(1));

const cardTrackMap = { hotels: '#hotelTrack', transit: '#transitTrack', destinations: '#destinationTrack' };
function updateCardSlider(kind) {
  const track = $(cardTrackMap[kind]);
  if (!track) return;
  const cards = [...track.children];
  const visible = visibleCount(kind);
  const max = Math.max(0, cards.length - visible);
  state.cardIndexes[kind] = Math.max(0, Math.min(max, state.cardIndexes[kind] || 0));
  const gap = 14;
  const cardWidth = cards[0]?.getBoundingClientRect().width || 0;
  track.style.transform = `translateX(-${state.cardIndexes[kind] * (cardWidth + gap)}px)`;
}
$$('[data-card-prev]').forEach(button => button.addEventListener('click', () => { const kind = button.dataset.cardPrev; state.cardIndexes[kind] = (state.cardIndexes[kind] || 0) - 1; updateCardSlider(kind); }));
$$('[data-card-next]').forEach(button => button.addEventListener('click', () => { const kind = button.dataset.cardNext; state.cardIndexes[kind] = (state.cardIndexes[kind] || 0) + 1; updateCardSlider(kind); }));

function updateAllSliders() { updateBannerSlider(); Object.keys(cardTrackMap).forEach(updateCardSlider); }
window.addEventListener('resize', updateAllSliders);
window.addEventListener('load', updateAllSliders);
setTimeout(updateAllSliders, 80);

const bannerSlider = $('.banner-slider');
bannerSlider?.addEventListener('mouseenter', () => clearInterval(state.autoBanner));
bannerSlider?.addEventListener('mouseleave', () => startBannerAutoplay());
function startBannerAutoplay() {
  clearInterval(state.autoBanner);
  state.autoBanner = setInterval(() => {
    const slides = $$('.banner-slide');
    const max = Math.max(0, slides.length - visibleCount('banners'));
    state.bannerIndex = state.bannerIndex >= max ? 0 : state.bannerIndex + 1;
    updateBannerSlider();
  }, 5600);
}
startBannerAutoplay();

window.addEventListener('scroll', () => $('#siteHeader')?.classList.toggle('scrolled', window.scrollY > 30));
$('#currencyBtn')?.addEventListener('click', () => showToast('Currency selector: BDT is currently selected.'));
$$('a[href^="#"]').forEach(link => {
  link.addEventListener('click', event => {
    const target = link.getAttribute('href');
    if (target === '#' || !document.querySelector(target)) {
      if (!link.closest('.nav-links') && !link.closest('.travel-tab')) {
        event.preventDefault();
        showToast('This destination is ready for your content or live API connection.');
      }
    }
  });
});

if (appConfig.liveApi) {
  void applySiteSettings();
  void applyPublicContent();
  void apiRequest('/auth/me', {}, false).then(response => updateAuthUi(response.user)).catch(() => updateAuthUi(null));
}
const initialTourParams = new URLSearchParams(window.location.search);
if (initialTourParams.get('type') === 'tour') {
  activateTab('tours');
  void searchTours({ destination: initialTourParams.get('destination') || '', tourType: initialTourParams.get('tour_type') || '', maxPrice: initialTourParams.get('max_price') || '', sort: initialTourParams.get('sort') || 'newest' }, false);
}
updatePassengerSummary();
