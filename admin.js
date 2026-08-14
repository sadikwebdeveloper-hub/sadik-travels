const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c]));
const SECRET_MASK = '••••••••';
const api = (path, options = {}) => window.SadikApi.request(path, options);
let otpChallengeId = '';
let adminOtpTimer = null;
let tours = [];
let bookings = [];
let bookingPage = 1;
let bookingPageCount = 1;
let contentItems = [];
let tickets = [];
let currentAdmin = null;
let teamUsers = [];
let filterTimer = null;

function toast(message, type = '') {
  const region = $('#adminToast');
  if (!region) return;
  const node = document.createElement('div');
  node.className = `admin-toast ${type}`;
  node.textContent = message;
  region.appendChild(node);
  setTimeout(() => node.remove(), 4000);
}
function setLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.dataset.original = button.dataset.original || button.textContent;
  button.textContent = loading ? 'Please wait…' : button.dataset.original;
}
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }
function formatMoney(value) { return `৳${Number(value || 0).toLocaleString('en-BD')}`; }
function displayName(user) { return user?.fullName || user?.phone || user?.email || 'Unassigned'; }

function initAuthScene() {
  const canvas = $('#authScene');
  const card = $('#adminLoginCard');
  const THREE = window.THREE;
  if (!canvas || !card || !THREE || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.z = 8;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const group = new THREE.Group(); scene.add(group);
    const particleCount = 150;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) { positions[i * 3] = (Math.random() - .5) * 9; positions[i * 3 + 1] = (Math.random() - .5) * 8; positions[i * 3 + 2] = (Math.random() - .5) * 5; }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({ color: 0x7192ff, size: .035, transparent: true, opacity: .62 }));
    group.add(particles);
    const blue = new THREE.MeshBasicMaterial({ color: 0x3864df, wireframe: true, transparent: true, opacity: .24 });
    const gold = new THREE.MeshBasicMaterial({ color: 0xf4b64a, wireframe: true, transparent: true, opacity: .28 });
    const shapes = [new THREE.Mesh(new THREE.IcosahedronGeometry(.55, 1), blue), new THREE.Mesh(new THREE.OctahedronGeometry(.42, 0), gold), new THREE.Mesh(new THREE.TorusGeometry(.55, .012, 8, 32), blue), new THREE.Mesh(new THREE.BoxGeometry(.6, .6, .6), gold)];
    shapes.forEach((shape, index) => { shape.position.set([-2.7, 2.4, -2.1, 2.2][index], [1.8, -1.8, 2.2, -2.3][index], [-.2, .5, -.4, .7][index]); shape.rotation.set(Math.random(), Math.random(), Math.random()); group.add(shape); });
    const pointer = { x: 0, y: 0 };
    const resize = () => { const rect = card.getBoundingClientRect(); renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false); camera.aspect = rect.width / Math.max(rect.height, 1); camera.updateProjectionMatrix(); };
    const onPointer = event => { const rect = card.getBoundingClientRect(); pointer.x = (event.clientX - rect.left) / rect.width * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height * 2 - 1); card.style.setProperty('--tilt-x', `${pointer.x * 2.3}deg`); card.style.setProperty('--tilt-y', `${pointer.y * 2.3}deg`); card.classList.add('tilt-ready'); };
    const resetPointer = () => { pointer.x = 0; pointer.y = 0; card.style.setProperty('--tilt-x', '0deg'); card.style.setProperty('--tilt-y', '0deg'); };
    card.addEventListener('pointermove', onPointer); card.addEventListener('pointerleave', resetPointer); window.addEventListener('resize', resize); resize();
    const clock = new THREE.Clock(); let frame = 0;
    const animate = () => { frame = requestAnimationFrame(animate); if (document.hidden) return; const time = clock.getElapsedTime(); group.rotation.y += .0008; group.rotation.x = Math.sin(time * .18) * .045 + pointer.y * .035; group.position.x += (pointer.x * .18 - group.position.x) * .025; group.position.y += (pointer.y * .14 - group.position.y) * .025; shapes.forEach((shape, index) => { shape.rotation.x += .0015 + index * .0003; shape.rotation.y += .002 + index * .0002; }); renderer.render(scene, camera); };
    animate();
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !frame) animate(); });
    window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); particleGeometry.dispose(); particles.material.dispose(); shapes.forEach(shape => { shape.geometry.dispose(); shape.material.dispose(); }); renderer.dispose(); });
  } catch { /* WebGL is decorative; the functional form remains available without it. */ }
}

function stopAdminOtpCountdown() { if (adminOtpTimer) clearInterval(adminOtpTimer); adminOtpTimer = null; }
function startAdminOtpCountdown(seconds) {
  stopAdminOtpCountdown();
  const button = $('#adminSendOtp'); const note = $('#adminOtpCountdown');
  let remaining = seconds;
  const update = () => { if (note) note.textContent = remaining > 0 ? `You can request another code in ${remaining}s.` : 'You can request a new code.'; if (button) { button.disabled = remaining > 0; button.textContent = remaining > 0 ? `Code sent · ${remaining}s` : 'Resend verification code'; } if (remaining <= 0) stopAdminOtpCountdown(); remaining -= 1; };
  update(); adminOtpTimer = setInterval(update, 1000);
}

