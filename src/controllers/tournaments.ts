import { Request, Response } from "express";
import sql from "../config/db";
import type { AuthenticatedRequest, Game } from "../../types/index";
import {
  fisherYatesShuffle,
  getGameByCode,
  saveGame,
} from "../utils/gameFunctions";
import { matchForfeiter, redis, serverSocket } from "..";
import expressAsyncHandler from "express-async-handler";
import {
  createByeMatch,
  createGameCardsForMatch,
  createMatchGamePlayer,
  createSingleEliminationByeMatch,
  createSingleEliminationMatch,
  createTwoPlayerMatch,
  createTwoPlayerMatchGamePlayers,
  getSingleEliminationTournamentParticipants,
} from "../utils/tournament";
import { create, get } from "axios";

interface TournamentMatch {
  id: number;
  tournament_id: number;
  game_id: number;
  round_number: number;
  status: string;
}

interface TournamentBracketMatch {
  round_number: number;
  id: number;
  game_id: number;
  status: string;
}

interface RoundMatches {
  round: number;
  matches: TournamentBracketMatch[];
}

// Utility function for shuffling arrays
const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export const getTournamentResults = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const tournament_id = req.params.id;

    const tournament =
      await sql`SELECT * from tournaments WHERE id = ${tournament_id}`;

    if (!tournament || tournament.length == 0) {
      res
        .status(404)
        .json({ message: `Tournament with id ${tournament_id} not found` });
      return;
    }

    const results = await sql`SELECT
    u.id,
    u.username,
    u.image_url,
    COALESCE(COUNT(tm.id),0) AS num_wins
  FROM tournament_participants tp
  JOIN users u
    ON u.id = tp.user_id
  LEFT JOIN tournament_matches tm
    ON tm.tournament_id = tp.tournament_id
    AND tm.winner_id = u.id
  WHERE tp.tournament_id = ${tournament_id}
  GROUP BY u.id, u.username, u.image_url
  ORDER BY num_wins DESC`;

    res.status(200).json(results);
  }
);

export const getLatestSingleEliminationTournamentWinners = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const tournament_id =
      await sql`SELECT id from tournaments WHERE format = 'Single Elimination' AND status = 'completed' ORDER by end_date DESC LIMIT 1`;

    if (!tournament_id || tournament_id.length == 0) {
      res.status(400).json({ message: "No tournament found" });
      return;
    }

    const results = await sql`SELECT
    u.id,
    u.username as name,
    u.image_url,
    COALESCE(COUNT(tm.id),0) AS wins
  FROM tournament_participants tp
  JOIN users u
    ON u.id = tp.user_id
  LEFT JOIN tournament_matches tm
    ON tm.tournament_id = tp.tournament_id
    AND tm.winner_id = u.id
  WHERE tp.tournament_id = ${tournament_id[0].id}
  GROUP BY u.id, u.username, u.image_url
  ORDER BY wins DESC LIMIT 3`;

    res.status(200).json(results);
  }
);

export const getTopThreePlayersFromTournamentResults = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const tournament_id = req.params.id;

    const tournament =
      await sql`SELECT * from tournaments WHERE id = ${tournament_id}`;

    if (!tournament || tournament.length == 0) {
      res
        .status(404)
        .json({ message: `Tournament with id ${tournament_id} not found` });
      return;
    }

    const results = await sql`SELECT
  u.id,
  u.username,
  u.image_url,
  COALESCE(COUNT(tm.id),0) AS wins
FROM tournament_participants tp
JOIN users u
  ON u.id = tp.user_id
LEFT JOIN tournament_matches tm
  ON tm.tournament_id = tp.tournament_id
  AND tm.winner_id = u.id
WHERE tp.tournament_id = ${tournament_id}
GROUP BY u.id, u.username, u.image_url
ORDER BY wins DESC LIMIT 3`;

    res.status(200).json(results);
  }
);

