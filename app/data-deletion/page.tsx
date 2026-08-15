import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Deletion Instructions | DXBmovies",
  description: "Instructions for requesting the deletion of your data from DXBmovies.",
};

export default function DataDeletionPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-text-secondary">
      <Link href="/login" className="mb-8 inline-block text-xs text-primary hover:underline">
        Back
      </Link>

      <h1 className="mb-6 text-2xl font-bold text-white">Data Deletion Instructions</h1>
      <p className="mb-4 text-xs text-text-secondary">Last updated: August 2026</p>

      <section className="space-y-6">
        <div>
          <h2 className="mb-2 font-semibold text-white">1. Introduction</h2>
          <p>
            At DXBmovies, we respect your privacy and your right to control your personal data. 
            This page provides instructions on how to request the deletion of any personal data we 
            may hold about you, including data from your DXBmovies account and any data received 
            through our Meta/Instagram integrations.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-semibold text-white">2. What Data Can Be Deleted?</h2>
          <p>You can request the deletion of:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li><strong>DXBmovies Account Data:</strong> Profile information (name, email, profile picture), movie preferences, watchlists, reactions, and AI companion conversation history.</li>
            <li><strong>Instagram/Meta Integration Data:</strong> Any Instagram identifiers, direct messages (DMs), comments, or related integration data we may have temporarily processed or stored while interacting with our automated services via @dxbmovies on Instagram.</li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 font-semibold text-white">3. How to Request Deletion</h2>
          <p>
            To request the complete deletion of your data, please send an email to our support team at:
          </p>
          <p className="mt-2">
            <a href="mailto:hello@dxbmovie.online" className="text-primary underline underline-offset-2">
              hello@dxbmovie.online
            </a>
          </p>
          <p className="mt-4 font-medium text-white">Please include the following information in your email so we can locate your data:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li><strong>Subject Line:</strong> Data Deletion Request</li>
            <li>The <strong>email address</strong> associated with your DXBmovies account (if you have one).</li>
            <li>Your <strong>Instagram handle/username</strong> (e.g., @yourusername) if you are requesting deletion of data related to our Instagram automated messaging or comments.</li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 font-semibold text-white">4. Deletion Process</h2>
          <p>
            Once we receive your request and verify your identity, we will permanently delete your 
            account and all associated personal data from our databases (including MongoDB and our internal logs). 
            We will reply to your email to confirm when the deletion is complete.
          </p>
        </div>
      </section>
    </main>
  );
}
