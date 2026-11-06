# Deployment Guide (VPS + PM2 + Nginx, Docker ছাড়া)

একটা Ubuntu VPS-এ পুরো system চালানোর ধাপ। প্রতিটা ধাপ ক্রম অনুযায়ী করো।

```
Internet ──► Nginx (SSL) ─┬─► app / www / root  ─► Next.js  (PM2: isp-web,   :3000)
                          └─► api.yourdomain.com ─► Express  (PM2: isp-api×2, :5000)
                                                    Worker   (PM2: isp-worker — cron jobs)
                                                    MongoDB  (replica set, localhost only)
```

> নিচে সব জায়গায় `yourdomain.com` তোমার আসল domain দিয়ে বদলাবে।

---

## ০. যা লাগবে

| জিনিস | পরামর্শ |
|---|---|
| VPS | Ubuntu 24.04, beta-র জন্য **2 vCPU / 4 GB RAM / 40 GB SSD** যথেষ্ট। BD বা Singapore location হলে MikroTik-এর latency কম |
| Domain | যেকোনো registrar |
| DNS | `A` record: `@`, `www`, `app`, `api` → VPS-এর IP |
| Router | MikroTik-এর API port (8728/8729) VPS-এর IP থেকে পৌঁছাতে হবে (ধাপ ৯) |

---

## ১. Server প্রস্তুত করা

```bash
# root হিসেবে
adduser deploy && usermod -aG sudo deploy
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
apt update && apt upgrade -y
apt install -y git curl nginx certbot python3-certbot-nginx
```

এরপর থেকে `deploy` user হিসেবে কাজ করো: `su - deploy`

## ২. Node.js 22, pnpm, PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pnpm@11 pm2
node -v && pnpm -v && pm2 -v
```

## ৩. MongoDB 7 (replica set + password)

App transaction ব্যবহার করে, তাই **replica set বাধ্যতামূলক** (একটা server-এ এক member-এর replica set-ই যথেষ্ট)।

```bash
# official repo (Ubuntu 24.04 "noble")
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-org

# keyfile (auth সহ replica set-এর জন্য লাগে)
sudo openssl rand -base64 756 | sudo tee /etc/mongod-keyfile >/dev/null
sudo chmod 400 /etc/mongod-keyfile && sudo chown mongodb:mongodb /etc/mongod-keyfile

# config: repo-র deploy/mongod.conf.example কপি করো (ধাপ ৪-এর পর), অথবা এখনই হাতে লেখো
sudo nano /etc/mongod.conf
sudo systemctl enable --now mongod
```

প্রথম user তৈরি (localhost থেকে প্রথমবার password ছাড়াই ঢোকা যায়):

```bash
mongosh --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
sleep 5
mongosh admin --quiet --eval 'db.createUser({user:"root",pwd:"<ROOT_PASSWORD>",roles:["root"]})'
mongosh -u root -p '<ROOT_PASSWORD>' --authenticationDatabase admin --quiet --eval \
  'db.getSiblingDB("isp").createUser({user:"ispapp",pwd:"<APP_PASSWORD>",roles:[{role:"readWrite",db:"isp"}]})'
```

App-এর connection string:
```
DB_URL=mongodb://ispapp:<APP_PASSWORD>@127.0.0.1:27017/isp?replicaSet=rs0&authSource=isp
```

> Password-এ `@ : / ?` থাকলে URL-encode করতে হবে। সহজ উপায়: শুধু অক্ষর আর সংখ্যা দিয়ে লম্বা password বানাও।
> বিকল্প: MongoDB Atlas (managed) ব্যবহার করলে এই ধাপ লাগবে না — শুধু Atlas-এর connection string দাও।

## ৪. Code আনা

Repo private, তাই **deploy key** ব্যবহার করো:

```bash
ssh-keygen -t ed25519 -C "isp-vps" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
# GitHub → repo → Settings → Deploy keys → Add (read-only) — এই key paste করো
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
EOF
git clone git@github.com:promahbubul/isp-manager-saas.git ~/isp-manager-saas
cd ~/isp-manager-saas
```

## ৫. Environment file

### backend/.env

```bash
cp backend/.env.example backend/.env
# প্রতিটা secret আলাদা করে তৈরি করো (৩ বার চালাও):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
nano backend/.env
```

| Key | Production মান |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `5000` |
| `DB_URL` | ধাপ ৩-এর string |
| `CORS_ORIGINS` | `https://app.yourdomain.com,https://yourdomain.com,https://www.yourdomain.com` |
| `COOKIE_DOMAIN` | `.yourdomain.com` (শুরুতে dot সহ — app আর api একই login cookie পায়) |
| `API_PUBLIC_URL` | `https://api.yourdomain.com` |
| `APP_URL` | `https://app.yourdomain.com` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | নতুন random, দুটো আলাদা |
| `ENCRYPTION_KEY` | নতুন random — ⚠️ **একবার set করার পর কখনো বদলাবে না**, নিরাপদে backup রাখো (router/gateway password এটা দিয়ে encrypt) |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | তোমার email + শক্ত password |
| `SMS_PROVIDER` + `SMS_HTTP_URL` ... | আসল SMS gateway (না দিলে OTP/SMS যাবে না) |

ভুল বা অনিরাপদ মান থাকলে (example secret, `http://` URL, `localhost` CORS) server **চালুই হবে না** এবং কারণ দেখাবে।

