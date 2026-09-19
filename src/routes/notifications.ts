import express from "express";
import authMiddleware from "../middlewares/authMiddleware";
import { getUserNotifications, markNotificationAsRead } from "../controllers/notifications";
import sql from "../config/db";
const router = express.Router();




router.get("/user/:id", authMiddleware, getUserNotifications);
router.post("/mark-as-read/:notificationId", authMiddleware, markNotificationAsRead);
router.post("/register", authMiddleware, async (req, res) => {
  // Placeholder for notification registration logic
  const userId = req.user.userId; // Assuming user ID is available in the request object after authentication
    const { token } = req.body;
    if(!token) {
      return res.status(400).json({ message: "Token is required" });
    }
    // update the user's push_token and notification_enabled in the database

    await sql`UPDATE users SET push_token = ${token}, notification_enabled = 'true' WHERE id = ${userId}`;
  res.status(200).json({ message: "Notification registered successfully" });
});

router.post(
  "/register/device",
  authMiddleware,
  async (req, res) => {
    try {
      const userId = req.user.userId;

      const {
        installationId,
        token,
        permissionStatus,
        platform,
        browser,
      } = req.body;

      if (!installationId) {
        return res.status(400).json({
          message: "Installation ID is required",
        });
      }

      const validPermissionStatuses = [
        "default",
        "granted",
        "denied",
      ];

      if (
        !permissionStatus ||
        !validPermissionStatuses.includes(permissionStatus)
      ) {
        return res.status(400).json({
          message: "Invalid permission status",
        });
      }

      const result = await sql`
        INSERT INTO user_fcm_tokens (
          user_id,
          installation_id,
          token,
          permission_status,
          platform,
          browser,
          is_active,
          last_used_at,
          updated_at
        )
        VALUES (
          ${userId},
          ${installationId},
          ${token || null},
          ${permissionStatus},
          ${platform || null},
          ${browser || null},
          TRUE,
          NOW(),
          NOW()
        )

        ON CONFLICT (user_id, installation_id)
        DO UPDATE SET
          token = COALESCE(
            EXCLUDED.token,
            user_fcm_tokens.token
          ),
          permission_status = EXCLUDED.permission_status,
          platform = EXCLUDED.platform,
          browser = EXCLUDED.browser,
          is_active = TRUE,
          last_used_at = NOW(),
          updated_at = NOW()

        RETURNING
          id,
          installation_id,
          permission_status,
          platform,
          browser,
          is_active,
          last_used_at,
          created_at,
          updated_at
      `;

      return res.status(200).json({
        message: "Device registered successfully",
        device: result[0],
      });

    } catch (error) {
      console.error(
        "Error registering device:",
        error
      );

      return res.status(500).json({
        message: "Failed to register device",
      });
    }
  }
);

router.get(
  "/register/device",
  authMiddleware,
  async (req, res) => {
    try {
      const userId = req.user.userId;

      const { installationId } = req.query;
      console.log(req.query);

      if (!installationId) {
        return res.status(400).json({
          message: "Installation ID is required",
        });
      }

      const result = await sql`
        SELECT
          id,
          installation_id,
          permission_status,
          platform,
          browser,
          is_active,
          last_used_at,
          created_at,
          updated_at
        FROM user_fcm_tokens
        WHERE user_id = ${userId}
          AND installation_id = ${installationId}
        LIMIT 1
      `;

      if (result.length === 0) {
        return res.status(404).json({
          message: "Device not registered",
          device: null,
        });
      }

      return res.status(200).json({
        device: result[0],
      });

    } catch (error) {
      console.error(
        "Error getting device:",
        error
      );

      return res.status(500).json({
        message: "Failed to get device",
      });
    }
  }
);

export default router;