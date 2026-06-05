/**
 * V163 — Google Places Autocomplete (substitui Mapbox só no autocomplete de endereços).
 */

import { API_KEYS, SEARCH_COUNTRIES } from "./apiConfig.js";
import { waitForGoogleMaps } from "./googleMapsLoader.js";

let placesDetailsService = null;

/**
 * Aguarda o script do Google Maps (index.html) e a biblioteca `places`.
 */
export async function waitForGooglePlaces(timeoutMs = 15000) {
  await waitForGoogleMaps(timeoutMs);
  if (!window.google?.maps?.places) {
    throw new Error("Google Places não carregou. Verifique VITE_GOOGLE_MAPS_KEY.");
  }
  ensurePlacesDetailsService();
}

function ensurePlacesDetailsService() {
  if (!placesDetailsService && window.google?.maps?.places) {
    placesDetailsService = new window.google.maps.places.PlacesService(
      document.createElement("div")
    );
  }
}

/**
 * @param {string} query
 * @param {[number, number] | null} proximityLngLat [lng, lat]
 * @returns {Promise<Array<{ label: string, placeId: string, coords: null }>>}
 */
export async function fetchGooglePlacePredictions(query, proximityLngLat = null) {
  if (!API_KEYS.googleMaps) return [];

  await waitForGooglePlaces();
  const autocomplete = new window.google.maps.places.AutocompleteService();

  /** @type {google.maps.places.AutocompletionRequest} */
  const request = {
    input: query,
    componentRestrictions: { country: SEARCH_COUNTRIES },
    language: "pt-BR",
  };

  if (proximityLngLat) {
    const [lng, lat] = proximityLngLat;
    request.location = new window.google.maps.LatLng(lat, lng);
    request.radius = 50000;
  }

  return new Promise((resolve) => {
    autocomplete.getPlacePredictions(request, (predictions, status) => {
      if (
        status !== window.google.maps.places.PlacesServiceStatus.OK ||
        !predictions?.length
      ) {
        resolve([]);
        return;
      }
      resolve(
        predictions.slice(0, 6).map((p) => ({
          label: p.description,
          placeId: p.place_id,
          coords: null,
        }))
      );
    });
  });
}

/**
 * @param {string} placeId
 * @returns {Promise<{ label: string, coords: [number, number] } | null>}
 */
export async function fetchGooglePlaceDetails(placeId) {
  if (!placeId || !API_KEYS.googleMaps) return null;

  await waitForGooglePlaces();
  ensurePlacesDetailsService();

  return new Promise((resolve) => {
    placesDetailsService.getDetails(
      { placeId, fields: ["geometry", "formatted_address"] },
      (place, status) => {
        if (
          status !== window.google.maps.places.PlacesServiceStatus.OK ||
          !place?.geometry?.location
        ) {
          resolve(null);
          return;
        }
        const loc = place.geometry.location;
        resolve({
          label: place.formatted_address || "",
          coords: [loc.lng(), loc.lat()],
        });
      }
    );
  });
}

/**
 * Resolve coordenadas de uma sugestão (Google place_id → lat/lng).
 * @param {{ label?: string, placeId?: string, coords?: number[] }} suggestion
 */
export async function resolvePlaceSuggestion(suggestion) {
  if (!suggestion) return suggestion;
  if (suggestion.coords?.length >= 2) return suggestion;
  if (!suggestion.placeId) return suggestion;

  const details = await fetchGooglePlaceDetails(suggestion.placeId);
  if (!details) return suggestion;

  return {
    ...suggestion,
    label: details.label || suggestion.label,
    coords: details.coords,
  };
}
