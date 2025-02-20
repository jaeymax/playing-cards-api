import { Router } from "express";
import { getFriends, addFriend } from "../controllers/friends";


const router = Router();

router.get('/', getFriends);

router.post('/add', addFriend);

export default router;