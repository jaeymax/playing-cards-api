import { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import asyncHandler = require("express-async-handler");
import { generateToken } from "../utils/generateToken";
import sql from "../config/db";

const registerUser = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { username, email, password } = req.body;

    if (!username || !password || !email) {
      res.status(400);
      throw new Error("Please enter all fields");
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

    // Generate JWT token
    const token = generateToken(newUser[0].id);

    res
      .status(201)
      .json({ message: "User registered successfully", ...newUser[0], token });
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
    // Generate JWT token
    const token = generateToken(user.id);

    res.json({ ...user, token });
    return;
  }
);

export { registerUser, loginUser };
