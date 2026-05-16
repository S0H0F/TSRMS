/**
 * RailWay SA — API Client
 * Connects frontend to the Node.js backend
 */

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'
  : '/api';  // Same origin on AWS

const RW_API = {
  /* ── Token helpers ── */
  getToken()  { return localStorage.getItem('rw-token'); },
  getRefresh(){ return localStorage.getItem('rw-refresh'); },
  setTokens(access, refresh) {
    localStorage.setItem('rw-token', access);
    if (refresh) localStorage.setItem('rw-refresh', refresh);
  },
  clearTokens() {
    localStorage.removeItem('rw-token');
    localStorage.removeItem('rw-refresh');
    localStorage.removeItem('rw-user');
  },

  /* ── Core fetch ── */
  async request(method, path, body = null, retried = false) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });

    // Auto-refresh on 401 TOKEN_EXPIRED
    if (res.status === 401 && !retried) {
      const data = await res.json().catch(() => ({}));
      if (data.code === 'TOKEN_EXPIRED') {
        const refreshed = await this.refreshToken();
        if (refreshed) return this.request(method, path, body, true);
      }
      this.clearTokens();
      window.location.href = 'login.html';
      return null;
    }

    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.message || 'Request failed'), { status: res.status, data });
    return data;
  },

  async refreshToken() {
    const refresh = this.getRefresh();
    if (!refresh) return false;
    try {
      const data = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      }).then(r => r.json());
      if (data.success) { localStorage.setItem('rw-token', data.accessToken); return true; }
    } catch (_) {}
    return false;
  },

  get(path)          { return this.request('GET', path); },
  post(path, body)   { return this.request('POST', path, body); },
  put(path, body)    { return this.request('PUT', path, body); },
  delete(path, body) { return this.request('DELETE', path, body); },

  /* ── Auth ── */
  async login(email, password, role) {
    const data = await this.post('/auth/login', { email, password, role });
    this.setTokens(data.accessToken, data.refreshToken);
    localStorage.setItem('rw-user', JSON.stringify(data.user));
    return data;
  },

  async loginNafath(nationalId, role) {
    const data = await this.post('/auth/nafath', { nationalId, role });
    this.setTokens(data.accessToken, data.refreshToken);
    localStorage.setItem('rw-user', JSON.stringify(data.user));
    return data;
  },

  async logout() {
    const refresh = this.getRefresh();
    try { await this.post('/auth/logout', { refreshToken: refresh }); } catch (_) {}
    this.clearTokens();
    window.location.href = 'login.html';
  },

  /* ── Schedules ── */
  getSchedules(params = {})     { return this.get('/schedules?' + new URLSearchParams(params)); },
  getSchedule(id)               { return this.get(`/schedules/${id}`); },
  getSeats(scheduleId)          { return this.get(`/schedules/${scheduleId}/seats`); },
  createSchedule(data)          { return this.post('/schedules', data); },
  updateSchedule(id, data)      { return this.put(`/schedules/${id}`, data); },
  deleteSchedule(id)            { return this.delete(`/schedules/${id}`); },

  /* ── Bookings ── */
  getBookings(params = {})      { return this.get('/bookings?' + new URLSearchParams(params)); },
  getBooking(ref)               { return this.get(`/bookings/${ref}`); },
  getBookingQR(ref)             { return this.get(`/bookings/${ref}/qr`); },
  createBooking(data)           { return this.post('/bookings', data); },
  cancelBooking(ref, reason)    { return this.delete(`/bookings/${ref}`, { reason }); },

  /* ── Routes ── */
  getRoutes(params = {})        { return this.get('/routes?' + new URLSearchParams(params)); },
  getRoute(id)                  { return this.get(`/routes/${id}`); },
  getStations()                 { return this.get('/routes/stations/all'); },
  createRoute(data)             { return this.post('/routes', data); },
  updateRoute(id, data)         { return this.put(`/routes/${id}`, data); },
  deleteRoute(id)               { return this.delete(`/routes/${id}`); },

  /* ── Users ── */
  getUsers(params = {})         { return this.get('/users?' + new URLSearchParams(params)); },
  getUser(id)                   { return this.get(`/users/${id}`); },
  createUser(data)              { return this.post('/users', data); },
  updateUser(id, data)          { return this.put(`/users/${id}`, data); },
  deleteUser(id)                { return this.delete(`/users/${id}`); },

  /* ── Dashboard ── */
  getOverview()                 { return this.get('/dashboard/overview'); },
  getRevenueTrend(days = 7)     { return this.get(`/dashboard/revenue-trend?days=${days}`); },
  getRoutePerformance()         { return this.get('/dashboard/route-performance'); },
  getOccupancyLive()            { return this.get('/dashboard/occupancy-live'); },
  getTopStations()              { return this.get('/dashboard/top-stations'); },
};

// Expose globally
window.RW_API = RW_API;
