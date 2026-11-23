import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const NAME = '6.11 TruckOS';
const TITLES = {
  '/': `${NAME} | Fleet tracking for trucking companies`,
  '/features': `Features | ${NAME}`,
  '/pricing': `Pricing | ${NAME}`,
  '/about': `About | ${NAME}`,
  '/download': `Get the app | ${NAME}`,
  '/contact': `Contact | ${NAME}`,
  '/login': `Sign in | ${NAME}`,
  '/create-account': `Create account | ${NAME}`,
};

// Each page has its own title (in the browser tab and in Google), and always carries the name of the site.
export default function PageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const last = pathname.split('/').filter(Boolean).pop() || '';
    const nice = last.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
    document.title = TITLES[pathname] || (nice ? `${nice} | ${NAME}` : NAME);
  }, [pathname]);
  return null;
}
