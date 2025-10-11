import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import sql from "../config/db";

interface AuthRequest extends Request {
  user?: {
    userId: string;
  };
}

const getUserProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  console.log("request", req.user);

  const userId = req.user?.userId;

  if (!userId) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const users = await sql`
    WITH UserRank AS (
      SELECT id, username, email, image_url, games_played, games_won, rating, location, created_at, updated_at,
             RANK() OVER (ORDER BY rating DESC) as rank
      FROM users Where is_guest = false and is_bot = false
    )
    SELECT *
    FROM UserRank
    WHERE id = ${userId}
  `;

  if (users.length === 0) {
    res.status(404);
    throw new Error("User not found");
  }

  res.status(200).json(users[0]);
});

const updateUserProfile = async (req: Request, res: Response) => {
  res.status(200).json({ message: "update user profile controller" });
};

const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = (page - 1) * limit;

  const users = await sql`
    SELECT 
      id, 
      username, 
      image_url, 
      rating, 
      location, 
      games_played, 
      games_won, 
      created_at
    FROM users
    ORDER BY rating DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const totalUsers = await sql`SELECT COUNT(*) FROM users`;
  const total = totalUsers[0].count;

  res.status(200).json({
    success: true,
    users,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit),
    },
  });
});

export { getUserProfile, updateUserProfile, getUsers };
