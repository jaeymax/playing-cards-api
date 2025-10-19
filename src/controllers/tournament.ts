import { Request, Response } from "express";
import sql from "../config/db";

interface AuthenticatedRequest extends Request {
  user: {
    id: number;
    // ... other user properties
  };
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
