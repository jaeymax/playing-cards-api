import { Request, Response } from "express";
import sql from "../config/db";

const getFriends = async (req: Request, res: Response) => {
  const { user_id } = req.body;

  // Fetch all friends from the database for the user wher user_id = ${user_id} or friend_id = ${user_id}
  const friends = await sql`
        SELECT * FROM friends WHERE user_id = ${user_id} OR friend_id = ${user_id}
      `;

  res.json({ friends });
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

export { getFriends, addFriend };
