import { Request, Response } from "express";
import sql from "../config/db";

const getFriends = async (req: Request, res: Response) => {
  const { user_id } = req.body;

  try {
    const friends = await sql`
      WITH friend_pairs AS (
        SELECT 
          CASE 
            WHEN user_id = ${user_id} THEN friend_id
            ELSE user_id
          END AS friend_id,
          status
        FROM friends 
        WHERE (user_id = ${user_id} OR friend_id = ${user_id})
        AND status = 'pending'
      )
      SELECT 
        u.id,
        u.username,
        u.image_url,
        u.rating,
        u.location,
        u.games_played,
        u.games_won
      FROM friend_pairs fp
      JOIN users u ON u.id = fp.friend_id
    `;

    res.json({ success: true, friends });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Error fetching friends",
      error: error.message,
    });
  }
};

// I'm trying to see if this keyboard is worth it. honestly speaking i don't think it does

const addFriend = async (req: Request, res: Response) => {
  //res.json({message:"add Friend controller"});
  const { user_id, friend_id } = req.body;
  // Insert the friend into the database
  const newFriend = await sql`
        INSERT INTO friends (user_id, friend_id) 
        VALUES (${user_id}, ${friend_id})
        RETURNING *
      `;

  res.json({ newFriend });
};

const acceptFriendRequest = async (req: Request, res: Response) => {
  const { user_id, friend_id } = req.body;

  try {
    // Check if friend request exists and is pending
    const pendingRequest = await sql`
      SELECT * FROM friends 
      WHERE user_id = ${friend_id} 
      AND friend_id = ${user_id}
      AND status = 'pending'
    `;

    if (pendingRequest.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No pending friend request found",
      });
    }

    // Update the friend request status to accepted
    const acceptedRequest = await sql`
      UPDATE friends
      SET status = 'accepted'
      WHERE user_id = ${friend_id}
      AND friend_id = ${user_id}
      RETURNING *
    `;

    res.status(200).json({
      success: true,
      message: "Friend request accepted",
      friendship: acceptedRequest[0],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Error accepting friend request",
      error: error.message,
    });
  }
};

export { getFriends, addFriend, acceptFriendRequest };
