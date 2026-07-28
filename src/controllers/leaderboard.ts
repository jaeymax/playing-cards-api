import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import sql from "../config/db";
import { getDivisionInfo } from "./users";

const getTopPlayers = asyncHandler(async (req: Request, res: Response) => {
  //res.json({message:"get Leaderboard controller"});

  // select * from users where is_guest = false AND is_bot = false ORDER by rating DESC;
  const topPlayers = await sql`
          SELECT username, image_url, rating,
          RANK() OVER (ORDER BY rating DESC) as global_rank
          FROM users 
          WHERE is_guest = false 
          AND is_bot = false 
          AND is_rated = true
          ORDER BY rating DESC
          LIMIT 5
      `;

  const enrichedTopPlayers = topPlayers.map((player) => {
    return {
      ...player,
      ...getDivisionInfo(player.rating),
    };
  });

  res.json(enrichedTopPlayers);
});

const getLeaderboard = asyncHandler(async (req: Request, res: Response) => {
  const leaderboard = await sql`
        SELECT 
            username, 
            image_url, 
            rating,
            CASE
                WHEN games_played = 0 THEN 0
                ELSE ROUND((games_won::decimal / games_played) * 100, 2)
            END as win_rate,
            RANK() OVER (ORDER BY rating DESC) as global_rank
        FROM users 
        WHERE is_guest = false 
        AND is_bot = false 
        AND is_rated = true
        ORDER BY rating DESC
    `;

  // enrich the leaderboard data with player_rank and rank_color data
  const enrichedLeaderboard = leaderboard.map((player) => {
    return {
      ...player,
      ...getDivisionInfo(player.rating),
    };
  });

  res.json(enrichedLeaderboard);
});



export { getLeaderboard, getTopPlayers };
