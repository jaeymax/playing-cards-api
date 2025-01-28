import { Router } from "express";
import authMiddleware from "../middlewares/authMiddleware";
import { registerUser, loginUser } from "../controllers/auth";

const router = Router();

router.post('/', registerUser);

router.post('/login', loginUser);

//router.get('/', authMiddleware, getUsers);

export default router;