export const addTournamentRule = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const tournament_id = req.params.id;
    const { title, message } = req.body;

    if (!title || !message) {
      res.status(404).json({ message: "Please provide title and message" });
    }

    const tournament =
      await sql`SELECT * from tournaments WHERE id = ${tournament_id}`;

    if (!tournament || tournament.length == 0) {
      res
        .status(404)
        .json({ message: `Tournament with id ${tournament_id} not found` });
      return;
    }

    const rule =
      await sql`INSERT into tournament_rules (tournament_id, title, message) VALUES (${tournament_id}, ${title}, ${message}) RETURNING *`;

    res
      .status(200)
      .json({ message: "Tournament rule added successfully", rule: rule[0] });
  }
);

// GET ALL TOURNAMENTS
export const getAllTournaments = async (req: Request, res: Response) => {
  try {
    const tournaments = await sql`
      SELECT * FROM tournaments ORDER BY created_at DESC
    `;

    // Log request query for debugging
    console.log(req.query);

    res.json({ success: true, data: tournaments });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Error fetching tournaments" });
  }
};

export const getCurrentWeekendTournament = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.body.userId || null;

    console.log("request body", req.body);

    const tournament = await sql`
      SELECT * FROM tournaments 
      WHERE name = 'Weekend Championship' 
      ORDER BY created_at ASC
      LIMIT 1
    `;

    if (tournament.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No current weekend tournament found",
      });
    }

    let registered = false;

    // Only check registration if userId is provided
    if (userId) {
      const registration = await sql`
        SELECT id FROM tournament_participants
        WHERE tournament_id = ${tournament[0].id} AND user_id = ${userId}
      `;
      registered = registration.length > 0;
    }

    res.json({
      success: true,
      data: {
        ...tournament[0],
        registered,
      },
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Error fetching weekend tournaments" });
  }
};

export const createTournament = async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      start_date,
      registration_closing_date,
      registration_fee,
      format,
      prize,
      is_current,
      end_date,
    } = req.body;

    // Basic validation
    if (
      !name ||
      !start_date ||
      !registration_closing_date ||
      !end_date ||
      !format
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Name, start date, registration closing date, and end date are required",
      });
    }

    const result = await sql`
      INSERT INTO tournaments (
        name, 
        description, 
        start_date, 
        end_date,
        registration_closing_date,
        registration_fee,
        prize,
        format,
        is_current
      ) VALUES (
        ${name}, 
        ${description}, 
        ${new Date(start_date)},
        ${new Date(end_date)},
        ${new Date(registration_closing_date)},
        ${registration_fee || 0},
        ${prize || 0},
        ${format},
        ${is_current || false}
      ) 
      RETURNING id
    `;

    res.json({
      success: true,
      tournament_id: result[0].id,
    });
  } catch (err) {
    console.error("Error creating tournament:", err);
    res.status(500).json({
      success: false,
      message: "Failed to create tournament",
    });
  }
};

export const joinTournament = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const tournamentId = parseInt(req.params.id);
    const userId = req.user?.userId;
    //console.log('user:', req.user);

    // Validate tournament ID
    if (!tournamentId || isNaN(tournamentId)) {
      res.status(400).json({
        success: false,
        message: "Invalid tournament ID",
      });
      return;
    }

    await sql`
      INSERT INTO tournament_participants (tournament_id, user_id)
      VALUES (${tournamentId}, ${userId})
      ON CONFLICT (tournament_id, user_id) DO NOTHING
    `;

    res.json({
      success: true,
      message: "Joined tournament successfully!",
    });
  } catch (err) {
    console.error("Error joining tournament:", err);
    res.status(500).json({
      success: false,
      message: "Failed to join tournament",
    });
  }
};

