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
exports.loginUser = exports.registerUser = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const users = [];
const registerUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    //res.json({"message":"Register User controller"});
    console.log(req.body);
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }
    // Check if user already exists
    const existingUser = users.find((u) => u.username === username);
    if (existingUser) {
        return res.status(400).json({ error: "Username already taken" });
    }
    // Hash the password
    const salt = yield bcryptjs_1.default.genSalt(10);
    const hashedPassword = yield bcryptjs_1.default.hash(password, salt);
    // Create new user
    const newUser = { id: users.length + 1, username, password: hashedPassword };
    users.push(newUser);
    // Generate JWT token
    const token = jsonwebtoken_1.default.sign({ id: newUser.id, username: newUser.username }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.status(201).json({ message: "User registered successfully", token });
});
exports.registerUser = registerUser;
const loginUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    //res.json({"message":"Login User controller"});
    console.log(users);
    const { username, password } = req.body;
    // Find user in databse
    const user = users.find((user) => user.username === username);
    if (!user)
        return res.status(401).json({ message: "Invalid credentials" });
    //Check password
    const isMatch = yield bcryptjs_1.default.compare(password, user.password);
    if (!isMatch)
        return res.status(401).json({ message: "Invalid credentials" });
    //Create JWT token
    const token = jsonwebtoken_1.default.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ token });
});
exports.loginUser = loginUser;
