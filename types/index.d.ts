interface Person{
   username:string,
   phone:string,
   email:string,
   password:string,
   country:string,
}

export interface Card{
   card_id: number;
   suit: string;
   value: number;
   rank: string;
   image_url: string;
 }

export interface GamePlayerUser {
  id: number;
  username: string;
  image_url: string;
}

export interface GamePlayer {
  id: number;
  game_id: number;
  user: GamePlayerUser;
  score: number;
  position: number;
  is_dealer: boolean;
  status: string;
}

export interface GameCard {
  id: number;
  game_id: number;
  card: Card;
  player_id: number;
  status: string;
  trick_number: number;
  pos_x: number;
  pos_y: number;
  rotation: number;
  z_index: number;
  animation_state: string;
  hand_position: number; // Position in the player's hand (1, 2, 3, etc.)
}

export interface Game {
  id: number;
  code: string;
  created_by: number;
  status: string;
  player_count: number;
  current_player_position: number;
  players: GamePlayer[];
  cards: GameCard[];
  current_lead_suit: string | null;
  round_number: number;
  created_at: string;
  started_at: string;
  ended_at: string;
}
 