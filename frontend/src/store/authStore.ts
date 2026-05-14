import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  departmentId?: string;
  avatarUrl?: string;
}

interface Org {
  id: string;
  name: string;
  plan: string;
  industry?: string;
  size?: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  org: Org | null;
  setAuth: (token: string, user: User, org: Org) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      org: null,
      isAuthenticated: false,
      setAuth: (token, user, org) => {
        localStorage.setItem('gr_token', token);
        set({ token, user, org, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem('gr_token');
        set({ token: null, user: null, org: null, isAuthenticated: false });
      },
    }),
    {
      name: 'gr-auth',
      partialize: (state) => ({ token: state.token, user: state.user, org: state.org, isAuthenticated: state.isAuthenticated }),
    }
  )
);
