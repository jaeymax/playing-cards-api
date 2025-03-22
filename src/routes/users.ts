import { Router } from "express";
import { getUserProfile, updateUserProfile } from "../controllers/users";
import authMiddleware from "../middlewares/authMiddleware";

const router = Router();

// Protected route for getting own profile - should come first
router.get("/me", authMiddleware, getUserProfile);

// Generic routes for any user ID - should come after specific routes
router.get("/:id", getUserProfile);
router.put("/:id", updateUserProfile);

export default router;
