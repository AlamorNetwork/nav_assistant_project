// Test API connection for NAV Checker
// Run this in Chrome DevTools console

(function() {
console.log('🔍 تست اتصال به API...');

const API_BASE_URL = 'https://chabokan.irplatforme.ir';
const FALLBACK_URL = 'http://localhost:8001';

async function testApiConnection() {
    console.log(`Testing connection to: ${API_BASE_URL}`);
    
    // Test 1: Basic health check
    try {
        console.log('🧪 Test 1: Health check...');
        const response = await fetch(`${API_BASE_URL}/health`);
        console.log(`✅ Health check: ${response.status} ${response.statusText}`);
        const data = await response.json();
        console.log('Response:', data);
    } catch (error) {
        console.log(`❌ Health check failed: ${error.message}`);
    }
    
    // Test 2: Get auth token
    let authToken = '';
    try {
        const stored = await chrome.storage.sync.get('authToken');
        authToken = stored.authToken || '';
        console.log(`🔑 Auth token found: ${authToken ? 'Yes' : 'No'}`);
    } catch (error) {
        console.log(`❌ Cannot get auth token: ${error.message}`);
    }
    
    // Test 3: Test configurations endpoint
    try {
        console.log('🧪 Test 3: Configurations endpoint...');
        const headers = authToken ? { 'token': authToken } : {};
        const response = await fetch(`${API_BASE_URL}/funds`, {
            headers: headers,
            method: 'GET',
            mode: 'cors'
        });
        console.log(`✅ Funds endpoint: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
            const funds = await response.json();
            console.log('Funds:', funds);
            
            if (funds.length > 0) {
                const fundName = funds[0].name;
                console.log(`🧪 Test 4: Configuration for fund "${fundName}"...`);
                
                const configResponse = await fetch(`${API_BASE_URL}/configurations/${fundName}`, {
                    headers: headers,
                    method: 'GET',
                    mode: 'cors'
                });
                
                console.log(`✅ Config endpoint: ${configResponse.status} ${configResponse.statusText}`);
                
                if (configResponse.ok) {
                    const config = await configResponse.json();
                    console.log('Configuration:', config);
                } else {
                    console.log('❌ Configuration not found');
                }
            }
        }
    } catch (error) {
        console.log(`❌ Configurations test failed: ${error.message}`);
        console.log('Error details:', error);
    }
    
    // Test 4: Try localhost fallback
    try {
        console.log('🧪 Test 5: Localhost fallback...');
        const response = await fetch(`${FALLBACK_URL}/health`);
        console.log(`✅ Localhost health: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
            console.log('💡 Localhost is available as fallback');
        }
    } catch (error) {
        console.log(`❌ Localhost not available: ${error.message}`);
    }
    
    console.log('\n📋 Summary:');
    console.log('- If all tests fail: Server might be down');
    console.log('- If only HTTPS fails: SSL/Certificate issue');
    console.log('- If config fails: Authentication or fund setup issue');
}

// Run the test
testApiConnection();
})();
