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

## 🚀 One-Liner Installation
This command will download and run the installer script, which will then guide you through an interactive setup by asking for your domain, Git repo URL, and email.

```bash
bash <(curl -Ls https://raw.githubusercontent.com/AlamorNetwork/nav_assistant_project/main/install.sh) install
```
**Note:** Ensure you replace the URL with the raw link to your own `install.sh` script if it's in a different repository.

---

## 🛠️ Post-Installation Management
After the installation is complete, a management script is available. You can run it anytime to manage the service:
```bash
sudo nav_manager