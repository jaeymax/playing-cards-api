import { Router } from "express";
import {
  getFriends,
  addFriend,
  acceptFriendRequest,
} from "../controllers/friends";

// https://expressjs.com/en/guide/routing.html

const router = Router();

router.get("/", getFriends);

router.post("/add", addFriend);

router.post("/accept", acceptFriendRequest);

export default router;
