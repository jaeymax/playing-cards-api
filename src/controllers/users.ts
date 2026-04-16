import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import sql from "../config/db";

interface AuthRequest extends Request {
  user?: {
    userId: string;
  };
}

const getUserProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const users = await sql`
    WITH UserRank AS (
      SELECT u.id, u.username, u.email, u.phone, u.is_guest, u.is_rated, u.gold_medals, u.silver_medals, u.bronze_medals, u.tournaments_played, u.tournaments_won, u.image_url, u.games_played, u.games_won, u.rating, u.location, u.created_at, u.updated_at,
             RANK() OVER (ORDER BY u.rating DESC) as rank,

             w.balance
      FROM users u

      LEFT JOIN wallets w ON u.id = w.user_id

      WHERE u.is_bot = false
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

const updateUserProfile = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401);
      throw new Error("Not authorized");
    }

    const { phone, location } = req.body;

    if (!phone && !location) {
      res.status(400);
      throw new Error(
        "At least one field (phone or location) must be provided",
      );
    }

    const user = await sql`
      UPDATE users
      SET 
        phone = COALESCE(${phone}, phone),
        location = COALESCE(${location}, location),
        updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, username, email, phone, is_guest, image_url, games_played, games_won, rating, location, created_at, updated_at
    `;

    if (user.length === 0) {
      res.status(404);
      throw new Error("User not found");
    }

    res.status(200).json(user[0]);
  },
);

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
