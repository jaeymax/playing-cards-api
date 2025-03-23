CREATE TABLE password_reset_tokens (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL
);