export const closeTournamentRegistration = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const tournamentId = parseInt(req.params.id);

    if (!tournamentId || isNaN(tournamentId)) {
      res.status(400).json({
        success: false,
        message: "Invalid tournament ID",
      });
      return;
    }

    const tournament = await sql`
      SELECT * FROM tournaments WHERE id = ${tournamentId}
    `;

    if (!tournament.length) {
      res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
      return;
    }

    // Fetch all participants
    const participants =
      await getSingleEliminationTournamentParticipants(tournamentId);

    if (participants.length < 2) {
      res.status(400).json({
        success: false,
        message: "Not enough participants to start tournament",
      });
      return;
    }

    try {
      // Create first round
      const round = await sql`
        INSERT INTO tournament_rounds (tournament_id, round_number, status)
        VALUES (${tournamentId}, 1, 'pending')
        RETURNING id
      `;

      const roundId = round[0].id;
      fisherYatesShuffle(participants);
      const rounds: Record<number, any[]> = { 1: [] };
      const is_final_round = participants.length === 2;

      // Pair players and create matches
      for (let i = 0; i < participants.length; i += 2) {
        const player1 = participants[i];
        const player2 = participants[i + 1];

        if (!player2) {
          console.log("creating bye match");
          // Handle odd player (auto-advance)
          const game = await createByeMatch(player1.id);

          console.log("game created for bye match", game.id, game.code);
          const { gameplayer } = await createMatchGamePlayer(
            game.id,
            player1.id,
            0,
            true
          );

          console.log("game player created for bye match", gameplayer);
          // create tournament match

          const match = await createSingleEliminationByeMatch(
            tournamentId,
            game.id,
            roundId,
            player1.id,
            Math.floor(i / 2) + 1
          );

          rounds[1].push({
            id: match.id,
            player1: player1.username,
            player2: null,
            status: match.status,
          });
          console.log(`created match for only ${player1.username}`);

          const newGame = {
            ...game,
            players: [gameplayer],
            cards: null,
          };

          await saveGame(game.code, newGame);
          console.log("game saved to memory", game.code);
          break;
        }

        const game = await createTwoPlayerMatch(
          player1.id,
          "waiting",
          is_final_round,
          true
        );

        const { gameplayer1, gameplayer2 } =
          await createTwoPlayerMatchGamePlayers(
            game.id,
            player1.id,
            player2.id
          );

        const gameCards = await createGameCardsForMatch(
          game.id,
          gameplayer1.id
        );

        const match = await createSingleEliminationMatch(
          tournamentId,
          game.id,
          roundId,
          player1.id,
          player2.id,
          "pending",
          Math.floor(i / 2) + 1
        );

        console.log(
          `created match for ${player1.username} an ${player2.username}`
        );

        const newGame = {
          ...game,
          players: [gameplayer1, gameplayer2],
          cards: gameCards,
        };

        await saveGame(game.code, newGame);
        console.log("game saved to memory", game.code);

        rounds[1].push({
          id: match.id,
          player1: player1.username,
          player2: player2.username,
          status: match.status,
        });
      }
    } catch (err) {
      console.error("Error during transaction:", err);
      throw err;
    }

    // Fetch final data for response
    const finalMatches = await sql`
      SELECT 
        tm.id,
        tm.player1_id,
        tm.player2_id,
        u1.username as player1_name,
        u1.image_url as player1_image,
        u2.username as player2_name,
        u2.image_url as player2_image,
        tm.status,
        tm.winner_id
      FROM tournament_matches tm
      JOIN users u1 ON tm.player1_id = u1.id
      LEFT JOIN users u2 ON tm.player2_id = u2.id
      WHERE tm.tournament_id = ${tournamentId}
      AND tm.round_id = (
        SELECT id FROM tournament_rounds 
        WHERE tournament_id = ${tournamentId} 
        AND round_number = 1
      )
      ORDER BY tm.match_order
    `;

    const formattedMatches = finalMatches.map((match) => ({
      id: match.id,
      player1: {
        id: match.player1_id,
        name: match.player1_name,
        image_url: match.player1_image,
        winner: match.winner_id === match.player1_id ? true : false,
      },
      player2: match.player2_id
        ? {
            id: match.player2_id,
            name: match.player2_name,
            image_url: match.player2_image,
            winner: match.winner_id === match.player2_id ? true : false,
          }
        : null,
      status: match.status,
    }));

    res.json({
      success: true,
      tournament: tournament[0],
      participants,
      rounds: [
        {
          round: 1,
          matches: formattedMatches,
        },
      ],
    });

    serverSocket.to(`tournament_${tournamentId}`).emit("lobbyUpdate", {
      success: true,
      tournament: tournament[0],
      participants,
      rounds: [{ round: 1, matches: formattedMatches }],
    });

    console.log(
      "tournament registration lobby emitted to socket room:",
      `tournament_${tournamentId}`
    );
  } catch (err) {
    console.error("Error closing tournament registration:", err);
    res.status(500).json({
      success: false,
      message: "Failed to close tournament registration",
    });
  }
};

