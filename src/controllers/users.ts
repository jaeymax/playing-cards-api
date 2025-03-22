import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import sql from "../config/db";

interface AuthRequest extends Request {
  user?: {
    userId: string;
  };
}

const getUserProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  console.log('request', req.user);
  
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const users = await sql`
        SELECT id, username, email, image_url, games_played, games_won, rating, location, created_at, updated_at
        FROM users
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

export { getUserProfile, updateUserProfile };
