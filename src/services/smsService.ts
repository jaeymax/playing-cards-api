import sql from "../config/db";

const url = 'https://sms.arkesel.com/api/v2/sms/send';


export async function sendSMS(to:string, message:string){
    try{
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json', 
                'api-key': `${process.env.ARKESEL_API_KEY}`
            },
            body: JSON.stringify({
               'sender':"SPARPLAY",
               'message': message,
               'recipients': [to]
            })
        });
        const data = await response.json();
        if(!response.ok){
            throw new Error(data.error || 'Failed to send SMS');
        }

        response;
        console.log('sms response data', data);
    }catch(error){
       console.error('SMS error:', error);
    }
}

export async function sendTournamentNotification(tournamentName:string){
    // select all users with phone numbers and send them a notification about the tournament
    try{
        const users = await sql`
            SELECT username, phone FROM users WHERE phone IS NOT NULL
        `;

        
        for(const user of users){
            const messageTemplate = `Hi ${user.username}, New tournament "${tournamentName}" is now open for registration! Join now and compete for glory!`;
            await sendSMS(user.phone, messageTemplate);
        }

    }
    catch(error){
        console.error('Error sending tournament notifications:', error);
    }
}