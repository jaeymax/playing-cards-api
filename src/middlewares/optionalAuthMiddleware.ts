import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';


const optionalAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
    //console.log('here');
    //console.log(req.header('Authorization'));

    if(!req.header('Authorization')) {
        req.user = null;
        return next();
    }
    
    const token = req.header('Authorization')?.replace('Bearer ', '') as string;


    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string);
        req.user = decoded;
      //  console.log(req.user);
        
        next();
    } catch (err) {
        req.user = null;
        next();
    }
};

export default optionalAuthMiddleware;