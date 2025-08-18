# NAV Assistant - Automated NAV Monitoring Bot

A complete platform for real-time monitoring of investment fund NAV, designed to compare on-page NAV with live market data, calculate adjustments, and send alerts.

---

## Features
- **Real-time Monitoring**: Continuously checks for discrepancies between software NAV and market prices.
- **Multi-Fund Support**: Manage configurations for multiple funds through a central database.
- **Automated Calculations**: Applies custom formulas to suggest new adjusted NAV prices.
- **Alerting System**: Sends instant notifications via Telegram.
- **Centralized Configuration**: Manage all settings (URLs, selectors) via the extension's options page.
- **Professional Deployment**: Comes with an interactive installation script for easy setup on any Ubuntu server.

---

## Prerequisites
- A server running **Ubuntu 20.04 / 22.04 LTS**.
- A **domain name** pointed to your server's IP address.
- Your project code hosted in a **private Git repository**.

---

## 🚀 One-Liner Installation
This command will run the interactive installation script. It will ask for your domain name and Git repository URL.

```bash
sudo bash <(curl -Ls https://raw.githubusercontent.com/AlamorNetwork/nav_assistant_project/main/install.sh) install
```
**Note:** Replace the URL with the raw link to your own `install.sh` script on GitHub.

---

## 🛠️ Post-Installation Management
After the installation is complete, a management script is available. You can run it anytime with:
```bash
sudo nav_manager
```
This will open a menu that allows you to:
- Check the status of the service
- View live logs
- Start / Stop / Restart the service

<br>
<hr>
<br>

# دستیار هوشمند NAV - ربات خودکار نظارت بر NAV

یک پلتفرم کامل برای نظارت لحظه‌ای بر NAV صندوق‌های سرمایه‌گذاری که برای مقایسه NAV نرم‌افزار با داده‌های زنده بازار، محاسبه تعدیل‌ها و ارسال هشدار طراحی شده است.

---

## قابلیت‌ها
- **نظارت لحظه‌ای**: بررسی مداوم اختلاف بین NAV نرم‌افزار و قیمت تابلو.
- **پشتیبانی از چند صندوق**: مدیریت پیکربندی چندین صندوق از طریق یک دیتابیس مرکزی.
- **محاسبات خودکار**: اعمال فرمول‌های سفارشی برای پیشنهاد قیمت NAV تعدیل‌شده جدید.
- **سیستم هشدار**: ارسال نوتیفیکیشن‌های فوری از طریق تلگرام.
- **پیکربندی متمرکز**: مدیریت تمام تنظیمات (آدرس‌ها، سلکتورها) از طریق صفحه تنظیمات اکستنشن.
- **نصب حرفه‌ای**: دارای اسکریپت نصب تعاملی برای راه‌اندازی آسان روی سرور اوبونتو.

---

## پیش‌نیازها
- یک سرور با سیستم‌عامل **Ubuntu 20.04 / 22.04 LTS**.
- یک **نام دامنه** که به IP سرور شما متصل شده باشد.
- کد پروژه شما که در یک **ریپازیتوری گیت خصوصی** میزبانی می‌شود.

---

## 🚀 نصب تک‌خطی
این دستور، اسکریپت نصب تعاملی را اجرا می‌کند. در حین اجرا، نام دامنه و آدرس ریپازیتوری گیت از شما پرسیده خواهد شد.

```bash
sudo bash <(curl -Ls https://raw.githubusercontent.com/AlamorNetwork/nav_assistant_project/main/install.sh) install
```
**توجه:** آدرس URL بالا را با لینک خام به فایل `install.sh` خودتان در گیت‌هاب جایگزین کنید.

---

## 🛠️ مدیریت پس از نصب
بعد از اتمام نصب، یک اسکریپت مدیریتی برای شما ایجاد می‌شود. هر زمان که بخواهید می‌توانید آن را با دستور زیر اجرا کنید:
```bash
sudo nav_manager
```
این دستور یک منو برای شما باز می‌کند که از طریق آن می‌توانید:
- وضعیت سرویس را بررسی کنید
- لاگ‌های زنده را مشاهده کنید
- سرویس را شروع / متوقف / ری‌استارت کنید