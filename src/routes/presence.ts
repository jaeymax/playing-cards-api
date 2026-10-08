import express from "express";
import {
  getOnlineUsers,
  getOnlineUserCountController,
  getOnlineUsersWithStatusController,
} from "../controllers/presence";
import optionalAuthMiddleware from "../middlewares/optionalAuthMiddleware";


const router = express.Router();

router.get("/online", getOnlineUsers);
router.get("/online/count", getOnlineUserCountController);
router.get('/online-users', optionalAuthMiddleware, getOnlineUsersWithStatusController);

export default router;