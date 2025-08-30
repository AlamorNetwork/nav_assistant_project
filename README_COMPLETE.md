# NAV Assistant - Automated NAV Monitoring Bot

## 📋 Project Overview

NAV Assistant is a comprehensive automated monitoring system for investment fund NAV (Net Asset Value) management. It's designed to continuously monitor fund NAV values, compare them with live market data, calculate necessary adjustments, and provide real-time alerts through multiple channels.

## 🏗️ System Architecture

### Frontend (Chrome Extension)
- **Manifest Version**: 3
- **Core Components**:
  - `popup.html/js`: Main user interface for fund management
  - `content.js`: Web scraping and data extraction logic
  - `background.js`: Tab management and message handling
  - `options.html/js`: Configuration management interface
  - `style.css`: UI styling and responsive design

### Backend (Python FastAPI Server)
- **Framework**: FastAPI with PostgreSQL database
- **Core Components**:
  - `main.py`: Main API server with NAV calculation logic
  - `admin_panel.py`: Web-based administration interface
  - `database_setup.py`: Database initialization and schema
  - `requirements.txt`: Python dependencies

## 🎯 Key Features

### Real-Time Monitoring
- **Continuous NAV Tracking**: Monitors fund NAV values every 2 minutes during market hours
- **Market Data Integration**: Fetches live prices from TSETMC (Tehran Stock Exchange)
- **Discrepancy Detection**: Identifies differences between software NAV and market prices
- **Automatic Calculations**: Applies custom formulas to suggest adjusted NAV values

### Multi-Fund Management
- **Centralized Configuration**: Manage multiple funds through a single interface
- **Individual Settings**: Each fund has its own URL configurations and selectors
- **Independent Monitoring**: Each fund operates independently with separate alerts
- **Scalable Architecture**: Supports unlimited number of funds

### Smart Data Extraction
- **Fixed Column Strategy**: Uses column indices (1, 3, 12) for reliable data extraction
- **Row Selection Logic**: Advanced algorithms for accurate security selection
- **Error Handling**: Robust error handling with fallback mechanisms
- **Debug Tools**: Comprehensive logging and debugging capabilities

### Alert System
- **Telegram Integration**: Real-time alerts via Telegram bot
- **In-Browser Notifications**: Persistent notifications within the extension
- **Multiple Alert Types**: NAV adjustments, stale data, connection issues
- **Customizable Thresholds**: Configurable tolerance levels for each fund

## 🔧 Technical Specifications

### Chrome Extension
```json
{
  "manifest_version": 3,
  "name": "🐍 سبدگردان کاریزما - دستیار NAV",
  "version": "1.0.0",
  "permissions": ["storage", "tabs", "scripting"],
  "host_permissions": ["https://*.irplatforme.ir/*"]
}
```

### Backend API Endpoints
- `POST /check-nav`: Main NAV comparison and calculation endpoint
- `GET /funds`: Retrieve user's fund list
- `GET /configurations/{fund_name}`: Get fund-specific configurations
- `POST /alerts/stale`: Handle stale data alerts
- `POST /admin/*`: Administrative functions

### Database Schema
- **Users Table**: User authentication and management
- **Funds Table**: Fund definitions and basic information
- **Configurations Table**: Fund-specific settings and selectors
- **Logs Table**: System activity and error logging

## 🚀 Installation & Setup

### Prerequisites
- Ubuntu 20.04/22.04 LTS server
- Domain name pointing to server IP
- PostgreSQL database
- Python 3.8+

### One-Line Installation
```bash
bash <(curl -Ls https://raw.githubusercontent.com/AlamorNetwork/nav_assistant_project/main/install.sh) install
```

### Manual Setup
1. **Clone Repository**
2. **Install Dependencies**: `pip install -r requirements.txt`
3. **Configure Database**: Run `database_setup.py`
4. **Set Environment Variables**: BOT_TOKEN, ADMIN_CHAT_ID, DB_URL
5. **Deploy Extension**: Load unpacked extension in Chrome

## 📊 Data Flow

### 1. NAV Monitoring Cycle
```
Extension → Web Scraping → Data Extraction → API Call → Calculation → Alert
```

### 2. Expert Data Collection
```
User Selection → Security List → Row Detection → Data Reading → Storage → Processing
```

### 3. Alert Generation
```
Discrepancy Detection → Calculation → Notification → Telegram/Extension Alert
```

## 🛠️ Configuration Management