$$('[data-password-toggle]').forEach(button => button.addEventListener('click', () => { const input = document.getElementById(button.dataset.passwordToggle); if (!input) return; const showing = input.type === 'text'; input.type = showing ? 'password' : 'text'; button.textContent = showing ? 'Show' : 'Hide'; button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password'); }));

$('#adminSendOtp')?.addEventListener('click', async () => {
  const identity = $('#adminIdentity').value.trim();
  if (!identity) { toast('Enter an admin mobile number or email.', 'error'); return; }
  const button = $('#adminSendOtp'); setLoading(button, true);
  try {
    const response = await api('/auth/request-otp', { method: 'POST', body: JSON.stringify({ identity, adminOnly: true }) });
    otpChallengeId = response.challengeId;
    $('#adminOtpStep').hidden = false;
    $('#adminAuthMessage').textContent = response.devCode ? `Development code: ${response.devCode}` : `Code sent to ${response.maskedDestination}.`;
    $('#adminOtp').focus();
  } catch (error) {
    if (error.code === 'ADMIN_NOT_WHITELISTED') toast('This identity is not in ADMIN_IDENTITIES. Add the exact phone/email in your deployment environment.', 'error');
    else if (error.code === 'SMS_NOT_CONFIGURED') toast('SMS gateway is not configured. Add a real provider in Integrations & settings.', 'error');
    else if (error.code === 'EMAIL_NOT_CONFIGURED') toast('SMTP email is not configured. Add a real SMTP provider in Integrations & settings.', 'error');
    else if (error.code === 'OTP_THROTTLED' || error.status === 429) toast('Too many OTP requests. Wait before requesting another code.', 'error');
    else toast(error.message || 'Unable to send verification code.', 'error');
  } finally { setLoading(button, false); if (otpChallengeId) startAdminOtpCountdown(60); }
});
$('#adminLoginForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!otpChallengeId) { toast('Request an OTP first.', 'error'); return; }
  const button = event.submitter || $('#adminLoginForm button[type="submit"]'); setLoading(button, true);
  try {
    const response = await api('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ challengeId: otpChallengeId, code: $('#adminOtp').value.trim() }) });
    if (!['admin', 'manager', 'super_admin'].includes(response.user?.role)) { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); throw new Error('OTP verified, but this account is not an admin.'); }
    stopAdminOtpCountdown(); await loadWorkspace(true);
  } catch (error) { toast(error.message || 'Admin verification failed.', 'error'); }
  finally { setLoading(button, false); }
});
$('#logoutBtn')?.addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); location.reload(); });
$('#adminPasswordForm')?.addEventListener('submit', async event => { event.preventDefault(); const button = event.submitter || $('#adminPasswordForm button[type="submit"]'); setLoading(button, true); try { await api('/auth/password-login', { method: 'POST', body: JSON.stringify({ identity: $('#adminPasswordIdentity').value.trim(), password: $('#adminPassword').value }) }); await loadWorkspace(true); } catch (error) { toast(error.code === 'ADMIN_LOGIN_INVALID' ? 'Invalid admin credentials. Bootstrap or reset the super admin with npm run admin:create.' : (error.message || 'Invalid admin credentials.'), 'error'); } finally { setLoading(button, false); } });
$('#showOtpLogin')?.addEventListener('click', () => { $('#passwordLoginStep').hidden = true; $('#passwordLoginStep').classList.remove('is-active'); $('#otpLoginStep').hidden = false; requestAnimationFrame(() => $('#otpLoginStep').classList.add('is-active')); $('#adminIdentity').focus(); });
$('#backToPassword')?.addEventListener('click', () => { stopAdminOtpCountdown(); otpChallengeId = ''; $('#otpLoginStep').hidden = true; $('#otpLoginStep').classList.remove('is-active'); $('#passwordLoginStep').hidden = false; requestAnimationFrame(() => $('#passwordLoginStep').classList.add('is-active')); });

async function loadWorkspace(fromLogin = false) {
  try {
    const me = await api('/admin/me');
    currentAdmin = me.user;
    if (fromLogin) { $('#adminLoginCard').classList.add('auth-success'); await new Promise(resolve => setTimeout(resolve, 520)); }
    $('#adminLoginCard').hidden = true; $('#adminWorkspace').hidden = false; $('#logoutBtn').hidden = false;
    await Promise.all([loadStats(), loadTours(), loadSettings(), loadUsers(), loadBookings(), loadTickets(), loadContent()]);
    resetEditor(); resetContentEditor();
  } catch (error) { if (error.status === 403) toast('This account does not have admin access.', 'error'); else if (error.status !== 401) toast(error.message || 'Unable to load admin workspace.', 'error'); }
}

