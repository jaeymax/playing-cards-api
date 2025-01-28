import { Router } from "express";
import { getFriends, addFriend } from "../controllers/friends";


const router = Router();

router.post('/', getFriends);

router.post('/add', addFriend);

export default router;