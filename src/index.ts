import express, {Express, Request, Response} from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import {Server} from 'socket.io';
import http from 'http';

dotenv.config();

const app:Express = express();
const server = http.createServer(app);


//Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended:false}));

const serverSocket = new Server(server, {
    cors:{
        origin:""
    }
});

const port = process.env.PORT || 5000;

app.get('/', (req:Request, res:Response)=>{
    res.send("Express + Typescript Server");
})


server.listen(port, ()=>{
    console.log(`[server]: Server is running at http://localhost:${port}`);
})

serverSocket.on('connection', (socket)=>{
   
    console.log(`Connection established with ${socket.id}`);
    
});


