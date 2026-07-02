import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gr_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Guard against multiple concurrent 401s all triggering a redirect
let redirectingToLogin = false;

// Handle 401 globally — preserve the current URL so login can redirect back
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !redirectingToLogin) {
      redirectingToLogin = true;
      localStorage.removeItem('gr_token');
      // Clear persisted auth store so ProtectedRoute re-evaluates correctly
      localStorage.removeItem('gr-auth');
      const current = window.location.pathname + window.location.search;
      const isLoginPage = current.startsWith('/login') || current === '/';
      window.location.href = isLoginPage
        ? '/login'
        : `/login?returnTo=${encodeURIComponent(current)}`;
    }
    return Promise.reject(err);
  }
);

export default api;
