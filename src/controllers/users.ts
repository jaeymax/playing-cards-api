import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import sql from "../config/db";

interface AuthRequest extends Request {
  user?: {
    userId: string;
  };
}


interface Division {
  name: string;
  minRating: number;
  maxRating: number;
  color?: string;
}

export const divisions: Division[] = [
  { name: "Rookie", minRating: 0, maxRating: 1199,  color: "#9CA3AF" },
  { name: "Contender", minRating: 1200, maxRating: 1399,  color: "#22C55E"},
  { name: "Strategist", minRating: 1400, maxRating: 1599, color: "#06B6D4" },
  { name: "Expert", minRating: 1600, maxRating: 1799,  color: "#3B82F6" },
  { name: "Master", minRating: 1800, maxRating: 1999, color: "#8B5CF6" },
  { name: "Grandmaster", minRating: 2000, maxRating: 2199,  color: "#F97316" },
  { name: "Legend", minRating: 2200, maxRating: 2399, color: "#EF4444" },
  { name: "Spar God", minRating: 2400, maxRating: Infinity,  color: "#FBBF24" },
];

export const getDivisionInfo = (rating: number) => {
  const currentIndex = divisions.findIndex(
    (d) => rating >= d.minRating && rating <= d.maxRating
  );

  const currentDivision = divisions[currentIndex];
  const nextDivision = divisions[currentIndex + 1] ?? null;

  return {
    rank: currentDivision.name,
    next_rank: nextDivision?.name ?? null,
    rank_color: currentDivision.color,
    current_rank_min_rating: currentDivision.minRating,
    next_rank_min_rating: nextDivision?.minRating ?? null,
    rating_to_next_rank: nextDivision
      ? nextDivision.minRating - rating
      : 0,
  };
};


const getUserProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  console.log("Fetching profile for user ID:", userId);

  if (!userId) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const users = await sql`
    WITH RankedUsers AS (
      SELECT
        id,
        RANK() OVER (ORDER BY rating DESC) AS global_rank
      FROM users
      WHERE is_bot = false
        AND is_guest = false
        AND is_rated = true
    ),
    UserProfile AS (
      SELECT
        u.id,
        u.username,
        u.email,
        u.phone,
        u.is_guest,
        u.is_rated,
        u.peak_rating,
        u.max_winning_streak,
        u.podium_finishes,
        u.current_winning_streak,
        u.gold_medals,
        u.silver_medals,
        u.bronze_medals,
        u.tournaments_played,
        u.tournaments_won,
        u.notification_enabled,
        u.image_url,
        u.games_played,
        u.games_won,
        u.rating,
        u.location,
        u.created_at,
        u.updated_at,
        r.global_rank
      FROM users u
      LEFT JOIN RankedUsers r ON u.id = r.id
      WHERE u.is_bot = false
    )
    SELECT id, username, email, phone, is_guest, is_rated, peak_rating, max_winning_streak, podium_finishes, current_winning_streak, gold_medals, silver_medals, bronze_medals, tournaments_played, tournaments_won, image_url, games_played, games_won, rating, location, created_at, updated_at, global_rank
    FROM UserProfile
    WHERE id = ${userId}
  `;

  if (users.length === 0) {
    res.status(404);
    throw new Error("User not found");
  }

  const user = users[0];

    res.status(200).json({
      ...user,
      ...getDivisionInfo(user.rating),
    });
});

const updateUserProfile = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401);
      throw new Error("Not authorized");
    }

    const { phone, location, country } = req.body;

    if (!phone && !country) {
      res.status(400);
      throw new Error(
        "At least one field (phone or country) must be provided",
      );
    }

    const user = await sql`
      UPDATE users
      SET 
        phone = COALESCE(${phone}, phone),
        country_code = COALESCE(${country}, country_code),
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
