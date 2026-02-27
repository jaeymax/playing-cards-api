import { Request, Response } from "express";
import sql from "../config/db";
import type { AuthenticatedRequest } from "../../types/index";
import expressAsyncHandler from "express-async-handler";




export const getUserNotifications = expressAsyncHandler(async(req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  console.log("Fetching notifications for user ID:", id);
  if(!id){
    res.status(400).json({ message: "User ID is required." });
    return;
  }

  const notifications = await sql`
        SELECT 
            n.id,
            n.type,
            n.title,
            n.message,
            n.is_read,
            n.action,
            n.created_at
        FROM notifications n
        WHERE n.user_id = ${id}
        ORDER BY n.created_at DESC
    `;
  res.json(notifications);
});

export const markNotificationAsRead = expressAsyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { notificationId } = req.params;
  await sql`
        UPDATE notifications
        SET is_read = TRUE
        WHERE id = ${notificationId}
    `;
  res.status(200).json({ message: "Notification marked as read." });
});



export const markAllNotificationsAsRead = expressAsyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.params;
  await sql`
        UPDATE notifications
        SET is_read = TRUE
        WHERE user_id = ${userId}
    `;
  res.status(200).json({ message: "All notifications marked as read." });
});


export const deleteNotification = expressAsyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { notificationId } = req.params;
  await sql`
        DELETE FROM notifications
        WHERE id = ${notificationId}
    `;
  res.status(200).json({ message: "Notification deleted." });
})

export const deleteAllNotifications = expressAsyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.params;
  await sql`
        DELETE FROM notifications
        WHERE user_id = ${userId}
    `;
  res.status(200).json({ message: "All notifications deleted." });
})