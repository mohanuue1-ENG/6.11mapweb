-- A company that created its own account (no company details yet) fills them in after it has paid.
ALTER TABLE companies ADD COLUMN needs_setup boolean NOT NULL DEFAULT false;
