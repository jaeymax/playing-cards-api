import { Router } from "express";
import uploadMiddleware from "../middlewares/uploadMiddleware";
import {
  uploadProfilePicture
} from "../controllers/profile";
import authMiddleware from "../middlewares/authMiddleware";

const router = Router();

const upload = uploadMiddleware("profile_pictures");

router.post("/upload",authMiddleware, upload.single("file"), uploadProfilePicture);

export default router;
