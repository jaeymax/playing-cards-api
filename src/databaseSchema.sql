

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
    is_rated BOOLEAN DEFAULT false,
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
    current_turn_user_id INTEGER REFERENCES users(id),
    turn_started_at TIMESTAMP WITH TIME ZONE,
    turn_timeout_seconds INTEGER DEFAULT 30,
    forfeited_by INTEGER REFERENCES users(id),
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
  type VARCHAR(50) CHECK (type IN ('friend', 'challenge', 'reward', 'tournament', 'system')) NOT NULL,
  message TEXT NOT NULL, -- The notification content
  title VARCHAR(100) NOT NULL,
  is_read BOOLEAN DEFAULT FALSE, -- Whether the user has seen it
  action TEXT NOT NULL,
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

CREATE TABLE tournaments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    registration_closing_date TIMESTAMP WITH TIME ZONE NOT NULL,
    is_current BOOLEAN DEFAULT false,
    registration_fee NUMERIC(10,2) DEFAULT '0.00'
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')) DEFAULT 'upcoming',
    format VARCHAR(50) NOT NULL, -- e.g., 'single_elimination', 'round_robin'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    prize INTEGER DEFAULT 0
);

CREATE TABLE tournament_participants (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    registration_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) CHECK (status IN ('registered', 'eliminated', 'winner')) DEFAULT 'registered',
    UNIQUE(tournament_id, user_id) -- Prevent duplicate registrations
);

CREATE TABLE tournament_matches (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    round_id INTEGER NOT NULL REFERENCES tournament_rounds(id) ON DELETE CASCADE,
    player1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    player2_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) CHECK (status IN ('pending', 'in_progress', 'completed', 'forfeited')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    match_order INTEGER NOT NULL, -- position in bracket
    UNIQUE(tournament_id, game_id) -- Prevent duplicate game entries in a tournament
);

CREATE TABLE tournament_rounds (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    status VARCHAR(20)
      CHECK (status IN ('pending', 'ongoing', 'completed'))
      DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tournament_id, round_number)
);

CREATE TABLE wallets (
     id SERIAL PRIMARY KEY,
     user_id INTEGER UNIQUE references users(id) ON DELETE CASCADE,
     balance NUMERIC(12, 2) DEFAULT 0.00,
     currency VARCHAR(3) DEFAULT 'GHS',
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);  

CREATE TABLE wallet_transactions(
    id SERIAL INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) CHECK (type IN ('tournament_prize', 'withdrawal', 'refund')),
    amount  NUMERIC(12, 2) NOT NULL,
    reference VARCHAR(100),
    status VARCHAR(20) CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payout_methods (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    type VARCHAR(20) CHECK (type IN ('mobile_money', 'bank_transfer')) NOT NULL,

    provider VARCHAR(20) NOT NULL, -- MTN, VODAFONE, AIRTELTIGO

    account_number VARCHAR(50) NOT NULL,
    account_name VARCHAR(100) NOT NULL,

    recipient_code VARCHAR(100) NOT NULL, -- From Paystack

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(user_id)
);

CREATE TABLE tournament_rules (
    id SERIAL PRIMARY KEY,
    tournament_id NOT NULL INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
    title VARCHAR(20) NOT NULL,
    message TEXT NOT NULL
);