### frontend/.env.local

```bash
cp frontend/.env.example frontend/.env.local
nano frontend/.env.local
```

```
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
NEXT_PUBLIC_APP_NAME=ISP Manager
NEXT_PUBLIC_ROOT_DOMAIN=yourdomain.com
NEXT_PUBLIC_LEGAL_NAME=তোমার কোম্পানির আইনি নাম
NEXT_PUBLIC_SUPPORT_EMAIL=support@yourdomain.com
NEXT_PUBLIC_SUPPORT_PHONE=+8801XXXXXXXXX
NEXT_PUBLIC_OFFICE_ADDRESS=অফিসের ঠিকানা
NEXT_PUBLIC_TRADE_LICENSE=ট্রেড লাইসেন্স নং
```

> `NEXT_PUBLIC_*` build-এর সময় code-এ বসে যায় — বদলালে আবার `deploy.sh` চালাতে হবে।

## ৬. Build ও চালু

```bash
bash deploy/scripts/deploy.sh
pm2 startup        # যে command দেখাবে সেটা sudo দিয়ে চালাও — reboot-এর পর নিজে চালু হবে
pm2 save
pm2 status         # isp-api ×2, isp-worker ×1, isp-web ×1 → সব "online"
```

## ৭. Nginx + SSL

```bash
sed -i 's/yourdomain.com/তোমার-domain.com/g' deploy/nginx/isp-manager.conf
sudo cp deploy/nginx/isp-manager.conf /etc/nginx/sites-available/isp-manager
sudo ln -s /etc/nginx/sites-available/isp-manager /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d app.yourdomain.com -d api.yourdomain.com
```

যাচাই: `curl https://api.yourdomain.com/api/v1/health` → `"db":"up"`

## ৮. Backup

```bash
crontab -e
# প্রতিদিন রাত ৩:৩০-এ
30 3 * * * bash /home/deploy/isp-manager-saas/deploy/scripts/backup-mongo.sh >> /home/deploy/backup.log 2>&1
```

⚠️ Backup **server-এর বাইরেও** রাখো (rclone দিয়ে Google Drive / S3)। মাসে একবার restore করে দেখো।
`ENCRYPTION_KEY` আর `backend/.env`-এর কপিও আলাদা নিরাপদ জায়গায় রাখো — এগুলো ছাড়া backup কাজে আসবে না।

## ৯. MikroTik-কে server-এর সাথে যুক্ত করা

ISP-র router-এ (public IP থাকলে):

```
/ip service set api address=<VPS_IP>/32 disabled=no
/user group add name=billing policy=read,write,api,policy,test,sensitive
/user add name=billing group=billing password=<শক্ত-password>
/ip firewall filter add chain=input protocol=tcp dst-port=8728 src-address=<VPS_IP> action=accept place-before=0
```

তারপর panel → Network → Routers → Add → **Test**।
Router-এ public IP না থাকলে VPN লাগবে (WireGuard — PLAN.md Phase 6, এখনো তৈরি হয়নি)।

## ১০. চালুর পর checklist

- [ ] `https://app.yourdomain.com/admin/login` → super admin login → password বদলাও
- [ ] `/admin/gateways` → অন্তত একটা method চালু (প্রথমে **Sandbox**), একটা test payment
- [ ] Gateway merchant panel-এ IPN / webhook URL দাও (README → "Callback URLs")
- [ ] Forgot password দিয়ে SMS আসছে কিনা দেখো
- [ ] একটা test ISP signup → router → package → customer → recharge → MikroTik-এ secret enable হলো কিনা
- [ ] `pm2 logs isp-worker` — প্রতি ১৫ মিনিটে `[job] expireCustomers done` আসছে
- [ ] Uptime monitor (UptimeRobot ইত্যাদি) → `https://api.yourdomain.com/api/v1/health`
- [ ] Backup cron চলছে, server-এর বাইরে কপি হচ্ছে
- [ ] Terms / Privacy / Refund page-এ কোম্পানির আসল তথ্য দেখাচ্ছে (SSLCommerz live approval-এর জন্য)

## আপডেট

নতুন code push করার পর server-এ:

```bash
cd ~/isp-manager-saas && bash deploy/scripts/deploy.sh
```

`pm2 reload` একটা একটা করে process restart করে — API বন্ধ হয় না।

## সমস্যা হলে

| লক্ষণ | দেখো |
|---|---|
| Server চালু হচ্ছে না | `pm2 logs isp-api --lines 50` — "Unsafe production config" বা "Invalid environment variables" |
| `db: down` | `sudo systemctl status mongod`, `DB_URL`-এর user/password/`authSource` |
| Login হয়ে আবার login page-এ ফেরে | `COOKIE_DOMAIN=.yourdomain.com`, দুটো subdomain-ই https কিনা |
| Payment-এর পর "processing"-এ আটকে | `API_PUBLIC_URL` internet থেকে খোলা কিনা, gateway panel-এ IPN URL |
| Router "unreachable" | VPS থেকে `nc -vz <router-ip> 8728`, MikroTik firewall / `api` service-এর address |
| Job চলছে না | `pm2 status` — `isp-worker` একটাই online থাকতে হবে |

> **Rate limit:** login/OTP-এর সীমা প্রতি API process-এ আলাদা গোনা হয় (২টা process = দ্বিগুণ)। বেশি process চালালে Redis store যোগ করতে হবে (পরে)।
