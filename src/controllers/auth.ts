import { Request, Response } from "express";
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import asyncHandler = require('express-async-handler');


const registerUser = async( req: Request, res:Response) =>{
     
    res.json({"message":"Register User controller"});
}


const loginUser = async(req: Request, res: Response)=>{

    res.json({"message":"Login User controller"});
}

export {registerUser, loginUser}