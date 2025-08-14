import { Router } from "express";
import authMiddleware from "../middlewares/authMiddleware";

import {
  registerUser,
  loginUser,
  sendOTPEmail,
  verifyOTP,
  refreshAccessToken,
  logoutUser,
  forgotPassword,
  resetPassword,
  createGuest,
  upgradeGuest,
  googleSignup,
  googleLogin,
} from "../controllers/auth";

const router = Router();

router.post("/register", registerUser);

router.post("/login", loginUser);

router.post("/send-otp", sendOTPEmail);

router.post("/verify-otp", verifyOTP);

router.post("/token", refreshAccessToken);

router.post("/logout", logoutUser);

router.post("/forgot-password", forgotPassword);

router.post("/reset-password", resetPassword);

router.post("/guest", createGuest);

router.post("/upgrade", authMiddleware, upgradeGuest);

router.post("/google/signup", googleSignup);

router.post("/google/login", googleLogin);

//router.get('/', authMiddleware, getUsers);

export default router;
