// The "Create account" step comes first; "Join us" (company, plan, payment) follows it.
// Between the two pages the details live only in this tab's session storage, and are removed once the
// sign-up is finished. The password is sent to the server over HTTPS with the rest of the form, which keeps
// only a hash of it.
const KEY = '611_signup_account';
const SEEN_KEY = '611_seen_site';

export function readDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    return d && d.name && d.email && d.password ? d : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private mode: the next page will send the person back to create the account again.
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

// True until the site has been opened once in this browser. Reading does not mark it (React may
// render twice); markSiteSeen() does, once the page is on screen.
export function isFirstVisit() {
  try {
    return !localStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
}

export function markSiteSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // nothing to remember
  }
}
