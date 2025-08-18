[فارسی](README.fa.md)

# NAV Assistant - Automated NAV Monitoring Bot

A complete platform for real-time monitoring of investment fund NAV, designed to compare on-page NAV with live market data, calculate adjustments, and send alerts via Telegram.

---

## Features
- **Real-time Monitoring**: Continuously checks for discrepancies between software NAV and market prices.
- **Multi-Fund Support**: Manage configurations for multiple funds through a central database.
- **Automated Calculations**: Applies custom formulas to suggest new adjusted NAV prices.
- **Centralized Configuration**: Manage all settings (URLs, selectors) via the extension's options page.
- **Professional Deployment**: Comes with an interactive installation script for easy setup on any Ubuntu server.

---

## Prerequisites
- A server running **Ubuntu 20.04 / 22.04 LTS**.
- A **domain name** pointed to your server's IP address.

---

## 🚀 Installation

Follow these steps to deploy the NAV Assistant on your server.

1.  **Clone the Repository**
    Clone your project repository onto the server.
    ```bash
    git clone https://github.com/AlamorNetwork/nav_assistant_project.git
    ```

2.  **Navigate to Project Directory**
    ```bash
    cd nav_assistant_project
    ```

3.  **Run the Installation Script**
    The script will ask for your domain name and email to configure the web server and SSL certificate.
    ```bash
    chmod +x install.sh
    sudo ./install.sh install
    ```

---

## 🛠️ Post-Installation Management
After the installation is complete, a management script is available. You can run it anytime to manage the service:
```bash
sudo nav_manager