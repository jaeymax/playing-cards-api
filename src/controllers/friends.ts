import { Request, Response } from "express";
import sql from "../config/db";

const getFriends = async (req: Request, res: Response) => {
  try {
    // Authenticated user
    const userId = req.user.userId;

    /*
     * A friendship can exist in either direction:
     *
     * requester_id = userId
     * OR
     * addressee_id = userId
     *
     * We use CASE to determine which user is the friend.
     */
    const friends = await sql`
      SELECT
        u.id,
        u.username,
        u.image_url,
        u.rating,
        u.online_status,
        u.last_active,
        u.country_code,
        u.location,
        u.is_guest,
        u.is_bot,
        f.created_at AS friendship_created_at

      FROM friendships f

      JOIN users u
        ON u.id = CASE
          WHEN f.requester_id = ${userId}
            THEN f.addressee_id
          ELSE f.requester_id
        END

      WHERE
        f.status = 'accepted'
        AND (
          f.requester_id = ${userId}
          OR f.addressee_id = ${userId}
        )

      ORDER BY
        u.online_status DESC,
        u.last_active DESC,
        u.username ASC
    `;

    return res.status(200).json({
      friends,
      count: friends.length,
    });
  } catch (error) {
    console.error("Get friends error:", error);

    return res.status(500).json({
      message: "Failed to retrieve friends",
    });
  }
};

const getFriendRequests = async (req: Request, res: Response) => {
  try {
    // Authenticated user — the person receiving the requests
    const userId = req.user.userId;

    /*
     * Get all pending friend requests where the authenticated
     * user is the addressee.
     *
     * Example:
     *
     * requester_id = 15
     * addressee_id = 27
     * status       = pending
     *
     * If user 27 calls this endpoint, user 15 is returned.
     */
    const requests = await sql`
      SELECT
        f.id AS friendship_id,

        f.created_at AS requested_at,

        u.id AS user_id,
        u.username,
        u.image_url,
        u.rating,
        u.online_status,
        u.last_active,
        u.country_code,
        u.location,
        u.is_guest,
        u.is_bot

      FROM friendships f

      INNER JOIN users u
        ON u.id = f.requester_id

      WHERE
        f.addressee_id = ${userId}
        AND f.status = 'pending'

      ORDER BY
        f.created_at DESC
    `;

    return res.status(200).json({
      requests,
      count: requests.length,
    });
  } catch (error) {
    console.error("Get friend requests error:", error);

    return res.status(500).json({
      message: "Failed to retrieve friend requests",
    });
  }
};

const getFriendshipStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    const { friend_id } = req.params;

    if (!friend_id) {
      return res.status(400).json({
        message: "Friend ID is required",
      });
    }

    const friendId = Number(friend_id);

    if (!Number.isInteger(friendId)) {
      return res.status(400).json({
        message: "Invalid friend ID",
      });
    }

    // A user cannot check a friendship with themselves
    if (userId === friendId) {
      return res.status(400).json({
        message: "You cannot check friendship status with yourself",
      });
    }

    // Make sure the other user exists
    const userExists = await sql`
      SELECT id
      FROM users
      WHERE id = ${friendId}
      LIMIT 1
    `;

    if (userExists.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    /*
     * Check both directions because the relationship may be:
     *
     * userId → friendId
     *
     * OR
     *
     * friendId → userId
     */
    const friendship = await sql`
      SELECT
        id,
        requester_id,
        addressee_id,
        status,
        created_at,
        updated_at
      FROM friendships
      WHERE
        (
          requester_id = ${userId}
          AND addressee_id = ${friendId}
        )
        OR
        (
          requester_id = ${friendId}
          AND addressee_id = ${userId}
        )
      LIMIT 1
    `;

    // No relationship exists
    if (friendship.length === 0) {
      return res.status(200).json({
        status: "none",
        direction: null,
        friendship_id: null,
      });
    }

    const relationship = friendship[0];

    /*
     * Determine the direction of a pending request.
     *
     * If the authenticated user is the requester:
     *     outgoing
     *
     * If the authenticated user is the addressee:
     *     incoming
     *
     * For accepted/declined/cancelled relationships,
     * direction isn't relevant.
     */
    let direction = null;

    if (relationship.status === "pending") {
      direction =
        relationship.requester_id === userId ? "outgoing" : "incoming";
    }

    return res.status(200).json({
      status: relationship.status,
      direction,
      friendship_id: relationship.id,
      created_at: relationship.created_at,
      updated_at: relationship.updated_at,
    });
  } catch (error) {
    console.error("Get friendship status error:", error);

    return res.status(500).json({
      message: "Failed to retrieve friendship status",
    });
  }
};

