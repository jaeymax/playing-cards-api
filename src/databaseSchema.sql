

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


-- CREATE TABLE games (
--   id SERIAL PRIMARY KEY,
--   code VARCHAR(10) UNIQUE NOT NULL, -- Unique game identifier for invites
--   player1 INTEGER REFERENCES users(id) ON DELETE SET NULL,
--   player2 INTEGER REFERENCES users(id) ON DELETE SET NULL,
--   player3 INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Nullable for 2-player games
--   player4 INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Nullable for 2-player games
--   current_turn INTEGER REFERENCES users(id), -- Tracks which player's turn it is
--   status VARCHAR(20) CHECK (status IN ('waiting', 'in_progress', 'completed')) DEFAULT 'waiting',
--   winner INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Nullable until the game ends
--   moves JSONB DEFAULT '[]', -- Stores move history
--   created_at TIMESTAMP DEFAULT NOW(),
--   updated_at TIMESTAMP DEFAULT NOW()
-- );

CREATE TABLE games (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL, -- Unique game identifier for invites
    created_by INTEGER NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL CHECK (status IN ('waiting', 'in_progress', 'completed', 'abandoned', 'cancelled')) DEFAULT 'waiting',
    current_player_position INTEGER NOT NULL DEFAULT 0,
    player_count SMALLINT NOT NULL CHECK (player_count BETWEEN 2 AND 4) DEFAULT 2,
    current_lead_suit VARCHAR(10) CHECK (current_lead_suit IN ('Clubs', 'Diamonds', 'Hearts', 'Spades', NULL)) DEFAULT NULL,
    round_number INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    win_points INTEGER DEFAULT 20,
    include_sixes BOOLEAN DEFAULT true, -- Whether to include 6s in the game
    include_aces BOOLEAN DEFAULT false, -- Whether to include Aces in the game
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (code)
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


CREATE TABLE cards (
    card_id SERIAL PRIMARY KEY,
    suit VARCHAR(10) CHECK (suit IN ('Clubs', 'Diamonds', 'Hearts', 'Spades')) NOT NULL,
    rank VARCHAR(10) CHECK (rank IN ('6', '7', '8', '9', '10', 'Jack', 'Queen', 'King')) NOT NULL,
    image_url VARCHAR(255) NOT NULL,
    value INTEGER NOT NULL -- For sorting/comparison (6=1, 7=2, ..., King=8)
);

-- Add to your existing schema
CREATE TABLE matchmaking_queue (
    queue_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    rating INTEGER DEFAULT 1000,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id) -- Prevent duplicate queue entries
);

-- Game Players Table
CREATE TABLE game_players (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    score INTEGER DEFAULT 0,
    position INTEGER NOT NULL, -- 1 for player1, 2 for player2, etc.
    is_dealer BOOLEAN DEFAULT FALSE, -- Indicates if this player is the dealer
    status VARCHAR(20) CHECK (status IN ('active', 'left')) DEFAULT 'active',  --
);

--Game Cards Table
CREATE TABLE game_cards (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id),
    card_id INTEGER NOT NULL REFERENCES cards(card_id),
    player_id INTEGER NOT NULL REFERENCES game_players(id),
    status VARCHAR(20) CHECK (status IN ('in_hand', 'played', 'in_deck', 'in_drawpile')) DEFAULT 'in_deck', ---
    trick_number INTEGER, ---
    hand_position INTEGER, -- Position in the player's hand (1, 2, 3, etc.)
);

-- CREATE TABLE tricks (
--     id SERIAL PRIMARY KEY,
--     game_id INTEGER NOT NULL REFERENCES games(id),
--     round_number INTEGER NOT NULL,
--     lead_suit VARCHAR(10) NOT NULL CHECK (
--         lead_suit IN ('Clubs', 'Diamonds', 'Hearts', 'Spades')
--     ),
--     winning_card_id INTEGER REFERENCES cards(card_id),
--     winning_player_id INTEGER REFERENCES game_players(id)
-- );