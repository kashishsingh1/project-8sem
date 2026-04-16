import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import api from '../lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  org_id: string;
  org_name: string;
  permissions: string[];
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextType extends AuthState {
  login: (token: string, user: User) => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('planai_token'),
    loading: !!localStorage.getItem('planai_token'),
  });

  useEffect(() => {
    async function initAuth() {
      const storedToken = localStorage.getItem('planai_token');
      
      if (storedToken) {
        try {
          console.log('[Auth] Verifying session...');
          const res = await api.get('/auth/me');
          setState({
            user: res.data,
            token: storedToken,
            loading: false
          });
        } catch (error) {
          console.error('[Auth] Session invalid:', error);
          localStorage.removeItem('planai_token');
          setState({ user: null, token: null, loading: false });
        }
      } else {
        setState(s => ({ ...s, loading: false }));
      }
    }

    initAuth();
  }, []);

  const login = (newToken: string, newUser: User) => {
    console.log('[Auth] Finalizing login for:', newUser.email);
    localStorage.setItem('planai_token', newToken);
    
    // Atomic update of all auth variables
    setState({
      user: newUser,
      token: newToken,
      loading: false,
    });
  };

  const logout = () => {
    console.log('[Auth] Logout initiated');
    localStorage.removeItem('planai_token');
    setState({ user: null, token: null, loading: false });
  };

  const hasPermission = (permission: string) => {
    if (!state.user || !state.user.permissions) return false;
    return state.user.permissions.includes(permission) || state.user.permissions.includes('*');
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
