/**
 * Google Geocoding API (Geocoder JS) — substitui Mapbox no romaneio e Waze.
 */

import { API_KEYS } from "./apiConfig.js";
import { waitForGoogleMaps } from "./googleMapsLoader.js";

/** Mensagem exibida quando o Geocoder/Places devolve só país/UF/cidade. */
export const GEOCODE_TOO_GENERIC_MSG =
  "Endereço muito genérico. Adicione rua e número (ex.: Rua das Flores, 100 - Centro).";

/** Tipos com precisão suficiente para entrega. */
const SPECIFIC_GEOCODE_TYPES = new Set([
  "street_address",
  "street_number",
  "route",
  "premise",
  "subpremise",
  "intersection",
  "plus_code",
  "establishment",
  "point_of_interest",
]);

/** Tipos genéricos demais sozinhos (sem rua/número). */
const GENERIC_GEOCODE_TYPES = new Set([
  "country",
  "continent",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "locality",
  "postal_town",
  "sublocality",
  "sublocality_level_1",
  "neighborhood",
  "colloquial_area",
  "political",
]);

/**
 * True se o resultado do Google é só país/UF/cidade (sem rua/número/prédio).
 * @param {string[]|undefined|null} types
 */
export function isGeocodeTypesTooGeneric(types) {
  const list = Array.isArray(types)
    ? types.map((t) => String(t || "").trim()).filter(Boolean)
    : [];
  if (!list.length) return false;
  if (list.some((t) => SPECIFIC_GEOCODE_TYPES.has(t))) return false;
  return list.some((t) => GENERIC_GEOCODE_TYPES.has(t));
}

/**
 * @param {string} address
 * @param {{ biasLngLat?: [number, number] | null }} [options]
 * @returns {Promise<{ lat: number, lng: number, formattedAddress: string, types: string[], tooGeneric: boolean } | null>}
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
        const top = results[0];
        const loc = top.geometry.location;
        const types = Array.isArray(top.types) ? top.types : [];
        resolve({
          lat: loc.lat(),
          lng: loc.lng(),
          formattedAddress: top.formatted_address || text,
          types,
          tooGeneric: isGeocodeTypesTooGeneric(types),
        });
      });
    });
  } catch {
    return null;
  }
}

/**
 * Reverse geocode (lat/lng → endereço legível).
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{ lat: number, lng: number, formattedAddress: string } | null>}
 */
export async function reverseGeocodeGoogle(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !API_KEYS.googleMaps) return null;

  try {
    await waitForGoogleMaps();
    const geocoder = new window.google.maps.Geocoder();

    return new Promise((resolve) => {
      geocoder.geocode(
        { location: { lat, lng }, language: "pt-BR" },
        (results, status) => {
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
            formattedAddress: results[0].formatted_address || `${lat}, ${lng}`,
          });
        }
      );
    });
  } catch {
    return null;
  }
}
