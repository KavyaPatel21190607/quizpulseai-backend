import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';

const configurePassport = () => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
    return passport;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const primaryEmail = profile.emails?.[0]?.value;

          if (!primaryEmail) {
            return done(new Error('Google account email is required'));
          }

          let user = await User.findOne({
            $or: [{ googleId: profile.id }, { email: primaryEmail.toLowerCase() }],
          });

          if (!user) {
            user = await User.create({
              googleId: profile.id,
              name: profile.displayName || primaryEmail.split('@')[0],
              email: primaryEmail.toLowerCase(),
              role: 'student',
              avatar: profile.photos?.[0]?.value || null,
              isVerified: true,
            });
          } else {
            if (!user.googleId) {
              user.googleId = profile.id;
            }
            if (!user.avatar && profile.photos?.[0]?.value) {
              user.avatar = profile.photos[0].value;
            }
            await user.save();
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  return passport;
};

export default configurePassport;
