import { Router } from "express";
import { getFriends, addFriend } from "../controllers/friends";

// https://expressjs.com/en/guide/routing.html

const router = Router();

router.get('/', getFriends);

router.post('/add', addFriend);

export default router;