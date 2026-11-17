-- The driver gives the number their company set for them (the driver number), then their own name and email.
-- The company no longer records an email for the driver, and a forgotten password also gets an emailed code.
DROP INDEX IF EXISTS drivers_email_idx;
ALTER TABLE drivers DROP COLUMN IF EXISTS email;

ALTER TABLE verification_codes DROP CONSTRAINT IF EXISTS sms_codes_purpose_check;
ALTER TABLE verification_codes ADD CONSTRAINT verification_codes_purpose_check CHECK (purpose IN ('register', 'login', 'reset'));
