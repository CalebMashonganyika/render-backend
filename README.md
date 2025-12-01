# 🔑 Render Backend for Unlock Key System

A complete Node.js/Express backend system running on Render free tier for managing unlock keys. Replaces InfinityFree/PHP with a modern, scalable solution.

## 📁 Project Structure

```
render-backend/
├── index.js                 # Main Express server
├── package.json            # Dependencies and scripts
├── render.yaml             # Render deployment config
├── .env.example            # Environment variables template
├── database_schema.sql     # PostgreSQL schema
├── routes/
│   ├── api.js             # Public API endpoints
│   └── admin.js           # Admin-only endpoints
└── public/
    └── admin.html         # Admin dashboard UI
```

## 🚀 Quick Deploy to Render

### 1. Create GitHub Repository
```bash
# Upload this entire folder to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/unlock-key-backend.git
git push -u origin main
```

### 2. Deploy via Render Blueprint

**Important**: Render now requires Blueprint deployment for free PostgreSQL databases.

1. **Ensure `render.yaml` is in your repository root**
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click **"Blueprints"** → **"New Blueprint Instance"**
4. Connect your GitHub repository
5. Render will automatically:
   - Create a free PostgreSQL database (`unlock-key-db`)
   - Create your web service (`unlock-key-backend`)
   - Connect them with `DATABASE_URL`

### 3. Set Admin Password

After deployment, go to your web service settings and add:
- **Key**: `ADMIN_PASSWORD`
- **Value**: `your_secure_password_here`

### 4. Initialize Database

1. Go to your PostgreSQL database in Render dashboard
2. Open **"PSQL"** terminal
3. Copy and paste the contents of `database_schema.sql`
4. Execute the SQL commands

### 4. Deploy
1. Click "Create Web Service" on Render
2. Wait for deployment to complete
3. Your backend will be available at: `https://your-service-name.onrender.com`

## 🔧 Environment Variables

Create a `.env` file (local development) or set in Render dashboard:

```env
DATABASE_URL=postgresql://username:password@host:5432/database_name
ADMIN_PASSWORD=your_secure_admin_password_here
PORT=3000
NODE_ENV=production
```

## 📊 Database Schema

The system creates two tables automatically on startup:

### `unlock_keys` Table
```sql
CREATE TABLE unlock_keys (
    id SERIAL PRIMARY KEY,
    unlock_key VARCHAR(20) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    redeemed_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### `user_tokens` Table
```sql
CREATE TABLE user_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(255) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🔗 API Endpoints

### Public Endpoints

#### POST `/api/verify_key`
Verify and redeem an unlock key.

**Request:**
```json
{
  "user_id": "user123",
  "unlock_key": "ABCD-EFGH"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "token": "secure_random_token_here",
  "message": "Premium features unlocked!",
  "premium_until": "2025-12-01T08:05:00.000Z",
  "duration_minutes": 5
}
```

**Error Response (400):**
```json
{
  "success": false,
  "message": "Invalid or expired unlock key"
}
```

#### POST `/api/check_token`
Verify if a user token is still valid.

**Request:**
```json
{
  "token": "secure_token_here"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "valid": true,
  "user_id": "user123",
  "expires_at": "2025-12-01T08:05:00.000Z"
}
```

### Admin Endpoints (Require Authentication)

#### POST `/admin/login`
Authenticate admin user.

**Request:**
```json
{
  "password": "admin_password"
}
```

#### POST `/admin/generate_key`
Generate a new unlock key (5-minute expiry).

**Headers:**
```
Authorization: Bearer admin_token
```

#### DELETE `/admin/keys/:id`
Delete a specific key.

#### PUT `/admin/keys/:id/toggle`
Mark a key as used/unused.

## 🎛️ Admin Dashboard

Access the admin dashboard at: `https://your-service.onrender.com/admin`

### Features:
- **Secure Login**: Password-based authentication
- **Generate Keys**: Create new unlock keys with 5-minute expiry
- **View Keys**: See all keys with status (active/used/expired)
- **Manage Keys**: Delete keys or mark as used/unused
- **Real-time Updates**: Dashboard updates automatically

## 📱 Flutter App Integration

Add this method to your `SubscriptionService`:

```dart
// Render backend URL
static const String renderBaseUrl = 'https://your-service.onrender.com';

// Verify unlock key with Render backend
static Future<Map<String, dynamic>> verifyUnlockKey(String userId, String unlockKey) async {
  final response = await http.post(
    Uri.parse('$renderBaseUrl/api/verify_key'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({
      'user_id': userId,
      'unlock_key': unlockKey,
    }),
  );

  if (response.statusCode == 200) {
    return jsonDecode(response.body);
  } else {
    throw Exception('Failed to verify key');
  }
}

// Check if token is still valid
static Future<Map<String, dynamic>> checkToken(String token) async {
  final response = await http.post(
    Uri.parse('$renderBaseUrl/api/check_token'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'token': token}),
  );

  if (response.statusCode == 200) {
    return jsonDecode(response.body);
  } else {
    throw Exception('Failed to check token');
  }
}
```

## 🧪 Testing

### Test the API
```bash
# Test verify_key endpoint
curl -X POST https://your-service.onrender.com/api/verify_key \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test_user", "unlock_key": "ABCD-EFGH"}'

# Test check_token endpoint
curl -X POST https://your-service.onrender.com/api/check_token \
  -H "Content-Type: application/json" \
  -d '{"token": "your_token_here"}'
```

### Local Development
```bash
# Install dependencies
npm install

# Set up local PostgreSQL or use a cloud database
# Update .env file with DATABASE_URL

# Run locally
npm run dev

# Test at http://localhost:3000
```

## 🔒 Security Features

- **Password Protection**: Admin dashboard requires authentication
- **Token-based Auth**: Secure API access with Bearer tokens
- **Rate Limiting**: Prevents API abuse
- **Input Validation**: Sanitized user inputs
- **HTTPS Only**: Render provides SSL certificates
- **SQL Injection Protection**: Parameterized queries

## 📈 Key Specifications

- **Format**: XXXX-XXXX (8 alphanumeric characters)
- **Expiry**: 5 minutes from generation
- **Usage**: One-time only
- **Storage**: PostgreSQL database
- **Security**: Cryptographically secure random generation

## 🚀 Deployment Checklist

- [ ] Create GitHub repository
- [ ] Create Render PostgreSQL database
- [ ] Create Render web service
- [ ] Set environment variables
- [ ] Run database schema
- [ ] Deploy and test
- [ ] Update Flutter app URLs
- [ ] Test end-to-end flow

## 🆘 Troubleshooting

### Database Connection Issues
- Check `DATABASE_URL` format
- Ensure database is running
- Verify SSL settings

### Admin Login Issues
- Check `ADMIN_PASSWORD` environment variable
- Ensure password is set in Render dashboard

### API Errors
- Check server logs in Render dashboard
- Verify request format
- Test with curl commands

### Deployment Issues
- Check build logs
- Verify package.json scripts
- Ensure all dependencies are listed

## 💰 Cost (Free Tier)

- **Web Service**: 750 hours/month free
- **PostgreSQL**: 512MB storage free
- **Bandwidth**: 100GB/month free
- **No credit card required**

## 🔄 Migration from InfinityFree

1. **Export existing keys** (if needed)
2. **Update Flutter app** to use new endpoints
3. **Test thoroughly** before going live
4. **Update admin workflows** to use new dashboard

---

**Ready to deploy?** Just upload to GitHub and follow the Render setup steps above! 🎉