const getSentFriendRequests = async (req: Request, res: Response) => {
  try {
    // Authenticated user — the person who sent the requests
    const userId = req.user.userId;

    /*
     * Get all pending friend requests sent by the
     * authenticated user.
     *
     * Example:
     *
     * requester_id = 15
     * addressee_id = 27
     * status       = pending
     *
     * If user 15 calls this endpoint, user 27 is returned.
     */
    const requests = await sql`
      SELECT
        f.id AS friendship_id,

        f.created_at AS requested_at,

        u.id AS user_id,
        u.username,
        u.image_url,
        u.rating,
        u.online_status,
        u.last_active,
        u.country_code,
        u.location,
        u.is_guest,
        u.is_bot

      FROM friendships f

      INNER JOIN users u
        ON u.id = f.addressee_id

      WHERE
        f.requester_id = ${userId}
        AND f.status = 'pending'

      ORDER BY
        f.created_at DESC
    `;

    return res.status(200).json({
      requests,
      count: requests.length,
    });
  } catch (error) {
    console.error("Get sent friend requests error:", error);

    return res.status(500).json({
      message: "Failed to retrieve sent friend requests",
    });
  }
};

const sendFriendRequest = async (req: Request, res: Response) => {
  try {
    // The authenticated user sending the request
    const requesterId = req.user.userId;

    // Only the person being requested should come from the body
    const { friend_id } = req.body;

    if (!friend_id) {
      return res.status(400).json({
        message: "Friend ID is required",
      });
    }

    const addresseeId = Number(friend_id);

    if (!Number.isInteger(addresseeId)) {
      return res.status(400).json({
        message: "Invalid friend ID",
      });
    }

    // Prevent adding yourself
    if (requesterId === addresseeId) {
      return res.status(400).json({
        message: "You cannot send a friend request to yourself",
      });
    }

    // Check that the target user exists
    const targetUser = await sql`
      SELECT id, username, is_guest, is_bot
      FROM users
      WHERE id = ${addresseeId}
      LIMIT 1
    `;

    if (targetUser.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Check whether a relationship already exists in either direction
    const existingRelationship = await sql`
      SELECT
        id,
        requester_id,
        addressee_id,
        status
      FROM friendships
      WHERE
        (
          requester_id = ${requesterId}
          AND addressee_id = ${addresseeId}
        )
        OR
        (
          requester_id = ${addresseeId}
          AND addressee_id = ${requesterId}
        )
      LIMIT 1
    `;

    if (existingRelationship.length > 0) {
      const relationship = existingRelationship[0];

      // Already friends
      if (relationship.status === "accepted") {
        return res.status(409).json({
          message: "You are already friends with this user",
        });
      }

      // You already sent them a request
      if (
        relationship.status === "pending" &&
        relationship.requester_id === requesterId
      ) {
        return res.status(409).json({
          message: "Friend request already sent",
        });
      }

      // They already sent you a request
      if (
        relationship.status === "pending" &&
        relationship.requester_id === addresseeId
      ) {
        return res.status(409).json({
          message: "This user has already sent you a friend request",
          code: "INCOMING_REQUEST_EXISTS",
        });
      }

      // Previous request was declined/cancelled.
      // We can reuse the relationship record instead of creating another one.
      if (
        relationship.status === "declined" ||
        relationship.status === "cancelled"
      ) {
        const updatedRelationship = await sql`
          UPDATE friendships
          SET
            requester_id = ${requesterId},
            addressee_id = ${addresseeId},
            status = 'pending',
            responded_at = NULL,
            updated_at = NOW()
          WHERE id = ${relationship.id}
          RETURNING *
        `;

        return res.status(201).json({
          message: "Friend request sent successfully",
          friendship: updatedRelationship[0],
        });
      }
    }

    // Create a new friend request
    const newFriendship = await sql`
      INSERT INTO friendships (
        requester_id,
        addressee_id,
        status
      )
      VALUES (
        ${requesterId},
        ${addresseeId},
        'pending'
      )
      RETURNING *
    `;

    return res.status(201).json({
      message: "Friend request sent successfully",
      friendship: newFriendship[0],
    });
  } catch (error: any) {
    console.error("Send friend request error:", error);

    // Handles a race condition where two requests are submitted
    // at almost exactly the same time.
    if (error.code === "23505") {
      return res.status(409).json({
        message: "A friendship or friend request already exists",
      });
    }

    return res.status(500).json({
      message: "Failed to send friend request",
    });
  }
};

const acceptFriendRequest = async (req: Request, res: Response) => {
  try {
    // Authenticated user — the person accepting the request
    const userId = req.user.userId;

    // ID of the friendship/request record
    const { friendship_id } = req.body;

    if (!friendship_id) {
      return res.status(400).json({
        message: "Friendship ID is required",
      });
    }

    const friendshipId = Number(friendship_id);

    if (!Number.isInteger(friendshipId)) {
      return res.status(400).json({
        message: "Invalid friendship ID",
      });
    }

    /*
     * Only the addressee can accept the request.
     *
     * Example:
     *
     * requester_id = 15
     * addressee_id = 27
     * status       = pending
     *
     * Only user 27 can accept it.
     */
    const updatedFriendship = await sql`
      UPDATE friendships
      SET
        status = 'accepted',
        responded_at = NOW(),
        updated_at = NOW()
      WHERE
        id = ${friendshipId}
        AND addressee_id = ${userId}
        AND status = 'pending'
      RETURNING *
    `;

    // No matching pending request
    if (updatedFriendship.length === 0) {
      // Check whether the friendship exists to provide a better response
      const existingFriendship = await sql`
        SELECT
          id,
          requester_id,
          addressee_id,
          status
        FROM friendships
        WHERE id = ${friendshipId}
        LIMIT 1
      `;

      if (existingFriendship.length === 0) {
        return res.status(404).json({
          message: "Friend request not found",
        });
      }

      const friendship = existingFriendship[0];

      // Someone other than the recipient tried to accept it
      if (friendship.addressee_id !== userId) {
        return res.status(403).json({
          message: "You are not authorized to accept this friend request",
        });
      }

      // Request was already accepted
      if (friendship.status === "accepted") {
        return res.status(409).json({
          message: "You are already friends with this user",
        });
      }

      // Request was declined
      if (friendship.status === "declined") {
        return res.status(409).json({
          message: "This friend request has already been declined",
        });
      }

      // Request was cancelled
      if (friendship.status === "cancelled") {
        return res.status(409).json({
          message: "This friend request has been cancelled",
        });
      }

      return res.status(409).json({
        message: "Friend request cannot be accepted",
      });
    }

    const friendship = updatedFriendship[0];

    return res.status(200).json({
      message: "Friend request accepted successfully",
      friendship,
    });
  } catch (error) {
    console.error("Accept friend request error:", error);

    return res.status(500).json({
      message: "Failed to accept friend request",
    });
  }
};

const declineFriendRequest = async (req: Request, res: Response) => {
  try {
    // Authenticated user — the person receiving the request
    const userId = req.user.userId;

    // ID of the friendship/request record
    const { friendship_id } = req.body;

    if (!friendship_id) {
      return res.status(400).json({
        message: "Friendship ID is required",
      });
    }

    const friendshipId = Number(friendship_id);

    if (!Number.isInteger(friendshipId)) {
      return res.status(400).json({
        message: "Invalid friendship ID",
      });
    }

    /*
     * Only the addressee can decline the request.
     *
     * Example:
     *
     * requester_id = 15
     * addressee_id = 27
     * status       = pending
     *
     * Only user 27 can decline it.
     */
    const updatedFriendship = await sql`
      UPDATE friendships
      SET
        status = 'declined',
        responded_at = NOW(),
        updated_at = NOW()
      WHERE
        id = ${friendshipId}
        AND addressee_id = ${userId}
        AND status = 'pending'
      RETURNING *
    `;

    // No matching pending request
    if (updatedFriendship.length === 0) {
      // Check whether the friendship/request exists
      const existingFriendship = await sql`
        SELECT
          id,
          requester_id,
          addressee_id,
          status
        FROM friendships
        WHERE id = ${friendshipId}
        LIMIT 1
      `;

      // Request doesn't exist
      if (existingFriendship.length === 0) {
        return res.status(404).json({
          message: "Friend request not found",
        });
      }

      const friendship = existingFriendship[0];

      // Someone other than the recipient tried to decline it
      if (friendship.addressee_id !== userId) {
        return res.status(403).json({
          message: "You are not authorized to decline this friend request",
        });
      }

      // Already accepted
      if (friendship.status === "accepted") {
        return res.status(409).json({
          message: "You are already friends with this user",
        });
      }

      // Already declined
      if (friendship.status === "declined") {
        return res.status(409).json({
          message: "This friend request has already been declined",
        });
      }

      // Request was cancelled by the sender
      if (friendship.status === "cancelled") {
        return res.status(409).json({
          message: "This friend request has been cancelled",
        });
      }

      return res.status(409).json({
        message: "Friend request cannot be declined",
      });
    }

    const friendship = updatedFriendship[0];

    return res.status(200).json({
      message: "Friend request declined successfully",
      friendship,
    });
  } catch (error) {
    console.error("Decline friend request error:", error);

    return res.status(500).json({
      message: "Failed to decline friend request",
    });
  }
};

const cancelFriendRequest = async (req: Request, res: Response) => {
  try {
    // Authenticated user — the person who sent the request
    const userId = req.user.userId;

    // ID of the friendship/request record
    const { friendship_id } = req.body;

    if (!friendship_id) {
      return res.status(400).json({
        message: "Friendship ID is required",
      });
    }

    const friendshipId = Number(friendship_id);

    if (!Number.isInteger(friendshipId)) {
      return res.status(400).json({
        message: "Invalid friendship ID",
      });
    }

    /*
     * Only the requester can cancel the request.
     *
     * Example:
     *
     * requester_id = 15
     * addressee_id = 27
     * status       = pending
     *
     * Only user 15 can cancel it.
     */
    const updatedFriendship = await sql`
      UPDATE friendships
      SET
        status = 'cancelled',
        responded_at = NOW(),
        updated_at = NOW()
      WHERE
        id = ${friendshipId}
        AND requester_id = ${userId}
        AND status = 'pending'
      RETURNING *
    `;

    // No matching pending request
    if (updatedFriendship.length === 0) {
      // Check whether the friendship/request exists
      const existingFriendship = await sql`
        SELECT
          id,
          requester_id,
          addressee_id,
          status
        FROM friendships
        WHERE id = ${friendshipId}
        LIMIT 1
      `;

      // Request doesn't exist
      if (existingFriendship.length === 0) {
        return res.status(404).json({
          message: "Friend request not found",
        });
      }

      const friendship = existingFriendship[0];

      // Someone other than the requester tried to cancel it
      if (friendship.requester_id !== userId) {
        return res.status(403).json({
          message: "You are not authorized to cancel this friend request",
        });
      }

      // Already accepted
      if (friendship.status === "accepted") {
        return res.status(409).json({
          message: "This request has already been accepted",
        });
      }

      // Already declined
      if (friendship.status === "declined") {
        return res.status(409).json({
          message: "This friend request has already been declined",
        });
      }

      // Already cancelled
      if (friendship.status === "cancelled") {
        return res.status(409).json({
          message: "This friend request has already been cancelled",
        });
      }

      return res.status(409).json({
        message: "Friend request cannot be cancelled",
      });
    }

    const friendship = updatedFriendship[0];

    return res.status(200).json({
      message: "Friend request cancelled successfully",
      friendship,
    });
  } catch (error) {
    console.error("Cancel friend request error:", error);

    return res.status(500).json({
      message: "Failed to cancel friend request",
    });
  }
};

const removeFriend = async (req: Request, res: Response) => {
  try {
    // Authenticated user
    const userId = req.user.userId;

    // The friend being removed
    const { friend_id } = req.body;

    if (!friend_id) {
      return res.status(400).json({
        message: "Friend ID is required",
      });
    }

    const friendId = Number(friend_id);

    if (!Number.isInteger(friendId)) {
      return res.status(400).json({
        message: "Invalid friend ID",
      });
    }

    // Prevent removing yourself
    if (userId === friendId) {
      return res.status(400).json({
        message: "You cannot remove yourself as a friend",
      });
    }

    /*
     * Find and remove the accepted friendship.
     *
     * The relationship could have been created in either direction:
     *
     * requester_id = userId
     * addressee_id = friendId
     *
     * OR
     *
     * requester_id = friendId
     * addressee_id = userId
     *
     * Therefore we check both directions.
     */
    const removedFriendship = await sql`
      DELETE FROM friendships
      WHERE
        status = 'accepted'
        AND (
          (
            requester_id = ${userId}
            AND addressee_id = ${friendId}
          )
          OR
          (
            requester_id = ${friendId}
            AND addressee_id = ${userId}
          )
        )
      RETURNING *
    `;

    // No accepted friendship was found
    if (removedFriendship.length === 0) {
      return res.status(404).json({
        message: "You are not friends with this user",
      });
    }

    return res.status(200).json({
      message: "Friend removed successfully",
      friendship: removedFriendship[0],
    });
  } catch (error) {
    console.error("Remove friend error:", error);

    return res.status(500).json({
      message: "Failed to remove friend",
    });
  }
};

const searchUsers = async (req: Request, res: Response) => {
  try {
    const userId = req.user.userId;

    const search = String(req.query.search || "").trim();

    const page = Math.max(Number(req.query.page) || 1, 1);

    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

    const offset = (page - 1) * limit;

    if (!search) {
      return res.status(400).json({
        message: "Search term is required",
      });
    }

    /*
     * Search users by username.
     *
     * ILIKE makes the search case-insensitive.
     *
     * Example:
     *
     * "kof" will find:
     *     Kofi
     *     Kofi123
     *     kingkofi
     */
    const users = await sql`
      SELECT
        u.id,
        u.username,
        u.image_url,
        u.rating,
        u.online_status,
        u.last_active,
        u.country_code,
        u.location,
        u.is_guest,
        u.is_bot,

        CASE
          WHEN f.status IS NULL THEN 'none'
          ELSE f.status
        END AS friendship_status,

        CASE
          WHEN f.status = 'pending'
               AND f.requester_id = ${userId}
            THEN 'outgoing'

          WHEN f.status = 'pending'
               AND f.addressee_id = ${userId}
            THEN 'incoming'

          ELSE NULL
        END AS friendship_direction,

        f.id AS friendship_id

      FROM users u

      /*
       * Find a relationship between the current user
       * and each search result.
       */
      LEFT JOIN friendships f
        ON (
          (
            f.requester_id = ${userId}
            AND f.addressee_id = u.id
          )
          OR
          (
            f.requester_id = u.id
            AND f.addressee_id = ${userId}
          )
        )

      WHERE
        u.id <> ${userId}

        AND u.username ILIKE ${"%" + search + "%"}

      ORDER BY
        CASE
          WHEN LOWER(u.username) = LOWER(${search})
            THEN 0

          WHEN LOWER(u.username) LIKE LOWER(${search + "%"})
            THEN 1

          ELSE 2
        END,

        u.online_status DESC,
        u.rating DESC,
        u.username ASC

      LIMIT ${limit}
      OFFSET ${offset}
    `;

    /*
     * Get total number of matching users.
     * This is useful for pagination.
     */
    const totalResult = await sql`
      SELECT COUNT(*)::INTEGER AS total
      FROM users
      WHERE
        id <> ${userId}
        AND username ILIKE ${"%" + search + "%"}
    `;

    const total = totalResult[0]?.total || 0;

    return res.status(200).json({
      users,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Search users error:", error);

    return res.status(500).json({
      message: "Failed to search users",
    });
  }
};

export {
  getFriends,
  getFriendRequests,
  getFriendshipStatus,
  getSentFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  sendFriendRequest,
  cancelFriendRequest,
  removeFriend,
  searchUsers
};