async function loadStats() {
  const response = await api('/admin/stats');
  const tourStats = response.tours || {};
  $('#statTotal').textContent = tourStats.total ?? 0; $('#statPublished').textContent = tourStats.published ?? 0; $('#statDraft').textContent = tourStats.draft ?? 0; $('#statArchived').textContent = tourStats.archived ?? 0;
  const stats = response.bookings || {}; const needsReview = (stats.new || 0) + (stats.reviewing || 0) + (stats.pending || 0);
  $('#dashBookings').textContent = stats.total ?? 0; $('#dashPending').textContent = needsReview; $('#dashConfirmed').textContent = (stats.confirmed || 0) + (stats.completed || 0); $('#dashCustomers').textContent = response.customers ?? 0; $('#dashRevenue').textContent = formatMoney(response.revenueBdt); $('#dashSupport').textContent = (response.supportTickets?.open || 0) + (response.supportTickets?.pending || 0); const verticalCounts = response.verticalCounts || {}; $('#dashFlights').textContent = verticalCounts.flight || 0; $('#dashHotels').textContent = verticalCounts.hotel || 0; $('#dashHomes').textContent = verticalCounts.home || 0; $('#dashVisa').textContent = verticalCounts.visa || 0; $('#dashEsim').textContent = verticalCounts.esim || 0; $('#dashTours').textContent = verticalCounts.tour || 0;
  const bars = $('#dashStatusBars'); const distribution = response.statusDistribution || [];
  $('#dashStatusSummary').textContent = distribution.length ? `${distribution.reduce((sum, item) => sum + item.count, 0)} recorded` : 'No bookings yet';
  bars.innerHTML = distribution.length ? distribution.map(item => `<div class="status-bar-row"><span>${escapeHtml(item.status)}</span><div><i style="width:${Math.max(4, Math.round(item.count / Math.max(1, stats.total) * 100))}%"></i></div><strong>${item.count}</strong></div>`).join('') : '<div class="admin-empty">No booking activity yet.</div>';
  const recentBookings = response.recentBookings || []; $('#dashRecentBookings').innerHTML = recentBookings.length ? recentBookings.slice(0, 6).map(item => `<button type="button" class="recent-booking-item" data-dashboard-booking="${escapeHtml(item.id)}"><span class="recent-booking-id">${escapeHtml(item.id.slice(0, 8).toUpperCase())}</span><span><strong>${escapeHtml(item.vertical)}</strong><small>${escapeHtml(formatDate(item.updatedAt))}</small></span><span class="status-pill status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></button>`).join('') : '<div class="admin-empty">No bookings yet.</div>';
  $$('[data-dashboard-booking]').forEach(button => button.addEventListener('click', () => void openBookingDetail(button.dataset.dashboardBooking)));
  const activity = response.recentActivity || []; $('#dashActivityList').innerHTML = activity.length ? activity.slice(0, 8).map(item => `<div class="activity-item"><span class="activity-dot"></span><div><strong>${escapeHtml(item.action.replace(/\./g, ' · '))}</strong><small>${escapeHtml(formatDate(item.createdAt))}</small></div></div>`).join('') : '<div class="admin-empty">No activity yet.</div>';
  const trend = response.revenueTrend || []; const maxRevenue = Math.max(1, ...trend.map(item => Number(item.revenueBdt || 0))); $('#dashRevenueTrend').innerHTML = trend.length && trend.some(item => item.revenueBdt > 0) ? trend.map(item => `<div class="revenue-row"><span>${escapeHtml(item.month)}</span><div><i style="width:${Math.max(4, Math.round(item.revenueBdt / maxRevenue * 100))}%"></i></div><strong>${escapeHtml(formatMoney(item.revenueBdt))}</strong></div>`).join('') : '<div class="admin-empty">No paid transactions yet.</div>';
}

