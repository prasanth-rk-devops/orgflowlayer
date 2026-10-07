const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'orgflow_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) {
      tokenStore.clear();
      window.dispatchEvent(new Event('orgflow:logout'));
    }
    const detail = data.details?.map((d) => `${d.field}: ${d.message}`).join('; ');
    throw new ApiError(res.status, detail ? `${data.error} (${detail})` : data.error || 'Something went wrong', data.details);
  }
  return data;
}

export async function uploadFile(path, file) {
  const form = new FormData();
  form.append('file', file);
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${tokenStore.get()}` }, body: form });
  } catch { throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Upload failed');
  return data;
}

/** Authenticated download: fetch as blob, then trigger a browser save. */
export async function downloadFile(path, filename) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error || 'Download failed');
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
