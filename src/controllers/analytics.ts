import { Request, Response } from "express";
import sql from "../config/db";
import expressAsyncHandler from "express-async-handler";

const trackQrVisit = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { campaign, referrer, landingPage } = req.body;

      if (!campaign || typeof campaign !== "string") {
        res.status(400).json({
          success: false,
          message: "Campaign is required",
        });
        return;
      }

      const userAgent = req.headers["user-agent"] || "";

      // Detect device
      let deviceType = "desktop";

      if (/ipad|tablet/i.test(userAgent)) {
        deviceType = "tablet";
      } else if (/mobile|android|iphone|ipod/i.test(userAgent)) {
        deviceType = "mobile";
      }

      // Detect browser
      let browser = "Other";

      if (/edg/i.test(userAgent)) browser = "Edge";
      else if (/opr|opera/i.test(userAgent)) browser = "Opera";
      else if (/chrome|crios/i.test(userAgent)) browser = "Chrome";
      else if (/firefox|fxios/i.test(userAgent)) browser = "Firefox";
      else if (/safari/i.test(userAgent)) browser = "Safari";

      // Detect operating system
      let operatingSystem = "Other";

      if (/windows/i.test(userAgent)) operatingSystem = "Windows";
      else if (/android/i.test(userAgent)) operatingSystem = "Android";
      else if (/iphone|ipad|ipod/i.test(userAgent)) operatingSystem = "iOS";
      else if (/macintosh|mac os/i.test(userAgent)) operatingSystem = "macOS";
      else if (/linux/i.test(userAgent)) operatingSystem = "Linux";

      await sql`
        INSERT INTO qr_visits (
          campaign,
          device_type,
          browser,
          operating_system,
          referrer,
          landing_page
        )
        VALUES (
          ${campaign},
          ${deviceType},
          ${browser},
          ${operatingSystem},
          ${typeof referrer === "string" ? referrer.slice(0, 1000) : null},
          ${typeof landingPage === "string" ? landingPage.slice(0, 500) : null}
        )
      `;

      res.status(201).json({
        success: true,
        message: "Visit recorded",
      });
      return;
    } catch (error) {
      console.error("QR tracking error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to record visit",
      });
      return;
    }
  },
);

export { trackQrVisit };