async function loadBookings() {
  const query = new URLSearchParams({ page: String(bookingPage), pageSize: '12' });
  const q = $('#adminBookingSearch')?.value.trim(); const status = $('#adminBookingStatus')?.value; const vertical = $('#adminBookingVertical')?.value;
  if (q) query.set('q', q); if (status) query.set('status', status); if (vertical) query.set('vertical', vertical);
  const response = await api(`/admin/bookings?${query}`); bookings = response.bookings || []; bookingPage = response.page || 1; bookingPageCount = response.pageCount || 1;
  const tbody = $('#adminBookingTable'); $('#adminBookingEmpty').hidden = bookings.length > 0;
  tbody.innerHTML = bookings.map(booking => { const owner = booking.owner ? displayName(booking.owner) : 'Unassigned'; const customer = displayName(booking.customer); const canRelease = booking.ownerId === currentAdmin?.id || ['admin', 'super_admin'].includes(currentAdmin?.role); return `<tr><td><button class="table-link booking-open" data-booking-id="${escapeHtml(booking.id)}">${escapeHtml(booking.id.slice(0, 8).toUpperCase())}</button><small>${escapeHtml(formatDate(booking.createdAt))}</small></td><td>${escapeHtml(customer)}</td><td><span class="vertical-badge">${escapeHtml(booking.vertical)}</span></td><td><span class="status-pill status-${escapeHtml(booking.status)}">${escapeHtml(booking.status)}</span></td><td>${escapeHtml(owner)}</td><td>${escapeHtml(formatDate(booking.updatedAt))}</td><td><div class="table-actions">${booking.ownerId ? (canRelease ? `<button class="table-action" data-release-booking="${escapeHtml(booking.id)}">Release</button>` : '') : `<button class="table-action" data-claim-booking="${escapeHtml(booking.id)}">Take</button>`}</div></td></tr>`; }).join('');
  $('#bookingPageInfo').textContent = `Page ${bookingPage} of ${bookingPageCount}`; $('#bookingPrev').disabled = bookingPage <= 1; $('#bookingNext').disabled = bookingPage >= bookingPageCount;
  $$('.booking-open', tbody).forEach(button => button.addEventListener('click', () => void openBookingDetail(button.dataset.bookingId)));
  $$('[data-claim-booking]', tbody).forEach(button => button.addEventListener('click', () => void claimBooking(button.dataset.claimBooking)));
  $$('[data-release-booking]', tbody).forEach(button => button.addEventListener('click', () => void releaseBooking(button.dataset.releaseBooking)));
}
async function claimBooking(id) { try { await api(`/admin/bookings/${id}/claim`, { method: 'POST' }); toast('Booking claimed for your workspace.', 'success'); await Promise.all([loadBookings(), loadStats()]); } catch (error) { toast(error.message || 'Unable to claim booking.', 'error'); await loadBookings(); } }
async function releaseBooking(id) { try { await api(`/admin/bookings/${id}/release`, { method: 'POST' }); toast('Booking released.', 'success'); await Promise.all([loadBookings(), loadStats()]); } catch (error) { toast(error.message || 'Unable to release booking.', 'error'); } }

