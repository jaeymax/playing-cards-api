import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

export const generateToken = (id: string) => {
  //console.log("SecretKey:", process.env.SECRET);

  return jwt.sign({ userId: id }, process.env.JWT_SECRET as string, {
    expiresIn: "30d",
  });
};