export const getTournamentLobby = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const tournamentId = parseInt(req.params.id);

    if (!tournamentId || isNaN(tournamentId)) {
      res.status(400).json({
        success: false,
        message: "Invalid tournament ID",
      });
      return;
    }

    // Fetch tournament details
    const tournament = await sql`
      SELECT * FROM tournaments WHERE id = ${tournamentId}
    `;

    if (!tournament.length) {
      res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
      return;
    }

    // Fetch participants with their global ranking
    const participants = await sql`
      SELECT 
        u.id, 
        u.username, 
        u.image_url, 
        u.rating,
        tp.status,
        RANK() OVER (ORDER BY u.rating DESC) as rank
      FROM users u
      JOIN tournament_participants tp ON u.id = tp.user_id
      WHERE tp.tournament_id = ${tournamentId}
    `;

    const rules =
      await sql`SELECT id, title, message as content from tournament_rules WHERE tournament_id = ${tournamentId}`;

    // Fetch current round matches with player details and scores
    const matches = await sql`
      SELECT 
        tr.round_number,
        tm.id,
        tm.game_id,
        tm.status,
        tm.winner_id,
        g.code,
        u1.id as player1_id,
        u2.id as player2_id,
        u1.username as player1_name,
        u1.image_url as player1_image,
        gp1.score as player1_score,
        u2.username as player2_name,
        u2.image_url as player2_image,
        gp2.score as player2_score
      FROM tournament_matches tm
      JOIN tournament_rounds tr ON tm.round_id = tr.id
      JOIN users u1 ON tm.player1_id = u1.id
      LEFT JOIN users u2 ON tm.player2_id = u2.id
      JOIN games g ON tm.game_id = g.id
      LEFT JOIN game_players gp1 ON g.id = gp1.game_id AND u1.id = gp1.user_id
      LEFT JOIN game_players gp2 ON g.id = gp2.game_id AND u2.id = gp2.user_id
      WHERE tm.tournament_id = ${tournamentId}
      ORDER BY tr.round_number ASC, tm.match_order ASC
    `;

    const games =
      await sql`SELECT code as gamecode from games where id = ANY(${matches.map((m) => m.game_id)}::integer[])`;

    const gamesMap: Record<string, any> = {};
    for (const gameData of games) {
      const gamecode = gameData.gamecode;
      const game = await getGameByCode(gamecode);
      gamesMap[gamecode] = game;
    }

    // Format rounds with aggregated player data
    const roundsMap: Record<number, any[]> = {};
    matches.forEach((match) => {
      if (!roundsMap[match.round_number]) {
        roundsMap[match.round_number] = [];
      }
      roundsMap[match.round_number].push({
        id: match.id,
        player1: {
          id: match.player1_id,
          name: match.player1_name,
          image_url: match.player1_image,
          score: match.player1_score || 0,
          winner: match.winner_id === match.player1_id ? true : false,
        },
        player2: {
          id: match.player2_id,
          name: match.player2_name,
          image_url: match.player2_image,
          score: match.player2_score || 0,
          winner: match.winner_id === match.player2_id ? true : false,
        },
        status: match.status,
        game_id: match.game_id,
        game_code: match.code,
        winner_id: match.winner_id,
        turn_ends_at: gamesMap[match.code]?.turn_ends_at,
        forfeiter_user_id: gamesMap[match.code]?.forfeited_by,
      });
    });

    const rounds = Object.entries(roundsMap).map(([round, matches]) => ({
      round: parseInt(round),
      matches,
    }));

    // serverSocket.to(`tournament_${tournamentId}`).emit("lobbyUpdate", {
    //   success: true,
    //   tournament: tournament[0],
    //   participants,
    //   rounds,
    // });

    // console.log('tournament lobby emitted to socket room:', `tournament_${tournamentId}`);

    res.json({
      success: true,
      tournament: tournament[0],
      participants,
      rules,
      rounds,
    });
  } catch (err) {
    console.error("Error fetching tournament lobby:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tournament lobby",
    });
  }
};

