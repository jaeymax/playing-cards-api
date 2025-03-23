import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config();
console.log(process.env.DATABASE_URI);

const sql = neon(process.env.DATABASE_URI as string);


export default sql;
