import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber';
import { LocationContext, PhoneContext } from '@/lib/db/commerce-orders';

const phoneUtil = PhoneNumberUtil.getInstance();

export async function resolveLocation(rawInput: string | object): Promise<LocationContext> {
  const rawAddress = typeof rawInput === 'object' ? 
    Object.values(rawInput).filter(v => typeof v === 'string' && v.trim() !== '').join(', ') : 
    String(rawInput).trim();

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("[LocationResolver] GOOGLE_MAPS_API_KEY is not set. Returning unverified.");
    return {
      rawAddress,
      confidence: "low",
      validationStatus: "unverified"
    };
  }

  try {
    // 1. Google Geocoding API (Global Fallback)
    const geocodeUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    geocodeUrl.searchParams.set('address', rawAddress);
    geocodeUrl.searchParams.set('key', apiKey);

    const geoRes = await fetch(geocodeUrl.toString());
    const geoData = await geoRes.json();

    if (geoData.status !== 'OK' || geoData.results.length === 0) {
      return {
        rawAddress,
        confidence: "low",
        validationStatus: "needs_clarification",
        validationProvider: "google_geocoding"
      };
    }

    const result = geoData.results[0];
    const components = result.address_components || [];
    
    let countryCode = '';
    let countryName = '';
    let locality = '';
    let administrativeArea = '';
    let postalCode = '';

    for (const comp of components) {
      if (comp.types.includes('country')) {
        countryCode = comp.short_name;
        countryName = comp.long_name;
      }
      if (comp.types.includes('locality') || comp.types.includes('postal_town')) {
        locality = comp.long_name;
      }
      if (comp.types.includes('administrative_area_level_1')) {
        administrativeArea = comp.long_name;
      }
      if (comp.types.includes('postal_code')) {
        postalCode = comp.long_name;
      }
    }

    const isPrecise = result.geometry?.location_type === 'ROOFTOP' || result.geometry?.location_type === 'RANGE_INTERPOLATED';
    const hasStreet = components.some((c: any) => c.types.includes('route'));
    
    let confidence: "high" | "medium" | "low" = isPrecise && hasStreet ? "high" : (hasStreet ? "medium" : "low");
    let validationStatus: "verified" | "partially_verified" | "needs_clarification" | "unverified" = 
      isPrecise ? "verified" : (hasStreet ? "partially_verified" : "needs_clarification");

    const baseContext: LocationContext = {
      rawAddress,
      normalizedAddress: result.formatted_address,
      countryCode,
      countryName,
      callingCode: getCallingCodeForCountry(countryCode),
      locality,
      administrativeArea,
      postalCode,
      latitude: result.geometry?.location?.lat,
      longitude: result.geometry?.location?.lng,
      placeId: result.place_id,
      confidence,
      validationStatus,
      validationProvider: "google_geocoding"
    };

    // 2. Address Validation API Enhancement
    try {
      const avRes = await fetch(`https://addressvalidation.googleapis.com/v1:validateAddress?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: {
            regionCode: countryCode || undefined,
            addressLines: [rawAddress]
          }
        })
      });

      if (avRes.ok) {
        const avData = await avRes.json();
        if (avData.result) {
          const avConf = avData.result.verdict?.addressComplete ? "high" : "medium";
          baseContext.normalizedAddress = avData.result.address?.formattedAddress || baseContext.normalizedAddress;
          baseContext.confidence = avConf === "high" ? "high" : baseContext.confidence;
          baseContext.validationStatus = avData.result.verdict?.hasUnconfirmedComponents ? "needs_clarification" : "verified";
          baseContext.validationProvider = "combined";
        }
      }
    } catch (e) {
      console.log(`[LocationResolver] Address Validation skipped/failed for ${countryCode}`);
    }

    return baseContext;

  } catch (error) {
    console.error("[LocationResolver] Error resolving location:", error);
    return {
      rawAddress,
      confidence: "low",
      validationStatus: "unverified"
    };
  }
}

export function parsePhone(rawPhone: string, locationContext?: LocationContext): PhoneContext {
  const stripped = rawPhone.replace(/[\s\-()]/g, "");
  const region = locationContext?.countryCode || 'US'; // default to US if unknown

  try {
    const number = phoneUtil.parseAndKeepRawInput(rawPhone, region);
    const isPossible = phoneUtil.isPossibleNumber(number);
    const isValid = phoneUtil.isValidNumber(number);
    const formatted = phoneUtil.format(number, PhoneNumberFormat.E164);
    const parsedRegion = phoneUtil.getRegionCodeForNumber(number);
    const callingCode = number.getCountryCode()?.toString();

    let resolution: PhoneContext['resolution'] = "inferred";
    
    if (parsedRegion && locationContext?.countryCode && parsedRegion !== locationContext.countryCode) {
      resolution = "country_conflict";
    } else if (isValid) {
      resolution = "needs_clarification"; // We map this to asking the user to confirm the number
    } else {
      resolution = "invalid";
    }

    return {
      rawPhone,
      normalizedPhone: formatted,
      countryCode: parsedRegion,
      callingCode: callingCode ? `+${callingCode}` : undefined,
      isPossible,
      isValid,
      resolution
    };

  } catch (error) {
    if (stripped.startsWith('+') && stripped.length > 8) {
      return {
        rawPhone,
        normalizedPhone: stripped,
        isPossible: true,
        isValid: false,
        resolution: "needs_clarification" 
      };
    }

    return {
      rawPhone,
      isPossible: false,
      isValid: false,
      resolution: "invalid"
    };
  }
}

function getCallingCodeForCountry(countryCode: string): string | undefined {
  if (!countryCode) return undefined;
  try {
    const code = phoneUtil.getCountryCodeForRegion(countryCode.toUpperCase());
    return code ? `+${code}` : undefined;
  } catch {
    return undefined;
  }
}
