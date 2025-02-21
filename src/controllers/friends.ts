import { Request, Response } from "express";


const getFriends = async(req:Request, res:Response)=>{


    const friends = [
        {
            id:1,
            name:"virgil"
        },
        {
            id:2,
            name:"maxwell"
        }
    ]
    res.json({message:"get Friends controller"});
    //const friends = 'select ( frp m'

    console.log(friends);
    

}

const addFriend = async(req:Request, res:Response) =>{
    res.json({message:"add Friend controller"});
}

export {getFriends, addFriend};