import { resolveLocation, parsePhone } from '../lib/commerce/location';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function runTests() {
  const testCases = [
    {
      name: "Nigeria (Geocoding Fallback)",
      address: "53 Salami, Oworonshoki, Lagos State",
      phone: "08169875198"
    },
    {
      name: "UAE (Geocoding Fallback)",
      address: "58 20A Street, Al Badaa, Dubai",
      phone: "0551994544"
    },
    {
      name: "UK (Address Validation Supported)",
      address: "10 Downing Street, London",
      phone: "07700 900077"
    },
    {
      name: "US (Address Validation Supported)",
      address: "1600 Amphitheatre Parkway, Mountain View, CA",
      phone: "650-253-0000"
    },
    {
      name: "Ambiguous Address",
      address: "Lagos",
      phone: "08169875198"
    },
    {
      name: "Country Conflict",
      address: "53 Salami, Oworonshoki, Lagos State",
      phone: "+447700900077" // UK number for NG delivery
    }
  ];

  for (const tc of testCases) {
    console.log(`\n======================================`);
    console.log(`TEST CASE: ${tc.name}`);
    console.log(`======================================`);

    console.log(`[Address Phase]`);
    console.log(`Raw Address: ${tc.address}`);
    
    const locCtx = await resolveLocation(tc.address);
    console.log(`Normalized Address: ${locCtx.normalizedAddress}`);
    console.log(`Country: ${locCtx.countryName} (${locCtx.countryCode})`);
    console.log(`Calling Code: ${locCtx.callingCode}`);
    console.log(`Locality/State: ${locCtx.locality} / ${locCtx.administrativeArea}`);
    console.log(`Lat/Lng: ${locCtx.latitude}, ${locCtx.longitude}`);
    console.log(`Validation Provider: ${locCtx.validationProvider}`);
    console.log(`Confidence: ${locCtx.confidence}`);
    console.log(`Status: ${locCtx.validationStatus}`);

    console.log(`\n[Phone Phase]`);
    console.log(`Raw Phone: ${tc.phone}`);
    const phoneCtx = parsePhone(tc.phone, locCtx);
    
    console.log(`Candidate Normalized Phone: ${phoneCtx.normalizedPhone || 'N/A'}`);
    console.log(`Possible: ${phoneCtx.isPossible}`);
    console.log(`Valid: ${phoneCtx.isValid}`);
    console.log(`Resolution: ${phoneCtx.resolution}`);
  }
}

runTests().catch(console.error);
