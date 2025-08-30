#!/usr/bin/env python3
"""
NAV Checker Configuration
Independent configuration management for NAV Checker project
"""
import os
from pathlib import Path

# Load .env file if exists
def load_env():
    env_path = Path(__file__).parent / '.env'
    if env_path.exists():
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip()

# Load environment variables
load_env()

# Database Configuration (completely separate from Codal)
DB_CONFIG = {
    'url': os.getenv('NAV_DB_URL', 'postgresql://postgres:eOx5S0h4RFqejEGl@services.irn13.chabokan.net:50895/micheal'),
    'pool_size': int(os.getenv('DB_POOL_SIZE', '5')),
    'max_overflow': int(os.getenv('DB_MAX_OVERFLOW', '10'))
}

# Telegram Configuration
TELEGRAM_CONFIG = {
    'bot_token': os.getenv('NAV_BOT_TOKEN', ''),
    'admin_chat_id': os.getenv('NAV_ADMIN_CHAT_ID', ''),
    'enabled': bool(os.getenv('TELEGRAM_ENABLED', 'false').lower() in ['true', '1', 'yes'])
}

# API Configuration
API_CONFIG = {
    'host': os.getenv('NAV_API_HOST', '0.0.0.0'),
    'port': int(os.getenv('NAV_API_PORT', '8001')),
    'debug': bool(os.getenv('NAV_DEBUG', 'false').lower() in ['true', '1', 'yes']),
    'reload': bool(os.getenv('NAV_RELOAD', 'false').lower() in ['true', '1', 'yes'])
}

# Security Configuration
SECURITY_CONFIG = {
    'secret_key': os.getenv('NAV_SECRET_KEY', 'nav_checker_secret_key_change_in_production'),
    'token_expire_hours': int(os.getenv('TOKEN_EXPIRE_HOURS', '24'))
}

# Scraping Configuration
SCRAPING_CONFIG = {
    'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'timeout': int(os.getenv('SCRAPING_TIMEOUT', '30')),
    'retry_count': int(os.getenv('SCRAPING_RETRY_COUNT', '3')),
    'delay_between_requests': float(os.getenv('SCRAPING_DELAY', '1.0'))
}

# Logging Configuration
LOGGING_CONFIG = {
    'level': os.getenv('LOG_LEVEL', 'INFO'),
    'format': os.getenv('LOG_FORMAT', '%(asctime)s - %(name)s - %(levelname)s - %(message)s'),
    'file': os.getenv('LOG_FILE', 'nav_checker.log'),
    'max_size': int(os.getenv('LOG_MAX_SIZE', '10485760')),  # 10MB
    'backup_count': int(os.getenv('LOG_BACKUP_COUNT', '5'))
}

def get_db_url():
    """Get database URL with fallback logic"""
    return DB_CONFIG['url']

def get_telegram_config():
    """Get Telegram configuration"""
    return TELEGRAM_CONFIG

def get_api_config():
    """Get API configuration"""
    return API_CONFIG

def print_config():
    """Print current configuration (without sensitive data)"""
    print("🔧 NAV Checker Configuration:")
    print(f"   Database: {DB_CONFIG['url'].split('@')[-1] if '@' in DB_CONFIG['url'] else 'Local'}")
    print(f"   API: {API_CONFIG['host']}:{API_CONFIG['port']}")
    print(f"   Telegram: {'Enabled' if TELEGRAM_CONFIG['enabled'] else 'Disabled'}")
    print(f"   Debug: {API_CONFIG['debug']}")
    print(f"   Log Level: {LOGGING_CONFIG['level']}")

if __name__ == "__main__":
    print_config()
