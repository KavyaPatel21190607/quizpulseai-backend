import express from 'express';
import passport from 'passport';
import {
	signup,
	login,
	googleAuthSuccess,
	googleAuthFailure,
} from '../controllers/authController.js';

const router = express.Router();

const ensureGoogleOAuthConfigured = (req, res, next) => {
	if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
		return res.status(503).json({
			success: false,
			message: 'Google OAuth is not configured on the server',
		});
	}
	return next();
};

router.post('/signup', signup);
router.post('/login', login);

const getSafeRedirect = (redirect) => {
  if (!redirect || typeof redirect !== 'string') {
    return '/dashboard';
  }

	if (redirect.startsWith('quizpulseai://oauth/callback')) {
		return redirect;
	}

	if (!redirect.startsWith('/') || redirect.startsWith('//')) {
    return '/dashboard';
  }

  return redirect;
};

const parseOAuthState = (state) => {
  if (!state || typeof state !== 'string') {
    return '/dashboard';
  }

  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    const ageMs = Date.now() - Number(decoded?.t || 0);
    const notExpired = Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= 10 * 60 * 1000;

    if (!notExpired) {
      return '/dashboard';
    }

    return getSafeRedirect(decoded?.r);
  } catch {
    return '/dashboard';
  }
};

router.get('/google',
	ensureGoogleOAuthConfigured,
	(req, res, next) => {
		const safeRedirect = getSafeRedirect(req.query.redirect);
		const state = Buffer.from(
			JSON.stringify({ r: safeRedirect, t: Date.now() }),
			'utf8'
		).toString('base64url');

		passport.authenticate('google', {
			scope: ['profile', 'email'],
			session: false,
			prompt: 'select_account',
			state,
		})(req, res, next);
	}
);

router.get('/google/callback',
	ensureGoogleOAuthConfigured,
	(req, res, next) => {
		req.oauthRedirectPath = parseOAuthState(req.query.state);
		next();
	},
	passport.authenticate('google', {
		session: false,
		failureRedirect: '/api/auth/google/failure',
	}),
	googleAuthSuccess
);

router.get('/google/failure', googleAuthFailure);

export default router;