### Fund Configuration
Each fund requires:
- **NAV Page URL**: Where NAV values are displayed
- **Expert Page URL**: Where security data is available
- **CSS Selectors**: For data extraction (now using fixed columns)
- **Tolerance Settings**: Acceptable deviation thresholds

### Extension Settings
- **Active Fund Selection**: Choose which fund to monitor
- **Test Mode**: Enable artificial discrepancies for testing
- **Alert Preferences**: Customize notification settings
- **Tab Management**: Automatic NAV and Expert tab management

## 🔍 Monitoring Logic

### Market Hours Detection
- **Active Hours**: 9:00 AM - 3:00 PM (local time)
- **Check Frequency**: 2 minutes (active), 10 minutes (inactive)
- **Stale Data Detection**: Alerts if data is older than 2 minutes

### Data Extraction Strategy
- **Fixed Columns**: Column 1 (name), 3 (sellable), 12 (expert price)
- **Row Selection**: Name-based matching with fallback to index
- **Error Recovery**: Multiple attempts with different strategies
- **Validation**: Cross-checking extracted data for consistency

## 📱 User Interface

### Popup Interface
- **Fund Selection**: Dropdown for active fund selection
- **Status Display**: Real-time monitoring status
- **Security Information**: Selected security details
- **Log Display**: Real-time activity logs
- **Control Buttons**: Start/Stop/Reset functionality

### Options Page
- **Configuration Management**: Add/edit fund configurations
- **Selector Testing**: Test CSS selectors for data extraction
- **System Settings**: Global extension settings
- **Database Management**: Direct database operations

## 🔐 Security Features

### Authentication
- **Token-Based Auth**: Secure API access
- **User Management**: Multi-user support
- **Permission System**: Role-based access control

### Data Protection
- **Encrypted Storage**: Sensitive data encryption
- **Secure Communication**: HTTPS for all API calls
- **Input Validation**: Comprehensive data validation

## 📈 Performance Optimization

### Resource Management
- **Tab Limiting**: Maximum 2 tabs per fund (NAV + Expert)
- **Memory Management**: Efficient storage usage
- **Network Optimization**: Minimal API calls
- **Error Recovery**: Graceful failure handling

### Monitoring Efficiency
- **Smart Polling**: Adaptive check intervals
- **Data Caching**: Reduce redundant requests
- **Parallel Processing**: Concurrent fund monitoring
- **Background Operations**: Non-blocking UI operations

## 🐛 Debugging & Troubleshooting

### Debug Tools
- **Comprehensive Logging**: Detailed activity logs
- **Selector Testing**: Built-in selector validation
- **Data Validation**: Cross-checking extracted values
- **Error Reporting**: Detailed error messages

### Common Issues
- **Selector Failures**: Website structure changes
- **Network Issues**: Connection timeouts
- **Data Inconsistencies**: Stale or invalid data
- **Permission Errors**: Extension permission issues

## 🔮 Future Enhancements

### Multi-Fund Dashboard
- **Simultaneous Monitoring**: Monitor multiple funds at once
- **Unified Interface**: Single dashboard for all funds
- **Advanced Analytics**: Historical data analysis
- **Custom Alerts**: Fund-specific alert rules

### Advanced Features
- **Machine Learning**: Predictive NAV adjustments
- **Mobile App**: Native mobile application
- **API Integration**: Third-party system integration
- **Advanced Reporting**: Comprehensive reporting system

## 📞 Support & Maintenance

### Management Commands
```bash
sudo nav_manager  # Post-installation management
```

### Log Locations
- **Extension Logs**: Chrome DevTools Console
- **Server Logs**: `/var/log/nav_assistant/`
- **Database Logs**: PostgreSQL logs

### Update Process
- **Extension Updates**: Manual reload in Chrome
- **Server Updates**: Git pull and service restart
- **Database Updates**: Migration scripts

## 📄 License & Legal

- **License**: [Specify License]
- **Usage**: Commercial and personal use
- **Support**: Community and professional support available
- **Contributions**: Open for community contributions

---

## 🎯 Use Cases

### Investment Fund Management
- **Real-time NAV monitoring**
- **Automated adjustment calculations**
- **Multi-fund portfolio management**
- **Regulatory compliance tracking**

### Financial Institutions
- **Fund performance tracking**
- **Risk management**
- **Compliance monitoring**
- **Client reporting**

### Individual Investors
- **Portfolio monitoring**
- **Performance tracking**
- **Alert management**
- **Decision support**

---

*This system represents a complete solution for automated NAV monitoring in the Iranian financial market, providing real-time insights and automated management capabilities for investment fund operations.*
