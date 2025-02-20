import { Request, Response } from "express";
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import asyncHandler = require('express-async-handler');

const users:any[] = []

const registerUser = async(req: Request, res:Response) =>{
     
    //res.json({"message":"Register User controller"});
    console.log(req.body);
    
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
    
      // Check if user already exists
      const existingUser = users.find((u) => u.username === username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already taken"});
      }
    
      // Hash the password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
    

      // Create new user
      const newUser = { id: users.length + 1, username, password: hashedPassword };
      users.push(newUser);
    
      // Generate JWT token
      const token = jwt.sign({ id: newUser.id, username: newUser.username }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
    
      res.status(201).json({ message: "User registered successfully", token });
}


const loginUser = async(req: Request, res: Response)=>{
    
    //res.json({"message":"Login User controller"});
    console.log(users);
    const {username, password} = req.body;
    
    // Find user in databse
    const user = users.find((user)=> user.username === username);
    if(!user)return res.status(401).json({message:"Invalid credentials"});
    
    //Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if(!isMatch)return res.status(401).json({message:"Invalid credentials"});
    
    //Create JWT token
    const token = jwt.sign({id:user._id}, process.env.JWT_SECRET as string, {expiresIn: "1h"});   
    res.json({token});
}

export {registerUser, loginUser}