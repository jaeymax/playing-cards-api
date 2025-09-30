import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import sql from "../config/db";

const getRecentMatchHistory = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.params.userId || req.user?.userId;

    console.log('user id', req.user?.userId)

    const recentGames = await sql`
    SELECT 
      g.id,
      g.code,
      g.status,
      g.ended_at,
      g.player_count,
      gp.score,
      json_agg(json_build_object(
        'username', u.username,
        'score', gp2.score
      )) as players
    FROM games g
    JOIN game_players gp ON g.id = gp.game_id
    JOIN game_players gp2 ON g.id = gp2.game_id
    JOIN users u ON gp2.user_id = u.id
    WHERE gp.user_id = ${userId}
    AND g.status = 'completed'
    GROUP BY g.id, gp.score
    ORDER BY g.ended_at DESC
    LIMIT 5
  `;

    res.json(recentGames);
  }
);

const getMatchHistory = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.userId || req.user?.id;

  const games = await sql`
    SELECT 
      g.id,
      g.code,
      g.status,
      g.ended_at,
      g.player_count,
      gp.score,
      json_agg(json_build_object(
        'username', u.username,
        'score', gp2.score
      )) as players
    FROM games g
    JOIN game_players gp ON g.id = gp.game_id
    JOIN game_players gp2 ON g.id = gp2.game_id
    JOIN users u ON gp2.user_id = u.id
    WHERE gp.user_id = ${userId}
    AND g.status = 'completed'
    GROUP BY g.id, gp.score
    ORDER BY g.ended_at DESC
  `;

  res.json(games);
});

export { getMatchHistory, getRecentMatchHistory };
