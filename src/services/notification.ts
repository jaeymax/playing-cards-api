import { getMessaging } from "firebase-admin/messaging";
import sql from "../config/db";

export async function getUserNotificationTokens(
  userId: number
) {
  const result = await sql`
    SELECT
      id,
      token,
      installation_id
    FROM user_fcm_tokens
    WHERE user_id = ${userId}
      AND permission_status = 'granted'
      AND is_active = TRUE
      AND token IS NOT NULL
  `;

  return result;
}

export async function sendNotificationToUser(
  userId: number,
  title: string,
  body: string,
  link: string = "https://www.sparplay.com"
) {
  const devices =
    await getUserNotificationTokens(userId);

  const results = [];

  for (const device of devices) {
    const result =
      await sendPushNotification(
        device.token,
        title,
        body,
        link
      );

      if (!result.success) {
    await sql`
      UPDATE user_fcm_tokens
      SET
        is_active = FALSE,
        updated_at = NOW()
      WHERE id = ${device.id}
    `;
    }

    
    results.push({
      deviceId: device.id,
      token: device.token,
      ...result,
    });
  }




  return results;
}

export const sendPushNotification = async (
  token: string,
  title: string,
  body: string,
  link: string = "https://www.sparplay.com"
) => {
  try {
    const message = {
      token,

      data: {
        title,
        body,
        link,
      },
    };

    const response =
      await getMessaging().send(message);

    return {
      success: true,
      response,
    };

  } catch (error: any) {
    console.error(
      "Error sending push notification:",
      error
    );

    return {
      success: false,
      error,
    };
  }
};