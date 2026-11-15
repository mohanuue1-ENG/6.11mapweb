-- "Create account" comes first: the person chooses their password before the company is set up.
-- Only a bcrypt hash is kept, on the request, and it becomes the administrator's password when the
-- company is created (payment confirmed or request approved). Requests made without one keep the
-- earlier behaviour: a one-time link to choose a password.
ALTER TABLE registration_requests ADD COLUMN password_hash text;
