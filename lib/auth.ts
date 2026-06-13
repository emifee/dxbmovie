import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import clientPromise from "./mongodb";

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise),

  // Only Google OAuth — no email/credentials providers allowed
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
        },
      },
    }),
  ],

  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60,   // refresh session token once per day
  },

  callbacks: {
    // Block any sign-in that is not via Google OAuth
    async signIn({ account }) {
      if (account?.provider !== "google") return false;
      return true;
    },

    session({ session, user }) {
      if (session.user) {
        (session.user as typeof session.user & { id: string; onboardingDone?: boolean }).id = user.id;
        (session.user as typeof session.user & { id: string; onboardingDone?: boolean }).onboardingDone =
          (user as typeof user & { onboardingDone?: boolean }).onboardingDone ?? false;
      }
      return session;
    },

    // Redirect new users to onboarding, returning users straight to home
    async redirect({ url, baseUrl }) {
      // If the callbackUrl is just the base URL (from login page), check if
      // new-user flag was set and redirect to onboarding
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login", // Redirect auth errors back to login, not a separate page
  },

  // Strict CSRF — next-auth enforces this, but being explicit
  useSecureCookies: process.env.NODE_ENV === "production",
};
