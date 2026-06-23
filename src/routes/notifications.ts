import express from "express";
import authMiddleware from "../middlewares/authMiddleware";
import { getUserNotifications, markNotificationAsRead } from "../controllers/notifications";
import sql from "../config/db";
const router = express.Router();




router.get("/user/:id", authMiddleware, getUserNotifications);
router.post("/mark-as-read/:notificationId", authMiddleware, markNotificationAsRead);
router.post("/register", authMiddleware, async (req, res) => {
  // Placeholder for notification registration logic
  const userId = req.user.id; // Assuming user ID is available in the request object after authentication
    const { token } = req.body;
    if(!token) {
      return res.status(400).json({ message: "Token is required" });
    }
    // update the user's push_token and notification_enabled in the database

    await sql`UPDATE users SET push_token = ${token}, notification_enabled = 'true' WHERE id = ${userId}`;
  res.status(200).json({ message: "Notification registered successfully" });
});


export default router;