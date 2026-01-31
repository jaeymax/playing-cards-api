import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare module 'express-serve-static-core' {
    interface Request {
        user?: any;
    }
}

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    //console.log('here');
    //console.log(req.header('Authorization'));
    
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).send({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string);
        req.user = decoded;
      //  console.log(req.user);
        
        next();
    } catch (err) {
        res.status(403).send({ error: 'Invalid token.' });
    }
};

export default authMiddleware;