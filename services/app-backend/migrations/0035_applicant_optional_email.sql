-- Applicants now sign in with their NIP; email is optional (the employee roster has none).
ALTER TABLE applicants ALTER COLUMN email DROP NOT NULL;
UPDATE applicants SET email = NULL WHERE email = '';
