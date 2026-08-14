const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
let otpChallengeId = '';
let tours = [];
let currentAdmin = null;
const SECRET_MASK = '••••••••';
const escapeHtml = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c]));

const api = (path, options = {}) => window.SadikApi.request(path, options);
function toast(message, type = '') { const node = document.createElement('div'); node.className = `admin-toast ${type}`; node.textContent = message; $('#adminToast').appendChild(node); setTimeout(() => node.remove(), 3500); }
function setLoading(button, loading) { if (!button) return; button.disabled = loading; button.dataset.original = button.dataset.original || button.textContent; button.textContent = loading ? 'Please wait…' : button.dataset.original; }

$('#adminSendOtp').addEventListener('click', async () => {
  const identity = $('#adminIdentity').value.trim();
  if (!identity) { toast('Enter an admin mobile number or email.', 'error'); return; }
  const button = $('#adminSendOtp'); setLoading(button, true);
  try {
    const response = await api('/api/v1/auth/request-otp', { method: 'POST', body: JSON.stringify({ identity }) });
    otpChallengeId = response.challengeId;
    $('#adminOtpStep').hidden = false;
    $('#adminAuthMessage').textContent = response.devCode ? `Development code: ${response.devCode}` : `Code sent to ${response.maskedDestination}.`;
    $('#adminOtp').focus();
  } catch (error) { toast(error.message || 'Unable to send verification code.', 'error'); }
  finally { setLoading(button, false); }
});
$('#adminLoginForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!otpChallengeId) { toast('Request an OTP first.', 'error'); return; }
  const button = event.submitter || $('#adminLoginForm button[type="submit"]'); setLoading(button, true);
  try { await api('/api/v1/auth/verify-otp', { method: 'POST', body: JSON.stringify({ challengeId: otpChallengeId, code: $('#adminOtp').value.trim() }) }); await loadWorkspace(); }
  catch (error) { toast(error.message || 'Admin verification failed.', 'error'); }
  finally { setLoading(button, false); }
});
$('#logoutBtn').addEventListener('click', async () => { await api('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined); location.reload(); });

async function loadWorkspace() {
  try {
    const me = await api('/api/v1/admin/me');
    currentAdmin = me.user;
    $('#adminLoginCard').hidden = true;
    $('#adminWorkspace').hidden = false;
    $('#logoutBtn').hidden = false;
    await Promise.all([loadStats(), loadTours(), loadSettings(), loadUsers()]);
    resetEditor();
  } catch (error) {
    if (error.status === 403) toast('This account is not in the admin allowlist.', 'error');
    else if (error.status !== 401) toast(error.message || 'Unable to load admin workspace.', 'error');
  }
}
async function loadStats() {
  const response = await api('/api/v1/admin/stats');
  const stats = response.tours || {};
  $('#statTotal').textContent = stats.total ?? 0;
  $('#statPublished').textContent = stats.published ?? 0;
  $('#statDraft').textContent = stats.draft ?? 0;
  $('#statArchived').textContent = stats.archived ?? 0;
}
async function loadTours() {
  const query = new URLSearchParams();
  const search = $('#adminTourSearch').value.trim();
  const status = $('#adminStatusFilter').value;
  if (search) query.set('q', search);
  if (status) query.set('status', status);
  const response = await api(`/api/v1/admin/tours?${query}`);
  tours = response.tours || [];
  renderTours();
}
async function loadSettings() {
  const response = await api('/api/v1/admin/settings');
  (response.settings || []).forEach(item => { const field = document.querySelector(`[data-setting="${item.key}"]`); if (!field) return; if (field.type === 'checkbox') field.checked = item.value === '' || item.value === 'true'; else field.value = item.secret ? (item.masked || '') : (item.value || ''); if (item.key === 'brand_logo_url' && item.value) document.querySelectorAll('[data-brand-logo]').forEach(image => { image.src = item.value; }); if (item.secret && item.configured) field.placeholder = 'Configured — leave unchanged to keep'; });
}
async function saveSettings(event) {
  event.preventDefault();
  const payload = {};
  $$('[data-setting]').forEach(field => { if (field.type === 'checkbox') payload[field.dataset.setting] = field.checked ? 'true' : 'false'; else if (field.value && field.value !== SECRET_MASK) payload[field.dataset.setting] = field.value; });
  const button = $('#saveSettingsBtn'); setLoading(button, true);
  try { await api('/api/v1/admin/settings', { method: 'PUT', body: JSON.stringify(payload) }); $('#settingsStatus').textContent = 'Saved securely'; $('#settingsSaveMessage').textContent = 'Settings saved'; toast('Integration settings saved securely.', 'success'); await loadSettings(); }
  catch (error) { toast(error.message || 'Unable to save settings.', 'error'); }
  finally { setLoading(button, false); }
}
async function testSms() { const destination = $('#testSmsDestination').value.trim(); const message = $('#testSmsMessage').value.trim(); if (!destination || !message) { toast('Enter a test number and message.', 'error'); return; } try { await api('/api/v1/admin/settings/test-sms', { method: 'POST', body: JSON.stringify({ destination, message }) }); toast('Test SMS sent.', 'success'); } catch (error) { toast(error.message || 'Test SMS failed.', 'error'); } }
async function testEmail() { const destination = $('#testEmailDestination').value.trim(); const subject = $('#testEmailSubject').value.trim(); if (!destination) { toast('Enter a test email recipient.', 'error'); return; } try { await api('/api/v1/admin/settings/test-email', { method: 'POST', body: JSON.stringify({ destination, subject, message: 'This is a Sadik Travels SMTP test.' }) }); toast('Test email sent.', 'success'); } catch (error) { toast(error.message || 'Test email failed.', 'error'); } }
async function loadUsers() { const response = await api('/api/v1/admin/users'); const tbody = $('#adminUserTable'); if (!tbody) return; tbody.innerHTML = (response.users || []).map(user => `<tr><td><strong>${escapeHtml(user.phone || user.email || user.id)}</strong></td><td><span class="status-pill ${escapeHtml(user.status)}">${escapeHtml(user.status)}</span></td><td><select class="admin-role-select" data-user-role="${escapeHtml(user.id)}" ${currentAdmin?.role === 'admin' ? '' : 'disabled'}><option value="customer" ${user.role === 'customer' ? 'selected' : ''}>Customer</option><option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Manager</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option></select></td><td>${new Date(user.createdAt).toLocaleDateString()}</td></tr>`).join(''); $$('[data-user-role]', tbody).forEach(select => select.addEventListener('change', async () => { try { await api(`/api/v1/admin/users/${select.dataset.userRole}/role`, { method: 'PATCH', body: JSON.stringify({ role: select.value }) }); toast('User role updated.', 'success'); } catch (error) { toast(error.message || 'Unable to update role.', 'error'); await loadUsers(); } })); }

function renderTours() {
  const tbody = $('#adminTourTable');
  $('#adminEmpty').hidden = tours.length > 0;
  tbody.innerHTML = tours.map(tour => `<tr><td><div class="table-title"><img class="table-thumb" src="${escapeHtml(tour.imageUrl || '/assets/images__maldives.jpg')}" alt="" /><div><strong>${escapeHtml(tour.title)}</strong><span>${escapeHtml(tour.country)} · ${escapeHtml(tour.destinations.join(', '))}</span></div></div></td><td>${escapeHtml(tour.tourType)}</td><td>${escapeHtml(tour.durationDays)}D / ${escapeHtml(tour.durationNights)}N</td><td>৳${Number(tour.priceBdt).toLocaleString('en-BD')}</td><td><span class="status-pill ${escapeHtml(tour.status)}">${escapeHtml(tour.status)}</span></td><td><div class="table-actions"><button class="table-action" data-edit="${escapeHtml(tour.id)}">Edit</button>${tour.status !== 'archived' ? `<button class="table-action danger" data-archive="${escapeHtml(tour.id)}">Archive</button>` : ''}</div></td></tr>`).join('');
  $$('[data-edit]', tbody).forEach(button => button.addEventListener('click', () => { const tour = tours.find(item => item.id === button.dataset.edit); if (tour) fillEditor(tour); }));
  $$('[data-archive]', tbody).forEach(button => button.addEventListener('click', () => void archiveTour(button.dataset.archive)));
}
async function archiveTour(id) {
  const tour = tours.find(item => item.id === id);
  if (!tour || !window.confirm(`Archive “${tour.title}”?`)) return;
  try { await api(`/api/v1/admin/tours/${id}`, { method: 'DELETE' }); toast('Tour archived.', 'success'); await Promise.all([loadStats(), loadTours()]); }
  catch (error) { toast(error.message || 'Unable to archive tour.', 'error'); }
}
function resetEditor() {
  $('#editTourId').value = '';
  $('#editorTitle').textContent = 'New tour package';
  $('#editorSubtitle').textContent = 'Add a package to the Sadik Travels catalogue.';
  $('#tourEditorForm').reset();
  $('#editCountry').value = 'Bangladesh'; $('#editDays').value = 3; $('#editNights').value = 2; $('#editPrice').value = 6500; $('#editStatus').value = 'draft'; $('#editFeatured').checked = false;
}
function fillEditor(tour) {
  $('#editTourId').value = tour.id; $('#editorTitle').textContent = 'Edit tour package'; $('#editorSubtitle').textContent = 'Update the package and publish changes.';
  $('#editTitle').value = tour.title; $('#editSlug').value = tour.slug; $('#editCountry').value = tour.country; $('#editTourType').value = tour.tourType; $('#editDestinations').value = tour.destinations.join(', '); $('#editDays').value = tour.durationDays; $('#editNights').value = tour.durationNights; $('#editPrice').value = tour.priceBdt; $('#editImage').value = tour.imageUrl; $('#editDescription').value = tour.description; $('#editStatus').value = tour.status; $('#editFeatured').checked = tour.featured;
  $('#tourEditorPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#tourEditorForm').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('#editTourId').value;
  const payload = { title: $('#editTitle').value.trim(), slug: $('#editSlug').value.trim(), country: $('#editCountry').value.trim(), tourType: $('#editTourType').value, destinations: $('#editDestinations').value.split(',').map(item => item.trim()).filter(Boolean), durationDays: Number($('#editDays').value), durationNights: Number($('#editNights').value), priceBdt: Number($('#editPrice').value), imageUrl: $('#editImage').value.trim(), description: $('#editDescription').value.trim(), status: $('#editStatus').value, featured: $('#editFeatured').checked };
  const button = $('#saveTourBtn'); setLoading(button, true);
  try { await api(id ? `/api/v1/admin/tours/${id}` : '/api/v1/admin/tours', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); toast(id ? 'Tour updated.' : 'Tour created.', 'success'); resetEditor(); await Promise.all([loadStats(), loadTours()]); }
  catch (error) { toast(error.message || 'Unable to save tour.', 'error'); }
  finally { setLoading(button, false); }
});
$('#newTourBtn').addEventListener('click', () => { resetEditor(); $('#tourEditorPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('#cancelEditBtn').addEventListener('click', resetEditor); $('#cancelEditBtn2').addEventListener('click', resetEditor);
let filterTimer;
$('#adminTourSearch').addEventListener('input', () => { clearTimeout(filterTimer); filterTimer = setTimeout(() => void loadTours(), 250); });
$('#adminStatusFilter').addEventListener('change', () => void loadTours());
$('#notificationAllUsers').addEventListener('change', event => { $('#notificationIdentity').disabled = event.target.checked; if (event.target.checked) $('#notificationIdentity').value = ''; });
$('#notificationForm').addEventListener('submit', async event => { event.preventDefault(); const allUsers = $('#notificationAllUsers').checked; const identity = $('#notificationIdentity').value.trim(); if (!allUsers && !identity) { toast('Enter a recipient or choose all active users.', 'error'); return; } const channels = $$('input[name="notificationChannel"]:checked').map(input => input.value); if (!channels.length) { toast('Select at least one channel.', 'error'); return; } const button = $('#sendNotificationBtn'); setLoading(button, true); try { const result = await api('/api/v1/admin/notifications', { method: 'POST', body: JSON.stringify({ identity: identity || undefined, allUsers, title: $('#notificationTitle').value.trim(), message: $('#notificationMessage').value.trim(), channels }) }); toast(`Notification sent to ${result.sent} recipient${result.sent === 1 ? '' : 's'}.`, 'success'); $('#notificationForm').reset(); $('#notificationIdentity').disabled = false; } catch (error) { toast(error.message || 'Unable to send notification.', 'error'); } finally { setLoading(button, false); } });
$('#settingsForm').addEventListener('submit', saveSettings);
$('#testSmsBtn').addEventListener('click', () => void testSms());
$('#testEmailBtn').addEventListener('click', () => void testEmail());
$$('[data-settings-tab]').forEach(button => button.addEventListener('click', () => { const name = button.dataset.settingsTab; $$('[data-settings-tab]').forEach(item => item.classList.toggle('active', item === button)); $$('[data-settings-pane]').forEach(pane => pane.classList.toggle('active', pane.dataset.settingsPane === name)); }));

void loadWorkspace();
