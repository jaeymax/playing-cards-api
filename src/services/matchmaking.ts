import { EventEmitter } from "events";
import sql from "../config/db";
import asyncHandler from "express-async-handler";

class Matchmaker extends EventEmitter {
  private interval: ReturnType<typeof setInterval> | null = null;
  private readonly checkInterval: number = 5000;
  private readonly ratingRange: number = 200;

  constructor() {
    super();
    this.start();
  }

  addToQueue = async (userId: number, rating: number): Promise<void> => {
    try {
      await sql`
        INSERT INTO matchmaking_queue (user_id, rating) 
        VALUES (${userId}, ${rating}) 
        ON CONFLICT (user_id) DO UPDATE 
        SET joined_at = NOW()
      `;
      this.checkMatches();
    } catch (error) {
      console.error('Error adding user to matchmaking queue:', error);
      //throw error; // Re-throw the original error for proper handling
    }
  };

  removeFromQueue = async (userId: number): Promise<void> => {
    try {
      await sql`DELETE FROM matchmaking_queue WHERE user_id = ${userId}`;
    } catch (error) {
      console.error('Error removing user from matchmaking queue:', error);
     // throw error; // Re-throw the original error for proper handling
    }
  };

  private async checkMatches(): Promise<void> {
    try {
      const potentialMatches = await sql`
        WITH potential_matches AS (
          SELECT 
            a.user_id AS user1, 
            a.joined_at AS joined_at1,
            b.user_id AS user2,
            b.joined_at AS joined_at2,
            ABS(a.rating - b.rating) AS rating_diff
          FROM matchmaking_queue a
          JOIN matchmaking_queue b ON a.user_id < b.user_id
          WHERE ABS(a.rating - b.rating) <= ${this.ratingRange}
          ORDER BY rating_diff, a.joined_at
          LIMIT 1
        )
        SELECT * FROM potential_matches
      `;

      console.log("Checking for matches:", potentialMatches);
      if (potentialMatches.length > 0) {
        const { user1, joined_at1, user2, joined_at2 } = potentialMatches[0];

        console.log("potential_matches", potentialMatches);
        if (joined_at1 < joined_at2) {
          await this.createMatch(user1, user2);
        } else {
          await this.createMatch(user2, user1);
        }
      }
    } catch (error) {
      console.error('Error checking for matches:', error);
      // Don't throw here as this is called internally and shouldn't crash the service
    }
  }

  private async createMatch(userId1: number, userId2: number): Promise<void> {
    try {
      const gameCode = Math.random().toString(36).substring(2, 12);

      // Get full user data for both players
      // const players = await sql`
      //   SELECT id, username, email, image_url, rating, location, games_played, games_won
      //   FROM users
      //   WHERE id IN (${userId1}, ${userId2})
      // `;

      const result = await sql.transaction((sql) => [
        sql`
          INSERT INTO games (code, created_by, status, player_count, current_player_position) 
          VALUES (${gameCode}, ${userId1}, 'waiting', 2, 1) 
          RETURNING id
        `,
        sql`
          WITH new_game_id AS (SELECT lastval() AS game_id)
          INSERT INTO game_players (game_id, user_id, position, is_dealer)
          VALUES 
            ((SELECT game_id FROM new_game_id), ${userId1}::integer, 0, true),
            ((SELECT game_id FROM new_game_id), ${userId2}::integer, 1, false)
          RETURNING 
            user_id as id,
            id as player_id,
            position,
            is_dealer,
            (SELECT username FROM users WHERE users.id = user_id) as username,
            (SELECT image_url FROM users WHERE users.id = user_id) as image_url
        `,
        sql`
          DELETE FROM matchmaking_queue 
          WHERE user_id IN (${userId1}, ${userId2})
        `,
      ]);

      const cards = await sql`
        SELECT card_id FROM cards ORDER BY RANDOM()`;

      const gameId = result[0][0].id;
      const players = result[1];

      const dealer = players.find((player)=> player.is_dealer);

      cards.forEach( async(card)=>{
        await sql`INSERT INTO game_cards (game_id, card_id, player_id, hand_position) 
        VALUES (${gameId}, ${card.card_id}, ${dealer?.player_id}, ${-1})`

      })

      this.emit("matchFound", {
        gameCode,
        gameId,
        players,
        positions: players.reduce((acc: any, p: any) => {
          acc[p.user_id] = p.position;
          return acc;
        }, {}),
      });

      console.log(`Match created: Game ID ${gameId} for players:`, players);
    } catch (error) {
      console.error("Match creation failed:", error);
      // Don't throw here as this is called internally and shouldn't crash the service
    }
  }

  start(): void {
    if (!this.interval) {
      this.interval = setInterval(
        () => this.checkMatches(),
        this.checkInterval
      );
    }
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval as NodeJS.Timeout);
      this.interval = null;
    }
  }
}

export default Matchmaker;