function ensureBookingDrawer() {
  let drawer = $('#bookingDrawer');
  if (drawer) return drawer;
  drawer = document.createElement('aside'); drawer.id = 'bookingDrawer'; drawer.className = 'booking-drawer'; drawer.hidden = true; document.body.appendChild(drawer);
  return drawer;
}
async function openBookingDetail(id) {
  const drawer = ensureBookingDrawer(); drawer.hidden = false; drawer.innerHTML = '<div class="drawer-loading">Loading booking…</div>'; document.body.classList.add('drawer-open');
  try {
    const response = await api(`/admin/bookings/${id}`); const booking = response.booking; const history = response.history || []; const owner = booking.owner ? displayName(booking.owner) : 'Unassigned';
    const transitions = { new: ['reviewing','accepted','rejected','cancelled'], reviewing: ['new','accepted','rejected','cancelled'], accepted: ['processing','rejected','cancelled'], processing: ['confirmed','rejected','cancelled'], pending: ['reviewing','accepted','processing','confirmed','rejected','cancelled'], confirmed: ['completed','cancelled'], failed: ['reviewing','cancelled'] };
    const options = [booking.status, ...(transitions[booking.status] || [])].filter((value, index, list) => list.indexOf(value) === index).map(value => `<option value="${value}" ${value === booking.status ? 'selected' : ''}>${value}</option>`).join('');
    drawer.innerHTML = `<div class="drawer-head"><div><span class="admin-eyebrow">Booking workspace</span><h2>${escapeHtml(booking.id)}</h2></div><button type="button" class="admin-icon-btn" id="closeBookingDrawer" aria-label="Close">×</button></div><div class="drawer-summary"><span class="status-pill status-${escapeHtml(booking.status)}">${escapeHtml(booking.status)}</span><span>${escapeHtml(booking.vertical)}</span><span>Updated ${escapeHtml(formatDate(booking.updatedAt))}</span></div><dl class="booking-detail-list"><div><dt>Customer</dt><dd>${escapeHtml(displayName(booking.customer))}</dd></div><div><dt>Owner</dt><dd>${escapeHtml(owner)}</dd></div><div><dt>Created</dt><dd>${escapeHtml(formatDate(booking.createdAt))}</dd></div><div><dt>Provider reference</dt><dd>${escapeHtml(booking.providerRef || 'Not assigned')}</dd></div></dl><div class="drawer-section"><label><span>Request data (JSON)</span><textarea id="drawerRequest" rows="9">${escapeHtml(JSON.stringify(booking.request, null, 2))}</textarea></label></div><div class="drawer-section"><label><span>Assigned operator</span><select id="drawerOwner" ${['admin','super_admin'].includes(currentAdmin?.role) ? '' : 'disabled'}><option value="">Unassigned</option>${teamUsers.map(user => `<option value="${escapeHtml(user.id)}" ${user.id === booking.ownerId ? 'selected' : ''}>${escapeHtml(displayName(user))} · ${escapeHtml(user.role)}</option>`).join('')}</select></label><label><span>Workflow status</span><select id="drawerStatus">${options}</select></label><label><span>Internal note</span><textarea id="drawerNote" rows="4" maxlength="4000">${escapeHtml(booking.internalNote || '')}</textarea></label><div class="drawer-actions"><button type="button" class="admin-secondary" id="drawerClaimBtn">${booking.ownerId === currentAdmin?.id ? 'Claimed by you' : 'Claim booking'}</button>${booking.ownerId ? `<button type="button" class="admin-secondary" id="drawerReleaseBtn">Release</button>` : ''}<button type="button" class="admin-primary" id="drawerSaveBtn">Save update</button></div></div><div class="drawer-section"><strong>Action history</strong><div class="booking-history">${history.length ? history.map(item => `<div><span>${escapeHtml(item.action)}</span><small>${escapeHtml(formatDate(item.createdAt))}${item.note ? ` · ${escapeHtml(item.note)}` : ''}</small></div>`).join('') : '<p class="muted-copy">No history yet.</p>'}</div></div>`;
    $('#closeBookingDrawer').addEventListener('click', closeBookingDrawer); $('#drawerClaimBtn').addEventListener('click', () => void claimBookingFromDrawer(id)); $('#drawerReleaseBtn')?.addEventListener('click', () => void releaseBooking(id)); $('#drawerSaveBtn').addEventListener('click', () => void saveBookingDetail(id));
  } catch (error) { drawer.innerHTML = `<div class="drawer-head"><h2>Unable to load booking</h2><button type="button" class="admin-icon-btn" id="closeBookingDrawer">×</button></div><p class="drawer-error">${escapeHtml(error.message || 'Booking details are unavailable.')}</p>`; $('#closeBookingDrawer').addEventListener('click', closeBookingDrawer); }
}
function closeBookingDrawer() { $('#bookingDrawer')?.setAttribute('hidden', ''); document.body.classList.remove('drawer-open'); }
async function claimBookingFromDrawer(id) { await claimBooking(id); await openBookingDetail(id); }
async function saveBookingDetail(id) { const button = $('#drawerSaveBtn'); let request; try { request = JSON.parse($('#drawerRequest').value); } catch { toast('Request data must be valid JSON.', 'error'); return; } if (!request || Array.isArray(request) || typeof request !== 'object') { toast('Request data must be a JSON object.', 'error'); return; } setLoading(button, true); try { const ownerField = $('#drawerOwner'); await api(`/admin/bookings/${id}`, { method: 'PATCH', body: JSON.stringify({ status: $('#drawerStatus').value, internalNote: $('#drawerNote').value.trim(), request, ...(ownerField && !ownerField.disabled ? { ownerId: ownerField.value || null } : {}) }) }); toast('Booking workflow updated.', 'success'); await Promise.all([loadBookings(), loadStats()]); await openBookingDetail(id); } catch (error) { toast(error.message || 'Unable to update booking.', 'error'); } finally { setLoading(button, false); } }

