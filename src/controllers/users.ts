import { Request, Response } from "express";

const getUserProfile = async(req:Request, res:Response)=>{
    res.status(200).json({message:"get user profile controller"});
}

const updateUserProfile = async(req:Request, res:Response)=>{
    res.status(200).json({message:"update user profile controller"});
}

export {getUserProfile, updateUserProfile};