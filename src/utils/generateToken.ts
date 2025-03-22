import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

interface TokenPayload{
  userId:string;
}

export const generateTokens = (id: string) => {
  //console.log("SecretKey:", process.env.SECRET);

  const accessToken = jwt.sign({ userId: id }, process.env.JWT_ACCESS_SECRET as string, {
    expiresIn: "15m",
  });

  const refreshToken = jwt.sign({ userId: id }, process.env.JWT_REFRESH_SECRET as string, {
    expiresIn: "7d",
  });
  
  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET as string) as TokenPayload;
};