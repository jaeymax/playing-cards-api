import { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import asyncHandler = require("express-async-handler");
import { generateTokens, verifyRefreshToken } from "../utils/generateToken";
import sql from "../config/db";
import { Resend } from "resend";
import crypto from "crypto";

// Email configuration
const resend = new Resend(process.env.RESEND_API_KEY);

const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTPEmail = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;

    if (!email) {
      res.status(400);
      throw new Error("Email is required");
    }

    // Check if email already exists
    const existingUser = await sql`select * from users where email = ${email}`;
    if (existingUser.length > 0) {
      res.status(409);
      throw new Error("Email already registered");
    }

    const otp = generateOTP();

    // Store OTP in database with expiration (15 minutes)
    await sql`
      INSERT INTO otp_verification (email, otp, expires_at)
      VALUES (${email}, ${otp}, NOW() + INTERVAL '15 minutes')
      ON CONFLICT (email) 
      DO UPDATE SET otp = ${otp}, expires_at = NOW() + INTERVAL '15 minutes'
    `;

    // Send email using Resend
    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: "Your OTP for Registration",
      text: `Your OTP is: ${otp}. This code will expire in 15 minutes.`,
    });

    res.status(200).json({ message: "OTP sent successfully" });
  }
);

const verifyOTP = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { email, otp } = req.body;

    if (!email || !otp) {
      res.status(400);
      throw new Error("Email and OTP are required");
    }

    const otpRecord = await sql`
      SELECT * FROM otp_verification 
      WHERE email = ${email} 
      AND otp = ${otp} 
      AND expires_at > NOW()
    `;

    if (otpRecord.length === 0) {
      res.status(400);
      throw new Error("Invalid or expired OTP");
    }

    // Update verified status instead of deleting
    await sql`
      UPDATE otp_verification 
      SET verified = true 
      WHERE email = ${email}
    `;

    // Cleanup expired OTP records
    await sql`
      DELETE FROM otp_verification 
      WHERE expires_at < NOW()
    `;

    res.status(200).json({ message: "OTP verified successfully" });
  }
);

const registerUser = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { username, email, password } = req.body;

    if (!username || !password || !email) {
      res.status(400);
      throw new Error("Please enter all fields");
    }

    // Check if email was verified
     const verifiedEmail = await sql`
      SELECT * FROM otp_verification 
      WHERE email = ${email} 
      AND verified = true
    `;

    if (verifiedEmail.length === 0) {
      res.status(400);
      throw new Error("Email not verified");
    }

    

    // Check if user already exists
    const existingUser =
      await sql`select * from users where username = ${username}`;
    if (existingUser.length > 0) {
      res.status(409);
      throw new Error("User already exists");
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = await sql`
        INSERT INTO users (username, email, password_hash) 
        VALUES (${username}, ${email}, ${hashedPassword})
        RETURNING id, username, email
      `;

    // Delete the OTP record after successful registration
    await sql`DELETE FROM otp_verification WHERE email = ${email}`;

    // Generate JWT tokens
    const { accessToken, refreshToken } = generateTokens(newUser[0].id);

    // Store refresh token in database
    await sql`
      INSERT INTO refresh_tokens (user_id, token, expires_at)
      VALUES (${newUser[0].id}, ${refreshToken}, NOW() + INTERVAL '7 days')
    `;

    // Set refresh token in HTTP-only cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      message: "User registered successfully",
      ...newUser[0],
      token: accessToken,
    });
    return;
  }
);

const loginUser = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    console.log(req.body);

    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400);
      throw new Error("Please enter all fields");
    }

    // Fetch user from the database
    const users = await sql`select * from users where email = ${email}`;

    if (users.length === 0) {
      res.status(401);
      throw new Error("Invalid credentials");
    }

    const user = users[0];

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      res.status(401);
      throw new Error("Invalid credentials");
    }
    // Generate JWT tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token in database
    await sql`
      INSERT INTO refresh_tokens (user_id, token, expires_at)
      VALUES (${user.id}, ${refreshToken}, NOW() + INTERVAL '7 days')
    `;

    // Set refresh token in HTTP-only cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({ ...user, token: accessToken });
    return;
  }
);

const refreshAccessToken = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      res.status(401);
      throw new Error("Refresh token not found");
    }

    // Verify token exists in database and hasn't expired
    const tokenRecord = await sql`
      SELECT user_id FROM refresh_tokens
      WHERE token = ${refreshToken}
      AND expires_at > NOW()
    `;

    if (tokenRecord.length === 0) {
      res.status(401);
      throw new Error("Invalid refresh token");
    }

    try {
      // Verify the refresh token
      const decoded = verifyRefreshToken(refreshToken);

      // Generate new access token
      const accessToken = jwt.sign(
        { userId: decoded.userId },
        process.env.JWT_ACCESS_SECRET as string,
        { expiresIn: "15m" }
      );

      res.json({ accessToken });
    } catch (error) {
      res.status(403);
      throw new Error("Invalid refresh token");
    }
  }
);

const logoutUser = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      // Remove refresh token from database
      await sql`
        DELETE FROM refresh_tokens 
        WHERE token = ${refreshToken}
      `;
    }

    // Clear the refresh token cookie
    res.cookie("refreshToken", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      expires: new Date(0), // This will immediately expire the cookie
    });

    res.status(200).json({ message: "Logged out successfully" });
  }
);

const forgotPassword = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;
    if (!email) {
      res.status(400);
      throw new Error("Email is required");
    }

    // Check if user exists
    const user = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (user.length === 0) {
      res.status(404);
      throw new Error("User not found");
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Store reset token in database with 15-minute expiration
    await sql`
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (${user[0].id}, ${hashedToken}, NOW() + INTERVAL '15 minutes')
      ON CONFLICT (user_id) 
      DO UPDATE SET token = ${hashedToken}, expires_at = NOW() + INTERVAL '15 minutes'
    `;

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Send email using Resend
    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: "Password Reset Request",
      html: `
        <p>You requested a password reset.</p>
        <p>Click this link to reset your password: <a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link will expire in 15 minutes.</p>
      `,
    });

    res.status(200).json({ message: "Password reset link sent to email" });
  }
);

const resetPassword = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400);
      throw new Error("Please provide all required fields");
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find valid reset token
    const resetToken = await sql`
      SELECT user_id FROM password_reset_tokens 
      WHERE token = ${hashedToken} 
      AND expires_at > NOW()
    `;

    if (resetToken.length === 0) {
      res.status(400);
      throw new Error("Invalid or expired reset token");
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update user's password
    await sql`
      UPDATE users 
      SET password_hash = ${hashedPassword} 
      WHERE id = ${resetToken[0].user_id}
    `;

    // Delete the used reset token
    await sql`
      DELETE FROM password_reset_tokens 
      WHERE token = ${hashedToken}
    `;

    res.status(200).json({ message: "Password reset successful" });
  }
);

export {
  registerUser,
  loginUser,
  sendOTPEmail,
  verifyOTP,
  refreshAccessToken,
  logoutUser,
  forgotPassword,
  resetPassword,
};
