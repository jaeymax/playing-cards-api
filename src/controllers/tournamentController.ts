import { Request, Response } from "express";
import sql from "../config/db";

interface AuthenticatedRequest extends Request {
  user: {
    id: number;
    // ... other user properties
  };
}

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

// GET ALL TOURNAMENTS
export const getAllTournaments = async (req: Request, res: Response) => {
  try {
    const tournaments = await sql`
      SELECT * FROM tournaments ORDER BY created_at DESC
    `;
    res.json({ success: true, data: tournaments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error fetching tournaments" });
  }
};

export const createTournament = async (req: Request, res: Response) => {
  try {
    const { name, description, start_date, prize } = req.body;

    // Basic validation
    if (!name || !start_date) {
      return res.status(400).json({
        success: false,
        message: "Name and start date are required",
      });
    }

    const result = await sql`
      INSERT INTO tournaments (
        name, 
        description, 
        start_date, 
        prize
      ) VALUES (
        ${name}, 
        ${description}, 
        ${new Date(start_date)},
        ${prize || 0}
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
    const userId = req.user.id;


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

    // Get all participants
    const players = await sql`
      SELECT user_id 
      FROM tournament_participants 
      WHERE tournament_id = ${tournamentId}
    `;

    if (players.length < 2) {
      res.status(400).json({
        success: false,
        message: "Not enough players to start tournament",
      });
      return;
    }

    // Shuffle players and create matches
    const shuffled = shuffleArray(players.map((p) => p.user_id));

    for (let i = 0; i < shuffled.length; i += 2) {
      const player1Id = shuffled[i];
      const player2Id = shuffled[i + 1];

      if (!player2Id) {
        // Odd number of players, auto-advance player1
        await sql`
          UPDATE tournament_participants 
          SET status = 'winner' 
          WHERE tournament_id = ${tournamentId} 
          AND user_id = ${player1Id}
        `;
        continue;
      }

      // Create match between two players
      await sql`
        INSERT INTO tournament_matches (
          tournament_id, 
          round_number,
          game_id
        ) VALUES (
          ${tournamentId},
          1,
          (
            INSERT INTO games (
              code,
              created_by,
              player_count,
              status
            ) VALUES (
              ${Math.random().toString(36).substring(2, 12)},
              ${player1Id},
              2,
              'waiting'
            ) RETURNING id
          )
        )
      `;
    }

    // Update tournament status
    await sql`
      UPDATE tournaments 
      SET status = 'ongoing' 
      WHERE id = ${tournamentId}
    `;

    res.json({
      success: true,
      message: "Tournament started successfully!",
    });
  } catch (err) {
    console.error("Error starting tournament:", err);
    res.status(500).json({
      success: false,
      message: "Failed to start tournament",
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
