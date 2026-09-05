import { Router } from "express";
import {
  getFriends,
  getFriendRequests,
  acceptFriendRequest,
  sendFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  getSentFriendRequests,
  getFriendshipStatus,
  searchUsers
} from "../controllers/friends";
import authMiddleware from "../middlewares/authMiddleware";

// https://expressjs.com/en/guide/routing.html

const router = Router();

router.get("/", authMiddleware, getFriends);
router.get("/requests", authMiddleware, getFriendRequests);
router.get("/sent-requests", authMiddleware, getSentFriendRequests);
router.get("/status/:friend_id", authMiddleware, getFriendshipStatus);
router.get("/search", authMiddleware, searchUsers);
router.post("/add", authMiddleware, sendFriendRequest);
router.post("/accept", authMiddleware, acceptFriendRequest);
router.post("/decline", authMiddleware, declineFriendRequest);
router.post("/cancel", authMiddleware, cancelFriendRequest);
router.post("/remove", authMiddleware, removeFriend);

export default router;
