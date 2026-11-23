import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  // Theme can be 'light' (Day Mode - Primary/Default per PRD v2.0), 'dark', or 'system'
  const [themeSetting, setThemeSetting] = useState(() => {
    return localStorage.getItem('611_theme_setting') || 'light';
  });

  const [resolvedTheme, setResolvedTheme] = useState('light');

  useEffect(() => {
    const applyTheme = (isDark) => {
      const root = document.documentElement;
      // Switch at once: no element fades from the old colours while the others have already changed.
      root.classList.add('no-transitions');
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-transitions')));
      if (isDark) {
        root.classList.add('dark');
        root.classList.remove('light');
        setResolvedTheme('dark');
      } else {
        root.classList.add('light');
        root.classList.remove('dark');
        setResolvedTheme('light');
      }
    };

    if (themeSetting === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mediaQuery.matches);

      const handler = (e) => applyTheme(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      applyTheme(themeSetting === 'dark');
    }

    localStorage.setItem('611_theme_setting', themeSetting);
  }, [themeSetting]);

  const toggleTheme = () => {
    // Quick toggle between dark and light
    setThemeSetting((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider
      value={{
        themeSetting,
        setThemeSetting,
        theme: resolvedTheme,
        isDark: resolvedTheme === 'dark',
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
