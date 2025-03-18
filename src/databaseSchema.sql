

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, 
  image_url TEXT DEFAULT NULL,
  rating INTEGER DEFAULT 1000, 
  location VARCHAR(100) DEFAULT NULL,
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE games (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL, -- Unique game identifier for invites
  player1 INTEGER REFERENCES users(id) ON DELETE SET NULL,
  player2 INTEGER REFERENCES users(id) ON DELETE SET NULL,
  player3 INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Nullable for 2-player games
  player4 INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Nullable for 2-player games
  current_turn INTEGER REFERENCES users(id), -- Tracks which player's turn it is
  status VARCHAR(20) CHECK (status IN ('waiting', 'in_progress', 'completed')) DEFAULT 'waiting',
  winner INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Nullable until the game ends
  moves JSONB DEFAULT '[]', -- Stores move history
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE friends (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  friend_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) CHECK (status IN ('pending', 'accepted', 'blocked')) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, friend_id)
);


CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- User receiving the notification
  type VARCHAR(50) CHECK (type IN ('friend_request', 'game_invite', 'game_update', 'system_message')) NOT NULL,
  message TEXT NOT NULL, -- The notification content
  /*metadata JSONB DEFAULT '{}'::jsonb, -- Extra data (e.g., game_id, friend_id)*/
  is_read BOOLEAN DEFAULT FALSE, -- Whether the user has seen it
  created_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE global_chat_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- Sender of the message
  message TEXT NOT NULL, -- Message content
  created_at TIMESTAMP DEFAULT NOW() -- Time message was sent
);

CREATE TABLE game_chat_messages (
  id SERIAL PRIMARY KEY,
  game_id INTEGER REFERENCES games(id) ON DELETE CASCADE, -- Game room ID
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- Sender ID
  message TEXT NOT NULL, -- Message content
  created_at TIMESTAMP DEFAULT NOW() -- Timestamp
);


CREATE TABLE private_chat_messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
