/**
 * Thin fetch wrapper. The base URL comes from a Vite env var at build time:
 *   VITE_API_BASE_URL=https://datapulse-api.onrender.com/api  (production)
 * In development the Vite dev-server proxies /api to localhost:5000.
 */
const BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const TOKEN_KEY = 'datapulse.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiRequestError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, { method = 'GET', body, query, headers = {}, raw = false } = {}) {
  let url = `${BASE}${path}`;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  const token = tokenStore.get();
  const init = { method, headers: { ...headers } };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !(body instanceof FormData)) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    init.body = body;
  }

  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiRequestError('Cannot reach the server. Check your connection and try again.', 0, 'NETWORK');
  }
  if (res.status === 204) return null;
  if (raw) return res;

  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.error?.message || `Request failed (${res.status}).`;
    if (res.status === 401 && onUnauthorized && token) onUnauthorized();
    throw new ApiRequestError(msg, res.status, data?.error?.code);
  }
  return data;
}

/** XHR-based upload so we can report real upload progress. */
export function uploadWithProgress(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}${path}`);
    const token = tokenStore.get();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new ApiRequestError('Upload failed. Check your connection.', 0, 'NETWORK'));
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiRequestError(data?.error?.message || `Upload failed (${xhr.status}).`, xhr.status, data?.error?.code));
    };
    xhr.send(formData);
  });
}

export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  me: () => request('/auth/me'),
  updateProfile: (body) => request('/auth/me', { method: 'PATCH', body }),
  deleteAccount: (password) => request('/auth/me', { method: 'DELETE', body: { password } }),

  listDatasets: (page = 1, limit = 20) => request('/datasets', { query: { page, limit } }),
  getDataset: (id) => request(`/datasets/${id}`),
  renameDataset: (id, name) => request(`/datasets/${id}`, { method: 'PATCH', body: { name } }),
  deleteDataset: (id) => request(`/datasets/${id}`, { method: 'DELETE' }),
  getChunk: (id, index) => request(`/datasets/${id}/chunks/${index}`),
  getTransformations: (id) => request(`/datasets/${id}/transformations`),
  saveTransformations: (id, operations) => request(`/datasets/${id}/transformations`, { method: 'PUT', body: { operations } }),

  listDashboards: (datasetId) => request('/dashboards', { query: { datasetId } }),
  getDashboard: (id) => request(`/dashboards/${id}`),
  createDashboard: (body) => request('/dashboards', { method: 'POST', body }),
  updateDashboard: (id, body) => request(`/dashboards/${id}`, { method: 'PATCH', body }),
  duplicateDashboard: (id, name) => request(`/dashboards/${id}/duplicate`, { method: 'POST', body: name ? { name } : {} }),
  deleteDashboard: (id) => request(`/dashboards/${id}`, { method: 'DELETE' }),

  listReports: () => request('/reports'),
  getReport: (id) => request(`/reports/${id}`),
  createReport: (body) => request('/reports', { method: 'POST', body }),
  deleteReport: (id) => request(`/reports/${id}`, { method: 'DELETE' }),

  aiStatus: () => request('/ai/status'),
  askAI: (body) => request('/ai/ask', { method: 'POST', body }),
  health: () => request('/health'),
};

export { request };
