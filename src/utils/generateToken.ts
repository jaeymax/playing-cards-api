import jwt from 'jsonwebtoken'

const generateToken = (id:string) =>{
    return jwt.sign({userId:id}, process.env.SECRET as string, {expiresIn:"30d"});
}