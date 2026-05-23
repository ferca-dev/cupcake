import { MERCADOPAGO_PUBLIC_KEY } from '../config/env.js';

const SCRIPT_URL = 'https://sdk.mercadopago.com/js/v2';
let loaderPromise = null;

/**
 * Lazily injects the official MercadoPago.js v2 script tag and returns a
 * configured `MercadoPago` instance keyed by the configured public key. The
 * SDK exposes Bricks (Wallet, Card Payment, …) that we use to render the
 * Checkout Pro entry point without redirecting away from the app.
 *
 * Returns `null` when `VITE_MERCADOPAGO_PUBLIC_KEY` is empty so callers can
 * gracefully fall back to the redirect-only flow.
 */
export const loadMercadoPagoSdk = () => {
  if (!MERCADOPAGO_PUBLIC_KEY) return Promise.resolve(null);
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('MercadoPago.js can only be loaded in the browser'));
      return;
    }
    if (window.MercadoPago) {
      resolve(new window.MercadoPago(MERCADOPAGO_PUBLIC_KEY, { locale: 'en' }));
      return;
    }
    const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`);
    const onReady = () => {
      if (!window.MercadoPago) {
        reject(new Error('MercadoPago.js loaded without exposing window.MercadoPago'));
        return;
      }
      resolve(new window.MercadoPago(MERCADOPAGO_PUBLIC_KEY, { locale: 'en' }));
    };
    if (existing) {
      existing.addEventListener('load', onReady, { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load MercadoPago.js')));
      return;
    }
    const tag = document.createElement('script');
    tag.src = SCRIPT_URL;
    tag.async = true;
    tag.addEventListener('load', onReady, { once: true });
    tag.addEventListener('error', () => reject(new Error('Failed to load MercadoPago.js')));
    document.head.appendChild(tag);
  });
  return loaderPromise;
};

export const resetMercadoPagoLoaderForTesting = () => {
  loaderPromise = null;
};
