"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleLogin = exports.googleSignup = exports.upgradeGuest = exports.createGuest = exports.resetPassword = exports.forgotPassword = exports.logoutUser = exports.refreshAccessToken = exports.verifyOTP = exports.sendOTPEmail = exports.loginUser = exports.registerUser = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const asyncHandler = require("express-async-handler");
const generateToken_1 = require("../utils/generateToken");
const db_1 = __importDefault(require("../config/db"));
const resend_1 = require("resend");
const crypto_1 = __importDefault(require("crypto"));
const google_auth_library_1 = require("google-auth-library");
const __1 = require("..");
// Email configuration
const resend = new resend_1.Resend(process.env.RESEND_API_KEY);
const client = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};
const sendOTPEmail = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = req.body;
    if (!email) {
        res.status(400);
        throw new Error("Email is required");
    }
    // Check if email already exists
    const existingUser = yield (0, db_1.default) `select * from users where email = ${email}`;
    if (existingUser.length > 0) {
        res.status(409);
        throw new Error("Email already registered");
    }
    const otp = generateOTP();
    // Store OTP in database with expiration (15 minutes)
    yield (0, db_1.default) `
      INSERT INTO otp_verification (email, otp, expires_at)
      VALUES (${email}, ${otp}, NOW() + INTERVAL '15 minutes')
      ON CONFLICT (email) 
      DO UPDATE SET otp = ${otp}, expires_at = NOW() + INTERVAL '15 minutes'
    `;
    // Send email using Resend
    yield resend.emails.send({
        from: "SparPlay <noreply@sparplay.com>",
        to: email,
        subject: "Your SparPlay OTP Code",
        html: `  <div style="font-family: Arial, sans-serif; background-color: #f7f7f7; padding: 0px 0;">
    <div style="max-width: 480px; margin: auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      <div style="background-color: #5c2ed1; color: #ffffff; padding: 16px 24px; font-size: 20px; font-weight: bold;">
        SparPlay
      </div>
      <div style="padding: 32px 24px; color: #333333;">
        <h2 style="margin-top: 0; font-weight: 600; font-size: 22px;">Your One-Time Password (OTP)</h2>
        <p style="font-size: 15px; color: #555555;">
          Use the code below to complete your registration on <strong>SparPlay</strong>. 
          This code is valid for <strong>15 minutes</strong>.
        </p>
        <div style="background-color: #f4f4f4; border: 1px solid #ddd; padding: 16px; text-align: center; border-radius: 6px; margin: 24px 0;">
          <span style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #5c2ed1;">
            ${otp}
          </span>
        </div>
        <p style="font-size: 14px; color: #777;">
          Didn’t request this code? You can safely ignore this message.
        </p>
      </div>
      <div style="background-color: #fafafa; padding: 16px; text-align: center; font-size: 12px; color: #888;">
        © ${new Date().getFullYear()} SparPlay. All rights reserved.
      </div>
    </div>
  </div>`,
    });
    res.status(200).json({ message: "OTP sent successfully" });
}));
exports.sendOTPEmail = sendOTPEmail;
const verifyOTP = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, otp } = req.body;
    if (!email || !otp) {
        res.status(400);
        throw new Error("Email and OTP are required");
    }
    const otpRecord = yield (0, db_1.default) `
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
    yield (0, db_1.default) `
      UPDATE otp_verification 
      SET verified = true 
      WHERE email = ${email}
    `;
    // Cleanup expired OTP records
    yield (0, db_1.default) `
      DELETE FROM otp_verification 
      WHERE expires_at < NOW()
    `;
    res.status(200).json({ message: "OTP verified successfully" });
}));
exports.verifyOTP = verifyOTP;
const registerUser = asyncHandler((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { username, email, password } = req.body;
    if (!username || !password || !email) {
        res.status(400);
        throw new Error("Please enter all fields");
    }
    // Check if email was verified
    const verifiedEmail = yield (0, db_1.default) `
      SELECT * FROM otp_verification 
      WHERE email = ${email} 
      AND verified = true
    `;
    if (verifiedEmail.length === 0) {
        res.status(400);
        throw new Error("Email not verified");
    }
    // Check if user already exists
    const existingUser = yield (0, db_1.default) `select * from users where username = ${username}`;
    if (existingUser.length > 0) {
        res.status(409);
        throw new Error("User already exists");
    }
    // Hash the password
    const salt = yield bcryptjs_1.default.genSalt(10);
    const hashedPassword = yield bcryptjs_1.default.hash(password, salt);
    // Create new user
    const newUser = yield (0, db_1.default) `
        INSERT INTO users (username, email, password_hash) 
        VALUES (${username}, ${email}, ${hashedPassword})
        RETURNING id, username, email
      `;
    // Delete the OTP record after successful registration
    yield (0, db_1.default) `DELETE FROM otp_verification WHERE email = ${email}`;
    // Generate JWT tokens
    const { accessToken, refreshToken } = (0, generateToken_1.generateTokens)(newUser[0].id);
    // Store refresh token in database
    yield (0, db_1.default) `
      INSERT INTO refresh_tokens (user_id, token, expires_at)
      VALUES (${newUser[0].id}, ${refreshToken}, NOW() + INTERVAL '7 days')
    `;
    __1.mixpanel.track("User Registered", {
        distinct_id: newUser[0].id,
        username: newUser[0].username,
        email: newUser[0].email,
    });
    // Set refresh token in HTTP-only cookie
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    yield resend.emails.send({
        from: "SparPlay <noreply@sparplay.com>",
        to: email,
        subject: "Welcome to SparPlay",
        html: `
      <div style="font-family: Arial, sans-serif; background-color: #f7f7f7; padding: 0px 0;">
        <div style="max-width: 520px; margin: auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="background-color: #5c2ed1; color: #ffffff; padding: 18px 24px; font-size: 20px; font-weight: bold;">
            SparPlay
          </div>
          
          <!-- Body -->
          <div style="padding: 32px 24px; color: #333333;">
            <h2 style="margin-top: 0; font-weight: 600; font-size: 22px;">Welcome to SparPlay!</h2>
            <p style="font-size: 15px; color: #555;">
              Hi ${username},<br><br>
              We're thrilled to have you join the <strong>SparPlay</strong> community — the home of the ultimate online Spar card game.
            </p>
            <p style="font-size: 15px; color: #555;">
              You can now play against friends, challenge other players worldwide, and climb the leaderboard to become a Spar legend!
            </p>
    
            <!-- CTA Button -->
            <div style="text-align: center; margin: 28px 0;">
              <a href="https://www.sparplay.com" 
                 style="background-color: #5c2ed1; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">
                 Play Now
              </a>
            </div>
    
            <p style="font-size: 14px; color: #777;">
              If you didn’t create a SparPlay account, you can safely ignore this message.
            </p>
          </div>
    
          <!-- Footer -->
          <div style="background-color: #fafafa; padding: 16px; text-align: center; font-size: 12px; color: #888;">
            © ${new Date().getFullYear()} SparPlay. All rights reserved.
          </div>
        </div>
      </div>
      `
    });
    console.log("Welcome email sent to:", email);
    res.status(201).json(Object.assign(Object.assign({ message: "User registered successfully" }, newUser[0]), { token: accessToken }));
    return;
}));
exports.registerUser = registerUser;
const loginUser = asyncHandler((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(req.body);
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400);
        throw new Error("Please enter all fields");
    }
    // Fetch user from the database
    const users = yield (0, db_1.default) `select * from users where email = ${email}`;
    if (users.length === 0) {
        res.status(401);
        throw new Error("Invalid credentials");
    }
    const user = users[0];
    // Compare hashed password
    const isMatch = yield bcryptjs_1.default.compare(password, user.password_hash);
    if (!isMatch) {
        res.status(401);
        throw new Error("Invalid credentials");
    }
    // Generate JWT tokens
    const { accessToken, refreshToken } = (0, generateToken_1.generateTokens)(user.id);
    // Store refresh token in database
    yield (0, db_1.default) `
      INSERT INTO refresh_tokens (user_id, token, expires_at)
      VALUES (${user.id}, ${refreshToken}, NOW() + INTERVAL '7 days')
    `;
    __1.mixpanel.track("User Logged In", {
        distinct_id: user.id,
        username: user.username,
        email: user.email,
    });
    // Set refresh token in HTTP-only cookie
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    res.json(Object.assign(Object.assign({}, user), { token: accessToken }));
    return;
}));
exports.loginUser = loginUser;
const refreshAccessToken = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
        res.status(401);
        throw new Error("Refresh token not found");
    }
    // Verify token exists in database and hasn't expired
    const tokenRecord = yield (0, db_1.default) `
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
        const decoded = (0, generateToken_1.verifyRefreshToken)(refreshToken);
        // Generate new access token
        const accessToken = jsonwebtoken_1.default.sign({ userId: decoded.userId }, process.env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
        res.json({ accessToken });
    }
    catch (error) {
        res.status(403);
        throw new Error("Invalid refresh token");
    }
}));
exports.refreshAccessToken = refreshAccessToken;
const logoutUser = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
        // Remove refresh token from database
        yield (0, db_1.default) `
        DELETE FROM refresh_tokens 
        WHERE token = ${refreshToken}
      `;
    }
    __1.mixpanel.track("User Logged Out", {
        distinct_id: (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId,
    });
    // Clear the refresh token cookie
    res.cookie("refreshToken", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        expires: new Date(0), // This will immediately expire the cookie
    });
    res.status(200).json({ message: "Logged out successfully" });
}));
exports.logoutUser = logoutUser;
const forgotPassword = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = req.body;
    if (!email) {
        res.status(400);
        throw new Error("Email is required");
    }
    // Check if user exists
    const user = yield (0, db_1.default) `SELECT * FROM users WHERE email = ${email}`;
    if (user.length === 0) {
        res.status(404);
        throw new Error("This email address is not registered. Please use a different email.");
    }
    // Generate reset token
    const resetToken = crypto_1.default.randomBytes(32).toString("hex");
    const hashedToken = crypto_1.default
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");
    // Store reset token in database with 15-minute expiration
    yield (0, db_1.default) `
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (${user[0].id}, ${hashedToken}, NOW() + INTERVAL '15 minutes')
      ON CONFLICT (user_id) 
      DO UPDATE SET token = ${hashedToken}, expires_at = NOW() + INTERVAL '15 minutes'
    `;
    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    console.log(resetUrl);
    // Send email using Resend
    yield resend.emails.send({
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
}));
exports.forgotPassword = forgotPassword;
const resetPassword = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { token, password } = req.body;
    if (!token || !password) {
        res.status(400);
        throw new Error("Please provide all required fields");
    }
    const hashedToken = crypto_1.default.createHash("sha256").update(token).digest("hex");
    // Find valid reset token
    const resetToken = yield (0, db_1.default) `
      SELECT user_id FROM password_reset_tokens 
      WHERE token = ${hashedToken} 
      AND expires_at > NOW()
    `;
    if (resetToken.length === 0) {
        res.status(400);
        throw new Error("Invalid or expired reset token");
    }
    // Hash the new password
    const salt = yield bcryptjs_1.default.genSalt(10);
    const hashedPassword = yield bcryptjs_1.default.hash(password, salt);
    // Update user's password
    yield (0, db_1.default) `
      UPDATE users 
      SET password_hash = ${hashedPassword} 
      WHERE id = ${resetToken[0].user_id}
    `;
    // Delete the used reset token
    yield (0, db_1.default) `
      DELETE FROM password_reset_tokens 
      WHERE token = ${hashedToken}
    `;
    res.status(200).json({ message: "Password reset successful" });
}));
exports.resetPassword = resetPassword;
const createGuest = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const guestUsername = `Guest${randomNum}`;
        const guestEmail = `guest_${Date.now()}_${randomNum}@example.com`;
        const password = Math.random().toString(36).slice(-12);
        const passwordHash = yield bcryptjs_1.default.hash(password, 10);
        const user = yield (0, db_1.default) `
      INSERT INTO users (username, email, password_hash, is_guest, created_at)
      VALUES (${guestUsername}, ${guestEmail}, ${passwordHash}, true, NOW())
      RETURNING id, username, image_url, rating, games_played, games_won, is_guest
    `;
        const { accessToken, refreshToken } = (0, generateToken_1.generateTokens)(user[0].id);
        // Store refresh token
        yield (0, db_1.default) `
      INSERT INTO refresh_tokens (user_id, token, expires_at)
      VALUES (${user[0].id}, ${refreshToken}, NOW() + INTERVAL '7 days')
    `;
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        res.json({
            token: accessToken,
            user: user[0],
        });
    }
    catch (error) {
        console.error(error);
        res.status(500);
        throw new Error("Could not create guest");
    }
}));
exports.createGuest = createGuest;
const upgradeGuest = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const id = req.user.userId; // guest user's id
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        res.status(400);
        throw new Error("Username, email and password required");
    }
    try {
        // Check for existing username/email
        const conflict = yield (0, db_1.default) `
      SELECT id FROM users 
      WHERE (username = ${username} OR email = ${email}) 
      AND id != ${id}
    `;
        if (conflict.length > 0) {
            res.status(400);
            throw new Error("Username or email already in use");
        }
        const passwordHash = yield bcryptjs_1.default.hash(password, 10);
        // Update user
        const updatedUser = yield (0, db_1.default) `
      UPDATE users
      SET 
        username = ${username}, 
        email = ${email}, 
        password_hash = ${passwordHash}, 
        is_guest = false, 
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, username, email, image_url, rating, games_played, games_won, is_guest
    `;
        // Generate new tokens
        const { accessToken, refreshToken } = (0, generateToken_1.generateTokens)(updatedUser[0].id);
        // Store refresh token
        yield (0, db_1.default) `
      INSERT INTO refresh_tokens (user_id, token, expires_at)
      VALUES (${updatedUser[0].id}, ${refreshToken}, NOW() + INTERVAL '30 days')
    `;
        // Set refresh token cookie
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });
        res.json({
            token: accessToken,
            user: updatedUser[0],
        });
    }
    catch (error) {
        console.error(error);
        res.status(500);
        throw new Error("Upgrade failed");
    }
}));
exports.upgradeGuest = upgradeGuest;
const googleSignup = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { code } = req.body;
    if (!code) {
        res.status(400);
        throw new Error("No code token provided");
    }
    const { tokens } = yield client.getToken({ code, redirect_uri: "postmessage" });
    if (!tokens.id_token) {
        throw new Error('No ID token received from Google');
    }
    const ticket = yield client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { name, email, picture } = payload;
    // Check if already exists
    const existingUser = yield (0, db_1.default) `SELECT id FROM users WHERE email = ${email}`;
    if (existingUser.length > 0) {
        res.status(409);
        throw new Error("Email already registered");
    }
    // Create unique username
    let baseUsername = name === null || name === void 0 ? void 0 : name.replace(/\s+/g, "").toLowerCase();
    let username = baseUsername;
    let counter = 1;
    while (true) {
        const exists = yield (0, db_1.default) `SELECT 1 FROM users WHERE username = ${username}`;
        if (exists.length === 0)
            break;
        username = `${baseUsername}${counter}`;
        counter++;
    }
    // Insert user
    const user = yield (0, db_1.default) `
    INSERT INTO users (username, email, password_hash, image_url, is_guest)
    VALUES (${username}, ${email}, NULL, ${picture || "https://github.com/shadcn.png"}, false)
    RETURNING *
  `;
    const { accessToken, refreshToken } = (0, generateToken_1.generateTokens)(user[0].id);
    // Store refresh token
    yield (0, db_1.default) `
    INSERT INTO refresh_tokens (user_id, token, expires_at)
    VALUES (${user[0].id}, ${refreshToken}, NOW() + INTERVAL '7 days')
  `;
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ token: accessToken, user: user[0] });
}));
exports.googleSignup = googleSignup;
const googleLogin = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { code } = req.body;
    if (!code) {
        res.status(400);
        throw new Error("No code token provided");
    }
    const { tokens } = yield client.getToken({ code, redirect_uri: "postmessage" });
    if (!tokens.id_token) {
        throw new Error('No ID token received from Google');
    }
    const ticket = yield client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const email = payload.email;
    const users = yield (0, db_1.default) `SELECT * FROM users WHERE email = ${email}`;
    if (users.length === 0) {
        res.status(404);
        throw new Error("No account found. Please sign up.");
    }
    const { accessToken, refreshToken } = (0, generateToken_1.generateTokens)(users[0].id);
    // Store refresh token
    yield (0, db_1.default) `
    INSERT INTO refresh_tokens (user_id, token, expires_at)
    VALUES (${users[0].id}, ${refreshToken}, NOW() + INTERVAL '7 days')
  `;
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ token: accessToken, user: users[0] });
}));
exports.googleLogin = googleLogin;
