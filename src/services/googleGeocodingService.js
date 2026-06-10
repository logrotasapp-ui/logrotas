/**
 * Google Geocoding API (Geocoder JS) — substitui Mapbox no romaneio e Waze.
 */

import { API_KEYS } from "./apiConfig.js";
import { waitForGoogleMaps } from "./googleMapsLoader.js";

/**
 * @param {string} address
 * @param {{ biasLngLat?: [number, number] | null }} [options]
 * @returns {Promise<{ lat: number, lng: number, formattedAddress: string } | null>}
 */
export async function geocodeAddressGoogle(address, options = {}) {
  const text = String(address || "").trim();
  if (!text || !API_KEYS.googleMaps) return null;

  try {
    await waitForGoogleMaps();
    const geocoder = new window.google.maps.Geocoder();
    const { biasLngLat = null } = options;

    /** @type {google.maps.GeocoderRequest} */
    const request = {
      address: text,
      componentRestrictions: { country: "br" },
      region: "br",
      language: "pt-BR",
    };

    if (biasLngLat?.length >= 2) {
      const [lng, lat] = biasLngLat;
      request.bounds = new window.google.maps.LatLngBounds(
        new window.google.maps.LatLng(lat - 0.45, lng - 0.45),
        new window.google.maps.LatLng(lat + 0.45, lng + 0.45)
      );
    }

    return new Promise((resolve) => {
      geocoder.geocode(request, (results, status) => {
        if (
          status !== window.google.maps.GeocoderStatus.OK ||
          !results?.[0]?.geometry?.location
        ) {
          resolve(null);
          return;
        }
        const loc = results[0].geometry.location;
        resolve({
          lat: loc.lat(),
          lng: loc.lng(),
          formattedAddress: results[0].formatted_address || text,
        });
      });
    });
  } catch {
    return null;
  }
}
