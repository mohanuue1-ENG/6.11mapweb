-- Sign-up and sign-in codes are sent by email, to the address the company put on the driver profile
-- (text messages were not available). The code table is renamed to say what it now holds.
ALTER TABLE drivers ADD COLUMN email text;
CREATE INDEX drivers_email_idx ON drivers (lower(email)) WHERE email IS NOT NULL;

ALTER TABLE sms_codes RENAME TO verification_codes;
ALTER TABLE verification_codes RENAME COLUMN phone TO target;   -- the email address the code was sent to
ALTER INDEX sms_codes_phone_idx RENAME TO verification_codes_target_idx;