async function loadSettings() { const response = await api('/admin/settings'); (response.settings || []).forEach(item => { const field = document.querySelector(`[data-setting="${item.key}"]`); if (!field) return; if (field.type === 'checkbox') field.checked = item.value === '' || item.value === 'true'; else field.value = item.secret ? (item.masked || '') : (item.value || ''); if (item.key === 'brand_logo_url' && item.value) document.querySelectorAll('[data-brand-logo]').forEach(image => { image.src = item.value; }); if (item.secret && item.configured) field.placeholder = 'Configured — leave unchanged to keep'; }); }
async function saveSettings(event) { event.preventDefault(); const payload = {}; $$('[data-setting]').forEach(field => { if (field.type === 'checkbox') payload[field.dataset.setting] = field.checked ? 'true' : 'false'; else if (field.value && field.value !== SECRET_MASK) payload[field.dataset.setting] = field.value; }); const button = $('#saveSettingsBtn'); setLoading(button, true); try { await api('/admin/settings', { method: 'PUT', body: JSON.stringify(payload) }); $('#settingsStatus').textContent = 'Saved securely'; $('#settingsSaveMessage').textContent = 'Settings saved'; toast('Integration settings saved securely.', 'success'); await loadSettings(); } catch (error) { toast(error.message || 'Unable to save settings.', 'error'); } finally { setLoading(button, false); } }
async function testSms() { const destination = $('#testSmsDestination').value.trim(); const message = $('#testSmsMessage').value.trim(); if (!destination || !message) { toast('Enter a test number and message.', 'error'); return; } try { await api('/admin/settings/test-sms', { method: 'POST', body: JSON.stringify({ destination, message }) }); toast('Test SMS delivered by the configured provider.', 'success'); } catch (error) { toast(error.message || 'Test SMS failed.', 'error'); } }
async function testEmail() { const destination = $('#testEmailDestination').value.trim(); const subject = $('#testEmailSubject').value.trim(); if (!destination) { toast('Enter a test email recipient.', 'error'); return; } try { await api('/admin/settings/test-email', { method: 'POST', body: JSON.stringify({ destination, subject, message: 'This is a Sadik Travels SMTP test.' }) }); toast('Test email delivered by the configured provider.', 'success'); } catch (error) { toast(error.message || 'Test email failed.', 'error'); } }
async function loadUsers() { const response = await api('/admin/users'); teamUsers = (response.users || []).filter(user => ['manager', 'admin', 'super_admin'].includes(user.role)); const tbody = $('#adminUserTable'); if (!tbody) return; tbody.innerHTML = (response.users || []).map(user => `<tr><td><strong>${escapeHtml(user.phone || user.email || user.id)}</strong></td><td><span class="status-pill status-${escapeHtml(user.status)}">${escapeHtml(user.status)}</span></td><td><select class="admin-role-select" data-user-role="${escapeHtml(user.id)}" ${['admin','super_admin'].includes(currentAdmin?.role) ? '' : 'disabled'}><option value="customer" ${user.role === 'customer' ? 'selected' : ''}>Customer</option><option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Manager</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option><option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>Super admin</option></select></td><td>${escapeHtml(formatDate(user.createdAt))}</td></tr>`).join(''); $$('[data-user-role]', tbody).forEach(select => select.addEventListener('change', async () => { try { await api(`/admin/users/${select.dataset.userRole}/role`, { method: 'PATCH', body: JSON.stringify({ role: select.value }) }); toast('User role updated.', 'success'); } catch (error) { toast(error.message || 'Unable to update role.', 'error'); await loadUsers(); } })); }

function renderTours() { const tbody = $('#adminTourTable'); $('#adminEmpty').hidden = tours.length > 0; tbody.innerHTML = tours.map(tour => `<tr><td><div class="table-title"><img class="table-thumb" src="${escapeHtml(tour.imageUrl || '/assets/images__maldives.jpg')}" alt="" /><div><strong>${escapeHtml(tour.title)}</strong><span>${escapeHtml(tour.country)} · ${escapeHtml(tour.destinations.join(', '))}</span></div></div></td><td>${escapeHtml(tour.tourType)}</td><td>${escapeHtml(tour.durationDays)}D / ${escapeHtml(tour.durationNights)}N</td><td>${formatMoney(tour.priceBdt)}</td><td><span class="status-pill status-${escapeHtml(tour.status)}">${escapeHtml(tour.status)}</span></td><td><div class="table-actions"><button class="table-action" data-edit="${escapeHtml(tour.id)}">Edit</button>${tour.status !== 'archived' ? `<button class="table-action danger" data-archive="${escapeHtml(tour.id)}">Archive</button>` : ''}</div></td></tr>`).join(''); $$('[data-edit]', tbody).forEach(button => button.addEventListener('click', () => { const tour = tours.find(item => item.id === button.dataset.edit); if (tour) fillEditor(tour); })); $$('[data-archive]', tbody).forEach(button => button.addEventListener('click', () => void archiveTour(button.dataset.archive))); }
async function loadTours() { const query = new URLSearchParams(); const search = $('#adminTourSearch').value.trim(); const status = $('#adminStatusFilter').value; if (search) query.set('q', search); if (status) query.set('status', status); const response = await api(`/admin/tours?${query}`); tours = response.tours || []; renderTours(); }
async function archiveTour(id) { const tour = tours.find(item => item.id === id); if (!tour || !window.confirm(`Archive “${tour.title}”?`)) return; try { await api(`/admin/tours/${id}`, { method: 'DELETE' }); toast('Tour archived.', 'success'); await Promise.all([loadStats(), loadTours()]); } catch (error) { toast(error.message || 'Unable to archive tour.', 'error'); } }
function resetEditor() { $('#editTourId').value = ''; $('#editorTitle').textContent = 'New tour package'; $('#editorSubtitle').textContent = 'Add a package to the Sadik Travels catalogue.'; $('#tourEditorForm').reset(); $('#editCountry').value = 'Bangladesh'; $('#editDays').value = 3; $('#editNights').value = 2; $('#editPrice').value = 6500; $('#editStatus').value = 'draft'; $('#editFeatured').checked = false; }
function fillEditor(tour) { $('#editTourId').value = tour.id; $('#editorTitle').textContent = 'Edit tour package'; $('#editorSubtitle').textContent = 'Update the package and publish changes.'; $('#editTitle').value = tour.title; $('#editSlug').value = tour.slug; $('#editCountry').value = tour.country; $('#editTourType').value = tour.tourType; $('#editDestinations').value = tour.destinations.join(', '); $('#editDays').value = tour.durationDays; $('#editNights').value = tour.durationNights; $('#editPrice').value = tour.priceBdt; $('#editImage').value = tour.imageUrl; $('#editDescription').value = tour.description; $('#editStatus').value = tour.status; $('#editFeatured').checked = tour.featured; $('#tourEditorPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
$('#tourEditorForm')?.addEventListener('submit', async event => { event.preventDefault(); const id = $('#editTourId').value; const payload = { title: $('#editTitle').value.trim(), slug: $('#editSlug').value.trim(), country: $('#editCountry').value.trim(), tourType: $('#editTourType').value, destinations: $('#editDestinations').value.split(',').map(item => item.trim()).filter(Boolean), durationDays: Number($('#editDays').value), durationNights: Number($('#editNights').value), priceBdt: Number($('#editPrice').value), imageUrl: $('#editImage').value.trim(), description: $('#editDescription').value.trim(), status: $('#editStatus').value, featured: $('#editFeatured').checked }; const button = $('#saveTourBtn'); setLoading(button, true); try { await api(id ? `/admin/tours/${id}` : '/admin/tours', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); toast(id ? 'Tour updated.' : 'Tour created.', 'success'); resetEditor(); await Promise.all([loadStats(), loadTours()]); } catch (error) { toast(error.message || 'Unable to save tour.', 'error'); } finally { setLoading(button, false); } });

async function loadTickets() { const query = new URLSearchParams(); const q = $('#adminTicketSearch')?.value.trim(); const status = $('#adminTicketStatus')?.value; if (q) query.set('q', q); if (status) query.set('status', status); const response = await api(`/admin/tickets?${query}`); tickets = response.tickets || []; const tbody = $('#adminTicketTable'); $('#adminTicketEmpty').hidden = tickets.length > 0; tbody.innerHTML = tickets.map(ticket => `<tr><td><strong>${escapeHtml(ticket.id.slice(0, 8).toUpperCase())}</strong><small>${escapeHtml(formatDate(ticket.createdAt))}</small></td><td>${escapeHtml(ticket.name)}<small>${escapeHtml(ticket.email)} · ${escapeHtml(ticket.mobile)}</small></td><td>${escapeHtml(ticket.subject)}</td><td><select class="ticket-status-select status-${escapeHtml(ticket.status)}" data-ticket-status="${escapeHtml(ticket.id)}"><option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Open</option><option value="pending" ${ticket.status === 'pending' ? 'selected' : ''}>Pending</option><option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>Closed</option></select></td><td>${escapeHtml(formatDate(ticket.updatedAt))}</td><td></td></tr>`).join(''); $$('[data-ticket-status]', tbody).forEach(select => select.addEventListener('change', async () => { try { await api(`/admin/tickets/${select.dataset.ticketStatus}`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) }); toast('Ticket status updated.', 'success'); await Promise.all([loadTickets(), loadStats()]); } catch (error) { toast(error.message || 'Unable to update ticket.', 'error'); await loadTickets(); } })); }

