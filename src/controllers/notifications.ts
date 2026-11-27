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
        n.reference_id,
        n.actor_id,
        n.created_at,

        CASE
            WHEN n.type = 'friend' THEN
                json_build_object(
                    'id', u.id,
                    'username', u.username,
                    'image_url', u.image_url
                )
            ELSE NULL
        END AS actor,

        CASE
            WHEN n.type = 'achievement' THEN
                json_build_object(
                    'id', a.id,
                    'name', a.name,
                    'description', a.description,
                    'icon', a.icon
                )
            ELSE NULL
        END AS reference

    FROM notifications n

    LEFT JOIN users u
        ON u.id = n.actor_id
        AND n.type = 'friend'

    LEFT JOIN achievements a
        ON a.id = n.reference_id
        AND n.type = 'achievement'

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