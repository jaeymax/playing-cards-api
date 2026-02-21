import express from "express";
import authMiddleware from "../middlewares/authMiddleware";
import { getUserNotifications, markNotificationAsRead } from "../controllers/notifications";
const router = express.Router();




router.get("/user/:id", authMiddleware, getUserNotifications);
router.post("/mark-as-read/:notificationId", authMiddleware, markNotificationAsRead);

export default router;