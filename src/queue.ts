import {Queue, Worker, Job} from 'bullmq';

const connection = {
  host: 'localhost',
  port: 6379,
};

export const forfeitQueue = new Queue('forfeitQueue', { connection });

async function startTurn(gameCode: string, timeoutMs:number){
    console.log(`Starting turn for game ${gameCode} with timeout ${timeoutMs}ms`);
    // Add a job that will fire after the timeout
    await forfeitQueue.add('forfeitJob', { matchId: gameCode, playerId: 'player1' }, { delay: timeoutMs, jobId: gameCode });
}


async function processForfeitJob(job: Job) {
  const { matchId, playerId } = job.data;
  console.log(`Processing forfeit for match ${matchId} by player ${playerId}`);
  // Add your forfeit logic here
}

async function onPlayerMove(gameCode: string) {
    // Remove the existing forfeit job if it exists
    const job = await forfeitQueue.getJob(gameCode);
    if (job) {
        await job.remove();
        console.log(`Removed forfeit job for game ${gameCode}`);
    }
    // Start a new turn with a fresh timeout
    await startTurn(gameCode, 30000); // e.g., 30 seconds timeout
}

// Worker to process forfeit jobs
const forfeitWorker = new Worker('forfeitQueue', async (job: Job) => {
  await processForfeitJob(job);
}, { connection });