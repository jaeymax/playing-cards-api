import { Request, Response } from "express";
import expressAsyncHandler from "express-async-handler";
import {
  getOnlineUserIds,
  getOnlineUserCount,
  getOnlineUsersWithStatus,
} from "../services/presenceService";
import sql from "../config/db";
import { getDivisionInfo } from "./users";

export const getOnlineUsers = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const userIds = await getOnlineUserIds();

    if (userIds.length === 0) {
      res.status(200).json({
        success: true,
        players: [],
        count: 0,
      });
      return;
    }

    const players = await sql`
      SELECT
        id,
        username,
        image_url,
        rating,
        online_status
      FROM users
      WHERE id = ANY(${userIds.map(Number)})
      ORDER BY rating DESC
    `;

    res.status(200).json({
      success: true,
      players,
      count: players.length,
    });
  }
);

export const getOnlineUsersWithStatusController = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const userIds = await getOnlineUsersWithStatus();

    const currentUserId = req.user?.userId;

    console.log("userIds", userIds);

    if (userIds.length === 0) {
      res.status(200).json({
        success: true,
        players: [],
        count: 0,
      });
      return;
    }

    const players = await sql`
      SELECT
        id,
        username,
        image_url,
        rating,
        online_status
      FROM users
      WHERE id = ANY(${userIds.filter((user) => user.userId != currentUserId).map((user) => Number(user.userId))})
      ORDER BY rating DESC
    `;

    const playersWithStatus = players.map((player) => {
      const userStatus = userIds.find(
        (user) => Number(user.userId) === player.id
      );

      return {
        ...player,
        ...getDivisionInfo(player.rating),
        status: userStatus?.status,
      };
    });


    res.status(200).json({
      success: true,
      players: playersWithStatus,
      count: playersWithStatus.length,
    });
  }
);

export const getOnlineUserCountController = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const count = await getOnlineUserCount();

    res.status(200).json({
      success: true,
      count,
    });
  }
);

