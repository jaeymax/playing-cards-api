import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import sql from "../config/db";

const getRecentMatchHistory = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.params.userId || req.user?.userId;

    console.log('user id', req.user?.userId)

    const recentGames = await sql`
   SELECT
      opp_user.username AS opponent_name,
      opp_gp.score AS opponent_score,
      me_gp.score AS player_score,
      g.ended_at,
      g.is_rated,
      (me_gp.score > opp_gp.score) AS winner,
      COALESCE(rc.rating_change, NULL) AS rating_change
  FROM games g
  JOIN game_players me_gp
      ON me_gp.game_id = g.id
     AND me_gp.user_id = ${userId}
  JOIN game_players opp_gp
      ON opp_gp.game_id = g.id
     AND opp_gp.user_id <> ${userId}
  JOIN users opp_user
      ON opp_user.id = opp_gp.user_id
  LEFT JOIN tournament_matches tm
      ON tm.game_id = g.id
  LEFT JOIN rating_changes rc
      ON rc.user_id = ${userId}
     AND rc.tournament_id = tm.tournament_id
  WHERE g.status = 'completed'
  ORDER BY g.ended_at DESC
    LIMIT 3
  `;

    res.json(recentGames);
  }
);

const getMatchHistory = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.userId || req.user?.userId;

  // const games = await sql`
  //   SELECT 
  //     g.id,
  //     g.code,
  //     g.status,
  //     g.ended_at,
  //     g.player_count,
  //     g.is_rated,
  //     gp.score,
  //     json_agg(json_build_object(
  //       'username', u.username,
  //       'score', gp2.score
  //     )) as players
  //   FROM games g
  //   JOIN game_players gp ON g.id = gp.game_id
  //   JOIN game_players gp2 ON g.id = gp2.game_id
  //   JOIN users u ON gp2.user_id = u.id
  //   WHERE gp.user_id = ${userId}
  //   AND g.status = 'completed'
  //   GROUP BY g.id, gp.score
  //   ORDER BY g.ended_at DESC
  // `;

  const games = await sql`SELECT
      opp_user.username AS opponent_name,
      opp_gp.score AS opponent_score,
      me_gp.score AS player_score,
      g.ended_at,
      g.is_rated,
      (me_gp.score > opp_gp.score) AS winner,
      COALESCE(rc.rating_change, NULL) AS rating_change
  FROM games g
  JOIN game_players me_gp
      ON me_gp.game_id = g.id
     AND me_gp.user_id = ${userId}
  JOIN game_players opp_gp
      ON opp_gp.game_id = g.id
     AND opp_gp.user_id <> ${userId}
  JOIN users opp_user
      ON opp_user.id = opp_gp.user_id
  LEFT JOIN tournament_matches tm
      ON tm.game_id = g.id
  LEFT JOIN rating_changes rc
      ON rc.user_id = ${userId}
     AND rc.tournament_id = tm.tournament_id
  WHERE g.status = 'completed'
  ORDER BY g.ended_at DESC;`

  res.json(games);
});

export { getMatchHistory, getRecentMatchHistory };
