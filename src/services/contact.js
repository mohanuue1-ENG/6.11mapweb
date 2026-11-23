// Contact details shown in the footer and on the Contact page. They come from the build settings
// (VITE_CONTACT_EMAIL, VITE_CONTACT_PHONE, VITE_CONTACT_ADDRESS); nothing is invented here.
export const CONTACT = {
  email: import.meta.env.VITE_CONTACT_EMAIL || '',
  phone: import.meta.env.VITE_CONTACT_PHONE || '',
  address: import.meta.env.VITE_CONTACT_ADDRESS || '',
};
export const hasContact = Boolean(CONTACT.email || CONTACT.phone || CONTACT.address);
