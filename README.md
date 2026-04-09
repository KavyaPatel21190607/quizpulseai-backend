# QuizPulse AI Backend

## Production-Level Backend Setup

### Installation

```bash
cd backend
npm install
```

### Environment Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Update the `.env` file with your configurations:
- **MongoDB**: Set your MongoDB URI
- **JWT_SECRET**: Set a strong secret key
- **GEMINI_API_KEY**: Get from Google AI Studio
- **Supabase**: Set your Supabase URL, anon key, and service role key
- **Google OAuth**: Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL
- **FRONTEND_URL**: Your frontend URL

### Running the Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/google` - Continue with Google
- `GET /api/auth/google/callback` - Google OAuth callback

### Quiz Management
- `POST /api/quizzes/generate` - Generate quiz using Gemini AI
- `GET /api/quizzes/my-quizzes` - Get user's quizzes
- `GET /api/quizzes/:id` - Get specific quiz
- `POST /api/quizzes/submit-attempt` - Submit quiz responses
- `GET /api/quizzes/progress/user` - Get user progress

### Messaging
- `GET /api/messages/conversations` - Get all conversations
- `POST /api/messages/conversations/:userId` - Create/get conversation
- `GET /api/messages/messages/:conversationId` - Get messages
- `POST /api/messages/send` - Send encrypted message with files
- `PUT /api/messages/messages/:messageId/read` - Mark message as read
- `GET /api/messages/search/users` - Search users

### User Management
- `GET /api/users/profile` - Get own profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users/:id` - Get other user's profile
- `GET /api/users/admin/users` - Get all users (Admin)
- `GET /api/users/admin/stats` - Get dashboard stats (Admin)

## Security Features

✅ SHA-256-derived AES-256-CBC message encryption (derived from JWT secret)
✅ JWT authentication with expiration
✅ Bcryptjs password hashing
✅ Role-based access control
✅ Input validation
✅ CORS protection
✅ Helmet + rate limiting
✅ Error handling

## External Services

- **Gemini API**: For AI-powered quiz generation
- **Supabase Storage**: For file/image uploads
- **MongoDB**: NoSQL database

## Tech Stack

- **Node.js** + **Express.js**
- **MongoDB** with Mongoose
- **JWT** for authentication
- **Bcryptjs** for password hashing
- **Google Generative AI** for quiz generation
- **Supabase** for file storage
- **Multer** for file uploads