export const startTournament = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const tournamentId = parseInt(req.params.id);

    if (!tournamentId || isNaN(tournamentId)) {
      res.status(400).json({
        success: false,
        message: "Invalid tournament ID",
      });
      return;
    }

    let tournament = await sql`
      SELECT status FROM tournaments WHERE id = ${tournamentId}
    `;

    if (!tournament.length) {
      res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
      return;
    }

    if (tournament[0].status !== "upcoming") {
      res.status(400).json({
        success: false,
        message: "Tournament cannot be started",
      });
      return;
    }

    // Get all participants
    const players =
      await getSingleEliminationTournamentParticipants(tournamentId);

    if (players.length < 2) {
      res.status(400).json({
        success: false,
        message: "Not enough players to start tournament",
      });
      return;
    }

    // Update tournament status
    await sql`
      UPDATE tournaments 
      SET status = 'ongoing' 
      WHERE id = ${tournamentId}
    `;

    // Fetch all tournament matches and update associated games except bye matches
    const matches_update = await sql`
      SELECT tm.id, g.id as game_id
      FROM tournament_matches tm
      JOIN games g ON tm.game_id = g.id
      WHERE tm.tournament_id = ${tournamentId} AND tm.player2_id IS NOT NULL
    `;

    // Update match statuses to ongoing
    await sql`
      UPDATE tournament_matches
      SET status = 'in_progress'
      WHERE id = ANY(${matches_update.map((m) => m.id)}::integer[])
    `;

    // Update all games to in_progress with started_at timestamp
    await sql`
      UPDATE games
      SET status = 'in_progress', started_at = CURRENT_TIMESTAMP
      WHERE id = ANY(${matches_update.map((m) => m.game_id)}::integer[])
    `;

    // Update round 1 status to ongoing
    await sql`
      UPDATE tournament_rounds
      SET status = 'ongoing'
      WHERE tournament_id = ${tournamentId} AND round_number = 1
    `;

    // Fetch participants with their global ranking
    const participants = await sql`
      SELECT 
        u.id, 
        u.username, 
        u.image_url, 
        u.rating,
        tp.status,
        RANK() OVER (ORDER BY u.rating DESC) as rank
      FROM users u
      JOIN tournament_participants tp ON u.id = tp.user_id
      WHERE tp.tournament_id = ${tournamentId}
    `;

    tournament = await sql`
      SELECT * FROM tournaments WHERE id = ${tournamentId} `

    // Fetch current round matches with player details and scores
    const matches = await sql`
      SELECT 
        tr.round_number,
        tm.id,
        tm.game_id,
        tm.status,
        tm.winner_id,
        g.code,
        u1.id as player1_id,
        u2.id as player2_id,
        u1.username as player1_name,
        u1.image_url as player1_image,
        gp1.score as player1_score,
        u2.username as player2_name,
        u2.image_url as player2_image,
        gp2.score as player2_score
      FROM tournament_matches tm
      JOIN tournament_rounds tr ON tm.round_id = tr.id
      JOIN users u1 ON tm.player1_id = u1.id
      LEFT JOIN users u2 ON tm.player2_id = u2.id
      JOIN games g ON tm.game_id = g.id
      LEFT JOIN game_players gp1 ON g.id = gp1.game_id AND u1.id = gp1.user_id
      LEFT JOIN game_players gp2 ON g.id = gp2.game_id AND u2.id = gp2.user_id
      WHERE tm.tournament_id = ${tournamentId}
      ORDER BY tr.round_number ASC, tm.match_order ASC
    `;

    const games =
      await sql`SELECT code as gamecode from games where id = ANY(${matches.map((m) => m.game_id)}::integer[])`;
    console.log("games", games);

    const gamesMap: Record<string, any> = {};
    for (const gameData of games) {
      const gamecode = gameData.gamecode;
      const game = await getGameByCode(gamecode);
      console.log("game", game.status);
      if (game) {
        game.turn_started_at = Date.now();
        game.turn_ends_at =
          game?.turn_started_at + (game.turn_timeout_seconds + 60) * 1000;
        if (game.status == 'waiting'){
          game.status = 'in_progress';
          await matchForfeiter.scheduleForfeit(
            gamecode,
            (game.turn_timeout_seconds + 60) * 1000
          );
        }
      }

      await saveGame(gamecode, game);
      gamesMap[gamecode] = game;
    }

    // Format rounds with aggregated player data
    const roundsMap: Record<number, any[]> = {};
    matches.forEach((match) => {
      if (!roundsMap[match.round_number]) {
        roundsMap[match.round_number] = [];
      }

      const game = gamesMap[match.code];
      roundsMap[match.round_number].push({
        id: match.id,
        player1: {
          id: match.player1_id,
          name: match.player1_name,
          image_url: match.player1_image,
          score: match.player1_score || 0,
          winner: match.winner_id === match.player1_id ? true : false,
        },
        player2: {
          id: match.player2_id,
          name: match.player2_name,
          image_url: match.player2_image,
          score: match.player2_score || 0,
          winner: match.winner_id === match.player2_id ? true : false,
        },
        status: match.status,
        game_id: match.game_id,
        game_code: match.code,
        winner_id: match.winner_id,
        turn_ends_at: game.turn_ends_at,
      });
    });

    const rounds = Object.entries(roundsMap).map(([round, matches]) => ({
      round: parseInt(round),
      matches,
    }));

    serverSocket.to(`tournament_${tournamentId}`).emit("lobbyUpdate", {
      success: true,
      tournament: tournament[0],
      participants,
      rounds,
    });

    console.log(
      "tournament started emitted to socket room:",
      `tournament_${tournamentId}`
    );

    res.json({
      success: true,
      message: "Tournament started successfully!",
      data: {
        tournament: tournament[0],
        participants,
        rounds,
      },
    });
  } catch (err) {
    console.error("Error starting tournament:", err);
    res.status(500).json({
      success: false,
      message: "Failed to start tournament",
    });
  }
};

