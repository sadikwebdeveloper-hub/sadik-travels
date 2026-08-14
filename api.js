/* Shared same-origin API client for the Sadik Travels website and admin console. */
(() => {
  const bodyConfig = document.body?.dataset || {};
  const config = window.APP_CONFIG || {};
  const baseUrl = config.apiBase || bodyConfig.apiBase || '/api/v1';

  async function request(path, options = {}, canRefresh = true) {
    const requestOptions = { credentials: 'include', headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options };
    const relativePath = path.startsWith(baseUrl) ? path.slice(baseUrl.length) || '/' : (path.startsWith('/') ? path : `/${path}`);
    const response = await fetch(`${baseUrl}${relativePath}`, requestOptions);
    let payload = {};
    try { payload = await response.json(); } catch { /* empty response */ }
    if (response.status === 401 && canRefresh && !path.startsWith('/auth/')) {
      try { await request('/auth/refresh', { method: 'POST' }, false); return request(path, options, false); } catch { /* keep original auth error */ }
    }
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `Request failed (${response.status})`);
      error.status = response.status;
      error.code = payload?.error?.code;
      error.details = payload?.error?.details;
      throw error;
    }
    return payload;
  }

  window.SadikApi = Object.freeze({ baseUrl, request, get: path => request(path), post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }), patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }), delete: path => request(path, { method: 'DELETE' }) });
})();
