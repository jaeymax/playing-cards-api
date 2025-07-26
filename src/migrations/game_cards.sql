-- Add position tracking columns to game_cards
ALTER TABLE game_cards 
ADD COLUMN pos_x INTEGER DEFAULT 0,
ADD COLUMN pos_y INTEGER DEFAULT 0,
ADD COLUMN rotation INTEGER DEFAULT 0,
ADD COLUMN z_index INTEGER DEFAULT 0;

-- Add animation tracking
ALTER TABLE game_cards
ADD COLUMN animation_state VARCHAR(20) DEFAULT 'idle' CHECK (
    animation_state IN ('idle', 'dealing', 'playing', 'discarding')
);