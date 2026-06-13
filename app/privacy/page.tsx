import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | DXBmovies",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-text-secondary">
      <Link href="/login" className="mb-8 inline-block text-xs text-primary hover:underline">
        Back
      </Link>

      <h1 className="mb-6 text-2xl font-bold text-white">Privacy Policy</h1>
      <p className="mb-4 text-xs text-text-secondary">Last updated: June 2026</p>

      <section className="space-y-6">
        <div>
          <h2 className="mb-2 font-semibold text-white">1. What We Collect</h2>
          <p>When you sign in with Google, we receive your name, email address, and profile picture. We also store:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Your movie preferences, watchlist, and reactions (likes and dislikes)</li>
            <li>Your AI companion settings and conversation history</li>
            <li>Your preferred streaming services and genre interests</li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 font-semibold text-white">2. How We Use It</h2>
          <p>
            Your data is used exclusively to personalize your movie recommendations
            and improve the AI companion experience. We use your likes, dislikes,
            watchlist, and genre preferences to surface more relevant content.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-semibold text-white">3. Third Party Services</h2>
          <p>We use the following third-party services to operate the app:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Google OAuth for sign-in</li>
            <li>The Movie Database (TMDB) for movie metadata</li>
            <li>AI model providers (Groq, OpenAI, Anthropic) for conversation</li>
            <li>MongoDB Atlas for data storage</li>
          </ul>
          <p className="mt-2">
            We do not sell or share your personal data with any other parties.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-semibold text-white">4. Data Retention</h2>
          <p>
            Your data is retained as long as your account is active. You may request
            deletion of your data at any time by contacting us. Deleting your account
            removes all associated data from our systems.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-semibold text-white">5. Cookies and Storage</h2>
          <p>
            We use browser local storage to remember your session preferences and
            usage state. We use secure, HTTP-only session cookies for authentication.
            We do not use advertising or tracking cookies.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-semibold text-white">6. Security</h2>
          <p>
            All data is transmitted over HTTPS. Authentication is handled via Google
            OAuth and NextAuth.js. We follow industry-standard practices to protect
            your information.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-semibold text-white">7. Contact</h2>
          <p>
            For privacy-related requests, contact us at{" "}
            <a href="mailto:hello@dxbmovies.com" className="text-primary underline underline-offset-2">
              hello@dxbmovies.com
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
