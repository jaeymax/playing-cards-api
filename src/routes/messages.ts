import express from "express";
import sql from "../config/db";
import asyncHandler from "express-async-handler";
const router = express.Router();

router.get("/global", asyncHandler(async (req, res) => {
  const messages = await sql`
        SELECT 
            m.id,
            m.message as text,
            m.created_at as timestamp,
            u.id as sender_id,
            u.username as sender_name,
            u.image_url as avatar
        FROM global_chat_messages m
        JOIN users u ON m.user_id = u.id
        ORDER BY m.created_at ASC
    `;
  res.json(messages);
}));

router.post("/global", asyncHandler(async (req, res) => {
  const { user_id, message } = req.body;
  await sql`insert into global_chat_messages (user_id, message) values (${user_id}, ${message})`;
  res.status(201).json({ message: "Message sent successfully" });
}));

export default router;