export const reportMatchResult = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const gameId = parseInt(req.params.gameId);
    const { winner_id } = req.body;

    if (!gameId || isNaN(gameId) || !winner_id || isNaN(winner_id)) {
      res.status(400).json({
        success: false,
        message: "Invalid game ID or winner ID",
      });
      return;
    }

    // get tournament_id for the current match
    const tournament_id = await sql`
      SELECT tournament_id 
      FROM tournament_matches 
      WHERE game_id = ${gameId}
    `;
    // Update match with winner
    await sql`
      UPDATE tournament_matches 
      SET winner_id = ${winner_id}, status = 'completed'
      WHERE game_id = ${gameId}
    `;

    // update the loser participant status to disqualified
    const loserParticipant = await sql`
      SELECT 
        CASE 
          WHEN player1_id = ${winner_id} 
          THEN player2_id 
          ELSE player1_id 
        END AS loser_id
      FROM tournament_matches 
      WHERE game_id = ${gameId}
    `;

    await sql`
      UPDATE tournament_participants
      SET status = 'disqualified'
      WHERE tournament_id = ${tournament_id[0].tournament_id}
      AND user_id = ${loserParticipant[0].loser_id}
    `;

    const current_round_number = await sql`
      SELECT tr.round_number
      FROM tournament_matches tm
      JOIN tournament_rounds tr ON tm.round_id = tr.id
      WHERE tm.game_id = ${gameId}
    `;

    const next_round_number = current_round_number[0].round_number + 1;

    console.log("current round number:", current_round_number[0].round_number);
    console.log("next round number:", next_round_number);

    // const completedMatches = await sql`
    //   SELECT COUNT(*)
    //   FROM tournament_matches
    //   WHERE round_number = ${current_round_number[0].round_number}
    //   AND status = 'completed'
    // `;

    // if (parseInt(completedMatches[0].count) === 0) {
    //   res.status(400).json({
    //     success: false,
    //     message: "Current round is not completed yet",
    //   });
    //   return;
    // }

    res.json({
      success: true,
      message: "Match result reported successfully",
    });
  } catch (err) {
    console.error("Error reporting match result:", err);
    res.status(500).json({
      success: false,
      message: "Failed to report match result",
    });
  }
};

