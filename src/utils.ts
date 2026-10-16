import type { Server } from "socket.io";
import type { Redis } from "ioredis";
import { redis } from ".";
import { Game } from "../types";
import sql from "./config/db";
import {
  createGameCardsForMatch,
  createTwoPlayerMatch,
  createTwoPlayerMatchGamePlayers,
} from "./utils/tournament";
import { connectionsKey } from "./services/presenceService";
import { ChallengerProfile } from "./services/challengeService";
import { saveGame } from "./utils/gameFunctions";

const updateWinnerWonCount = async (winnerId: number) => {
  await sql`
      UPDATE users
      SET games_won = games_won + 1
      WHERE id = ${winnerId}
   `;

  // update winning streak for winner, add 1 to current winning streak, and update max winning streak if current winning streak is greater than max winning streak
  await sql`
      UPDATE users
      SET current_winning_streak = current_winning_streak + 1,
          max_winning_streak = GREATEST(current_winning_streak + 1, max_winning_streak)
      WHERE id = ${winnerId}
   `;
};

const updateLoserWinningStreak = async (loserId: number) => {
  await sql`
      UPDATE users
      SET current_winning_streak = 0
      WHERE id = ${loserId}
   `;
};

const markGameAsEndedAndCompleted = async (gameId: number) => {
  await sql`
      UPDATE games
      SET status = 'completed', ended_at = NOW()
      WHERE id = ${gameId}
   `;
};

const markGameAsEndedAndForfeited = async (gameId: number) => {
  await sql`
      UPDATE games
      SET status = 'forfeited', ended_at = NOW()
      WHERE id = ${gameId}
   `;
  console.log("updated game with game_id", gameId, "as forfeited");
};

const markTournamentAsEndedAndCompleted = async (tournamentId: number) => {
  await sql`
      UPDATE tournaments
      SET status = 'completed', end_date = NOW()
      WHERE id = ${tournamentId}
   `;
};

// update games played for all players in a game
const updateGamesPlayedForGamePlayers = async (gameId: number) => {
  await sql`
  UPDATE users u
  SET games_played = u.games_played + 1
  FROM game_players gp
  WHERE gp.game_id = ${gameId}
    AND gp.user_id = u.id
`;
};

const getMatchWinner = (game: Game) => {
  const final_trick = game.completed_tricks[game.completed_tricks.length - 1];
  return game.players.find(
    (player) => player.position == final_trick.leader_position,
  );
};

// function go return loser of a match, but only for a  two player game
const getMatchLoser = (game: Game) => {
  if (game.players.length != 2) {
    throw new Error("getMatchLoser only works for two player games");
  }
  const winner = getMatchWinner(game);
  return game.players.find((player) => player.id != winner?.id);
};

// function to return losers of a match, for games with more than 2 players, it will return an array of losers
const getMatchLosers = (game: Game) => {
  const winner = getMatchWinner(game);
  return game.players.filter((player) => player.id != winner?.id);
};

const updateGamePlayersScores = async (game: Game) => {
  // for (const player of game.players) {
  //   await sql`
  //       UPDATE game_players
  //       SET score = ${player.score}
  //       WHERE game_id = ${game.id} AND user_id = ${player.user.id}
  //   `;
  // }

  const userIds = game.players.map((p) => p.user.id);
  const scores = game.players.map((p) => p.score);

  await sql`
    UPDATE game_players gp
    SET score = u.score
    FROM UNNEST(
      ${userIds}::int[],
      ${scores}::int[]
    ) AS u(user_id, score)
    WHERE gp.game_id = ${game.id}
      AND gp.user_id = u.user_id
  `;
};

// function to determin whether a game is a tournament game
const isTournamentMatch = async (gameId: number) => {
  // join on tournaments table and return the format of the tournament
  const result = await sql`
      SELECT tm.tournament_id, tr.round_number, t.format
           FROM tournament_matches tm
           JOIN tournament_rounds tr ON tm.round_id = tr.id
           JOIN tournaments t ON tm.tournament_id = t.id
        WHERE tm.game_id = ${gameId}
    `;

  return result.length > 0
    ? {
        id: result[0].tournament_id,
        current_round_number: result[0].round_number,
        format: result[0].format,
      }
    : null;
};

const getGamesByCodes = async (codes: string[]) => {
  try {
    const keys = codes.map((code) => `${code}`);
    const games = await redis.mget(keys);
    return games.map((g) => g && JSON.parse(g)).filter(Boolean);
  } catch (err) {
    console.log("Error getting games from redis", err);
    return null;
  }
};

const createMatchmakerMatch = async (user1: number, user2: number) => {
  const game = await createTwoPlayerMatch(user1);

  const { gameplayer1, gameplayer2 } = await createTwoPlayerMatchGamePlayers(
    game.id,
    user1,
    user2,
  );

  const gameCards = await createGameCardsForMatch(game.id, gameplayer1.id);

  const newGame = {
    ...game,
    players: [gameplayer1, gameplayer2],
    cards: gameCards,
  };
  return newGame;
};

const createChallengeGame = async (user1Id: number, user2Id: number): Promise<any> => {
  const game = await createTwoPlayerMatch(user1Id);

  const { gameplayer1, gameplayer2 } = await createTwoPlayerMatchGamePlayers(
    game.id,
    user1Id,
    user2Id,
  );

  const gameCards = await createGameCardsForMatch(game.id, gameplayer1.id);

  const newGame = {
    ...game,
    players: [gameplayer1, gameplayer2],
    cards: gameCards,
  };

  await saveGame(game.code, newGame);

  return game.code; // Return the game code instead of the entire game object
}

const createEmitToUser = (serverSocket: Server, redis: Redis) => {
  return async (
    userId: number,
    event: string,
    payload: unknown,
  ): Promise<void> => {
    const userIdString = String(userId);
    const key = connectionsKey(userIdString);
    const now = Date.now();

    // Remove expired socket connections.
    await redis.zremrangebyscore(key, "-inf", now);

    // Retrieve all active socket IDs for this user.
    const socketIds = await redis.zrange(key, 0, -1);

    if (socketIds.length === 0) {
      return;
    }

    // Emit to every active device/tab belonging to this user.
    const emissions = socketIds.map((socketId) =>
      serverSocket.to(socketId).emit(event, payload),
    );

    // Socket.IO emit() is synchronous; it doesn't confirm delivery.
    void emissions;
  };
};

const getPlayerProfile = async (
  userId: number,
): Promise<ChallengerProfile | null> => {
  const result = await sql`
    SELECT id, username, image_url, rating, games_played, games_won, current_winning_streak, max_winning_streak
    FROM users
    WHERE id = ${userId}
  `;

  if (result.length === 0) {
    throw new Error(`User with ID ${userId} not found`);
  }

  return result[0] as ChallengerProfile;
};

export {
  updateWinnerWonCount,
  updateLoserWinningStreak,
  markGameAsEndedAndCompleted,
  markGameAsEndedAndForfeited,
  updateGamesPlayedForGamePlayers,
  getMatchWinner,
  updateGamePlayersScores,
  isTournamentMatch,
  getMatchLoser,
  markTournamentAsEndedAndCompleted,
  getGamesByCodes,
  createMatchmakerMatch,
  createEmitToUser,
  getPlayerProfile,
  createChallengeGame,
};
