import { Router } from "express";
import { getUserProfile, getUsers, updateUserProfile } from "../controllers/users";
import authMiddleware from "../middlewares/authMiddleware";

const router = Router();

// Protected route for getting own profile - should come first
router.get("/me", authMiddleware, getUserProfile);
router.get('/', getUsers);

// Generic routes for any user ID - should come after specific routes
router.get("/:id", getUserProfile);
router.put("/:id", updateUserProfile);

export default router;
