UPDATE applicant_tokens
SET expires_at = GREATEST(expires_at, NOW() + INTERVAL '30 days')
WHERE expires_at > NOW();

UPDATE admin_tokens
SET expires_at = GREATEST(expires_at, NOW() + INTERVAL '30 days')
WHERE expires_at > NOW();
