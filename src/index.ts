import express, {Express, Request, Response} from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import {Server} from 'socket.io';
import http from 'http';
import authRoutes from './routes/auth'
import gameRoutes from './routes/game'
import friendsRoutes from './routes/friends'
import errorHandler from './middlewares/errorHandler';
import notFoundMiddleware from './middlewares/notFoundMiddleware';
import userRoutes from './routes/users';

dotenv.config();

const app:Express = express();
const server = http.createServer(app);

interface Player{
    id:string,
    name:string,
    hand:Card[],
    played_cards:Card[],
    score:number,
    status:string,
}

interface Card{

}

interface Game{
     playerTurn:string,
     winner:string,
     gameStatus:string,
     leadingSuit:string,
     players:Player[],
     drawPile:Card[],
     roundNumber:number,
     currentRoundNumber:number,
}

let games = new Map<string, Game>();

const playCard = (playerId:any, card:any) =>{
    
}

//Middlewares

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended:false}));
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/users', userRoutes);
app.use(notFoundMiddleware);
app.use(errorHandler);


// Websocket's connection to the server to allow bidirectional communication
const serverSocket = new Server(server, {
    cors:{
        origin:"http://localhost:5173",
        methods:["GET", "POST"]
    }
});

const port = process.env.PORT || 5000;

app.get('/', (req:Request, res:Response)=>{
    res.send("Express + Typescript Server");
})


server.listen(port, ()=>{
    console.log(`[server]: Server is running at http://localhost:${port}`);
})



// Websockets connection and all websockets event related logic
serverSocket.on('connection', (socket)=>{
   
    console.log(`Connection established with ${socket.id}`);
    socket.emit('message', 'Hello there welcome')

    socket.on('create_game', ()=>{

    })

    socket.on('play_card', ()=>{
        
    })

    socket.on('get_game_state', ()=>{

    })

    socket.on('disconnect', ()=>{

    })

});


