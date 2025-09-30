import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import sql from "../config/db";


const getTopPlayers = asyncHandler(async (req: Request, res: Response) => {
    //res.json({message:"get Leaderboard controller"});
      
    // select * from users where is_guest = false AND is_bot = false ORDER by rating DESC;
      const topPlayers = await sql`
          SELECT username, image_url, rating FROM users 
          WHERE is_guest = false 
          AND is_bot = false 
          ORDER BY rating DESC
          LIMIT 5
      `;
  
      res.json(topPlayers);
});


const getLeaderboard = asyncHandler(async (req: Request, res: Response) => {

  // select * from users where is_guest = false AND is_bot = false ORDER by rating DESC;
    const leaderboard = await sql`
        SELECT * FROM users 
        WHERE is_guest = false 
        AND is_bot = false 
        ORDER BY rating DESC
    `;

    res.json(leaderboard);
});

export { getLeaderboard, getTopPlayers };