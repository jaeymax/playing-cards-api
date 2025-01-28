import { Request, Response } from "express";


const getFriends = async(req:Request, res:Response)=>{

    res.json({message:"get Friends controller"});
}

const addFriend = async(req:Request, res:Response) =>{
    res.json({message:"add Friend controller"});
}

export {getFriends, addFriend};