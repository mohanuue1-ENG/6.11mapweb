import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from '../services/api';

const AuthContext = createContext();

// The dashboard pages were written against the prototype's company shape.
function toCompany(c) {
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    isInternal: c.isInternal,
    email: c.contactEmail,
    phone: c.contactPhone,
    address: c.address,
    dotNumber: c.dotNumber,
    mcNumber: c.mcNumber,
    createdAt: c.createdAt,
  };
}

export const homePathFor = (role) =>
  role === 'SUPER_ADMIN' ? '/superadmin' : role === 'DRIVER' ? '/driver/portal' : '/company/dashboard';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [usage, setUsage] = useState(null);
  // True until we know whether the browser already holds a valid session.
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setCompany(null);
    setUsage(null);
  }, []);

  // Stores the tokens from login/register/refresh and loads the company.
  const applySession = useCallback(async (data) => {
    setAccessToken(data.accessToken);
    let comp = null;
    let use = null;
    if (data.user.role === 'COMPANY_ADMIN') {
      try {
        const res = await api('/companies/me');
        comp = toCompany(res.company);
        use = res.usage;
      } catch {
        comp = null;
      }
    }
    setUsage(use);
    const sessionUser = { ...data.user, isInternal: !!comp?.isInternal };
    setCompany(comp);
    setUser(sessionUser);
    return sessionUser;
  }, []);

  // Restore the session after a page reload.
  useEffect(() => {
    // The prototype kept a fake session here; it must never be trusted again.
    try {
      localStorage.removeItem('611_auth_session');
    } catch {
      /* storage unavailable */
    }
    setSessionExpiredHandler(clearSession);
    let cancelled = false;
    refreshSession()
      .then((data) => (cancelled ? null : applySession(data)))
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession]);

  // A browser that confirmed a code and was remembered skips the code for 30 days.
  const deviceKey = (email) => `611_device:${String(email).trim().toLowerCase()}`;
  const readDevice = (email) => {
    try {
      return localStorage.getItem(deviceKey(email)) || undefined;
    } catch {
      return undefined;
    }
  };

  // Returns the signed-in user, or { verification } when an emailed code is needed first.
  const login = useCallback(
    async (email, password) => {
      const deviceToken = readDevice(email);
      const data = await api('/auth/login', { method: 'POST', auth: false, body: { email, password, ...(deviceToken ? { deviceToken } : {}) } });
      if (data.verificationRequired) {
        return { verification: { challengeId: data.challengeId, hint: data.hint, devCode: data.devCode } };
      }
      return applySession(data);
    },
    [applySession],
  );

  // The second step: the code from the email. "remember" keeps this browser verified for 30 days.
  const verifyLogin = useCallback(
    async (email, challengeId, code, remember) => {
      const data = await api('/auth/login/verify', { method: 'POST', auth: false, body: { challengeId, code, remember: !!remember } });
      if (data.deviceToken) {
        try {
          localStorage.setItem(deviceKey(email), data.deviceToken);
        } catch {
          /* storage unavailable: the code is asked again next time */
        }
      }
      return applySession(data);
    },
    [applySession],
  );

  // "Continue with Google": a known account is signed in; an unknown address is returned so "Create account" can start with it.
  const loginWithGoogle = useCallback(
    async (credential) => {
      const data = await api('/auth/google', { method: 'POST', auth: false, body: { credential } });
      if (data.newUser) return { newUser: true, email: data.email, name: data.name };
      return applySession(data);
    },
    [applySession],
  );

  const register = useCallback(
    async (fields) => {
      const data = await api('/auth/register', { method: 'POST', auth: false, body: fields });
      return applySession(data);
    },
    [applySession],
  );

  // The plan was paid: the dashboard opens without signing in again.
  const markSubscribed = useCallback(() => setUser((u) => (u ? { ...u, subscribed: true } : u)), []);

  // The company told us about itself: ask for the dashboard now, and remember the company.
  const markSetupDone = useCallback((c) => {
    if (c) setCompany(toCompany(c));
    setUser((u) => (u ? { ...u, needsSetup: false, companyName: c?.name || u.companyName } : u));
  }, []);

  // Re-reads the company and its truck usage (Company Admin only).
  const reloadCompany = useCallback(async () => {
    const res = await api('/companies/me');
    setCompany(toCompany(res.company));
    setUsage(res.usage);
  }, []);

  const updateCompany = useCallback(async (fields) => {
    const res = await api('/companies/me', { method: 'PATCH', body: fields });
    const comp = toCompany(res.company);
    setCompany(comp);
    setUser((u) => (u ? { ...u, companyName: comp.name } : u));
    return comp;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', auth: false });
    } catch {
      /* the local session is cleared either way */
    }
    clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider
      value={{
        user,
        company,
        usage,
        reloadCompany,
        updateCompany,
        loading,
        login,
        verifyLogin,
        loginWithGoogle,
        register,
        markSubscribed,
        markSetupDone,
        logout,
        isSuperAdmin: user?.role === 'SUPER_ADMIN',
        isCompanyAdmin: user?.role === 'COMPANY_ADMIN',
        isDriver: user?.role === 'DRIVER',
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