function resetContentEditor() { $('#editContentId').value = ''; $('#contentEditorForm')?.reset(); $('#editContentType').value = 'homepage'; $('#editContentStatus').value = 'draft'; $('#editContentSort').value = 0; $('#saveContentBtn').textContent = 'Save content'; }
function fillContentEditor(item) { $('#editContentId').value = item.id; $('#editContentType').value = item.type; $('#editContentTitle').value = item.title; $('#editContentSlug').value = item.slug; $('#editContentSubtitle').value = item.subtitle || ''; $('#editContentImage').value = item.imageUrl || ''; $('#editContentDescription').value = item.description || ''; $('#editContentStatus').value = item.status; $('#editContentSort').value = item.sortOrder; $('#saveContentBtn').textContent = 'Update content'; $('#adminContentPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function renderContent() { const list = $('#adminContentList'); $('#adminContentEmpty').hidden = contentItems.length > 0; $('#contentCount').textContent = `${contentItems.length} item${contentItems.length === 1 ? '' : 's'}`; list.innerHTML = contentItems.map(item => `<article class="content-list-item"><div><span class="content-type">${escapeHtml(item.type)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.subtitle || item.description || 'No description')}</p></div><div class="content-item-actions"><span class="status-pill status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span><button class="table-action" data-edit-content="${escapeHtml(item.id)}">Edit</button>${item.status !== 'archived' ? `<button class="table-action danger" data-archive-content="${escapeHtml(item.id)}">Archive</button>` : ''}</div></article>`).join(''); $$('[data-edit-content]', list).forEach(button => button.addEventListener('click', () => { const item = contentItems.find(entry => entry.id === button.dataset.editContent); if (item) fillContentEditor(item); })); $$('[data-archive-content]', list).forEach(button => button.addEventListener('click', () => void archiveContent(button.dataset.archiveContent))); }
async function loadContent() { const query = new URLSearchParams(); const q = $('#adminContentSearch')?.value.trim(); const type = $('#adminContentType')?.value; if (q) query.set('q', q); if (type) query.set('type', type); const response = await api(`/admin/content?${query}`); contentItems = response.content || []; renderContent(); }
async function archiveContent(id) { const item = contentItems.find(entry => entry.id === id); if (!item || !window.confirm(`Archive “${item.title}”?`)) return; try { await api(`/admin/content/${id}`, { method: 'DELETE' }); toast('Content archived.', 'success'); await loadContent(); } catch (error) { toast(error.message || 'Unable to archive content.', 'error'); } }
$('#contentEditorForm')?.addEventListener('submit', async event => { event.preventDefault(); const id = $('#editContentId').value; const payload = { type: $('#editContentType').value, title: $('#editContentTitle').value.trim(), slug: $('#editContentSlug').value.trim(), subtitle: $('#editContentSubtitle').value.trim(), imageUrl: $('#editContentImage').value.trim(), description: $('#editContentDescription').value.trim(), status: $('#editContentStatus').value, sortOrder: Number($('#editContentSort').value) || 0, metadata: {} }; const button = $('#saveContentBtn'); setLoading(button, true); try { await api(id ? `/admin/content/${id}` : '/admin/content', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); toast(id ? 'Content updated.' : 'Content created.', 'success'); resetContentEditor(); await loadContent(); } catch (error) { toast(error.message || 'Unable to save content.', 'error'); } finally { setLoading(button, false); } });

$('#newTourBtn')?.addEventListener('click', () => { resetEditor(); $('#tourEditorPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('#cancelEditBtn')?.addEventListener('click', resetEditor); $('#cancelEditBtn2')?.addEventListener('click', resetEditor); $('#resetContentBtn')?.addEventListener('click', resetContentEditor);
$('#adminTourSearch')?.addEventListener('input', () => { clearTimeout(filterTimer); filterTimer = setTimeout(() => void loadTours(), 250); }); $('#adminStatusFilter')?.addEventListener('change', () => void loadTours());
$('#adminBookingSearch')?.addEventListener('input', () => { clearTimeout(filterTimer); filterTimer = setTimeout(() => { bookingPage = 1; void loadBookings(); }, 250); }); $('#adminBookingStatus')?.addEventListener('change', () => { bookingPage = 1; void loadBookings(); }); $('#adminBookingVertical')?.addEventListener('change', () => { bookingPage = 1; void loadBookings(); }); $('#bookingPrev')?.addEventListener('click', () => { if (bookingPage > 1) { bookingPage -= 1; void loadBookings(); } }); $('#bookingNext')?.addEventListener('click', () => { if (bookingPage < bookingPageCount) { bookingPage += 1; void loadBookings(); } });
$('#adminTicketSearch')?.addEventListener('input', () => { clearTimeout(filterTimer); filterTimer = setTimeout(() => void loadTickets(), 250); }); $('#adminTicketStatus')?.addEventListener('change', () => void loadTickets()); $('#adminContentSearch')?.addEventListener('input', () => { clearTimeout(filterTimer); filterTimer = setTimeout(() => void loadContent(), 250); }); $('#adminContentType')?.addEventListener('change', () => void loadContent());
$('#notificationAllUsers')?.addEventListener('change', event => { $('#notificationIdentity').disabled = event.target.checked; if (event.target.checked) $('#notificationIdentity').value = ''; });
$('#notificationForm')?.addEventListener('submit', async event => { event.preventDefault(); const allUsers = $('#notificationAllUsers').checked; const identity = $('#notificationIdentity').value.trim(); if (!allUsers && !identity) { toast('Enter a recipient or choose all active users.', 'error'); return; } const channels = $$('input[name="notificationChannel"]:checked').map(input => input.value); if (!channels.length) { toast('Select at least one channel.', 'error'); return; } const button = $('#sendNotificationBtn'); setLoading(button, true); try { const result = await api('/admin/notifications', { method: 'POST', body: JSON.stringify({ identity: identity || undefined, allUsers, title: $('#notificationTitle').value.trim(), message: $('#notificationMessage').value.trim(), channels }) }); toast(`Notification saved for ${result.sent} recipient${result.sent === 1 ? '' : 's'}.`, 'success'); $('#notificationForm').reset(); $('#notificationIdentity').disabled = false; } catch (error) { toast(error.message || 'Unable to send notification.', 'error'); } finally { setLoading(button, false); } });
$('#settingsForm')?.addEventListener('submit', saveSettings); $('#testSmsBtn')?.addEventListener('click', () => void testSms()); $('#testEmailBtn')?.addEventListener('click', () => void testEmail());
$$('[data-settings-tab]').forEach(button => button.addEventListener('click', () => { const name = button.dataset.settingsTab; $$('[data-settings-tab]').forEach(item => item.classList.toggle('active', item === button)); $$('[data-settings-pane]').forEach(pane => pane.classList.toggle('active', pane.dataset.settingsPane === name)); }));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeBookingDrawer(); });

initAuthScene();
void loadWorkspace();