export const completeMatch = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const matchId = parseInt(req.params.matchId);
    const winnerId = parseInt(req.body.winner_id);

    if (!matchId || !winnerId) {
      res.status(400).json({
        success: false,
        message: "Invalid match ID or winner ID",
      });
      return;
    }

    // Get match data
    const matchData = await sql`
      SELECT * FROM tournament_matches WHERE id = ${matchId}
    `;

    if (!matchData.length) {
      res.status(404).json({
        success: false,
        message: "Match not found",
      });
      return;
    }

    const match = matchData[0];

    // Update match status
    await sql`
      UPDATE tournament_matches 
      SET status = 'completed'
      WHERE id = ${matchId}
    `;

    // Update game status
    await sql`
      UPDATE games 
      SET status = 'completed'
      WHERE id = ${match.game_id}
    `;

    // Check if round is completed
    const pendingMatches = await sql`
      SELECT COUNT(*) 
      FROM tournament_matches 
      WHERE tournament_id = ${match.tournament_id} 
      AND round_number = ${match.round_number} 
      AND status != 'completed'
    `;

    if (parseInt(pendingMatches[0].count) === 0) {
      // Get winners from current round
      const winners = await sql`
        SELECT game_id 
        FROM tournament_matches 
        WHERE tournament_id = ${match.tournament_id} 
        AND round_number = ${match.round_number}
      `;

      if (winners.length === 1) {
        // Tournament completed
        await sql`
          UPDATE tournaments 
          SET status = 'completed', 
              winner_id = ${winnerId},
              end_date = CURRENT_TIMESTAMP
          WHERE id = ${match.tournament_id}
        `;
      } else {
        // Create next round matches
        const nextRound = match.round_number + 1;
        const shuffled = shuffleArray(winners.map((w) => w.game_id));

        for (let i = 0; i < shuffled.length; i += 2) {
          const player1GameId = shuffled[i];
          const player2GameId = shuffled[i + 1];

          if (!player2GameId) {
            // Auto-advance single player
            await sql`
              UPDATE tournament_participants 
              SET status = 'winner' 
              WHERE tournament_id = ${match.tournament_id} 
              AND user_id = (
                SELECT created_by FROM games WHERE id = ${player1GameId}
              )
            `;
            continue;
          }

          // Create new game and match for next round
          await sql`
            INSERT INTO tournament_matches (
              tournament_id,
              round_number,
              game_id
            ) VALUES (
              ${match.tournament_id},
              ${nextRound},
              (
                INSERT INTO games (
                  code,
                  created_by,
                  player_count,
                  status
                ) VALUES (
                  ${Math.random().toString(36).substring(2, 12)},
                  (SELECT created_by FROM games WHERE id = ${player1GameId}),
                  2,
                  'waiting'
                ) RETURNING id
              )
            )
          `;
        }
      }
    }

    res.json({
      success: true,
      message: "Match completed successfully",
    });
  } catch (err) {
    console.error("Error completing match:", err);
    res.status(500).json({
      success: false,
      message: "Failed to complete match",
    });
  }
};

export const getBracket = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const tournamentId = parseInt(req.params.id);

    if (!tournamentId || isNaN(tournamentId)) {
      res.status(400).json({
        success: false,
        message: "Invalid tournament ID",
      });
      return;
    }

    const matches = await sql`
      SELECT 
        round_number,
        id,
        game_id,
        status
      FROM tournament_matches 
      WHERE tournament_id = ${tournamentId} 
      ORDER BY round_number ASC
    `;

    const rounds: Record<number, TournamentBracketMatch[]> = {};
    //const rounds = {};

    matches.forEach((match) => {
      if (!rounds[match.round_number]) {
        rounds[match.round_number] = [];
      }
      rounds[match.round_number].push(match as TournamentBracketMatch);
    });

    const formattedRounds: RoundMatches[] = Object.entries(rounds).map(
      ([round, matches]) => ({
        round: parseInt(round),
        matches,
      })
    );

    res.json({
      success: true,
      rounds: formattedRounds,
    });
  } catch (err) {
    console.error("Error fetching tournament bracket:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tournament bracket",
    });
  }
};
