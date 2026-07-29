import React from 'react';
import CountryFlag from '@/components/CountryFlag';

/**
 * Utility for currency mapping and formatting based on country codes.
 */

export const COUNTRY_CURRENCY_MAP: Record<string, string> = {
    'US': 'USD',
    'IN': 'INR',
    'GB': 'GBP',
    'CA': 'CAD',
    'AU': 'AUD',
    'DE': 'EUR',
    'FR': 'EUR',
    'ES': 'EUR',
    'IT': 'EUR',
    'NL': 'EUR',
    'JP': 'JPY',
    'SG': 'SGD',
    'PH': 'PHP',
    'NZ': 'NZD',
    'BR': 'BRL',
    'MX': 'MXN',
};

export const COUNTRY_SYMBOL_MAP: Record<string, string> = {
    'US': '$',
    'IN': '₹',
    'GB': '£',
    'CA': '$',
    'AU': '$',
    'DE': '€',
    'FR': '€',
    'ES': '€',
    'IT': '€',
    'NL': '€',
    'JP': '¥',
    'SG': 'S$',
    'PH': '₱',
    'NZ': 'NZ$',
    'BR': 'R$',
    'MX': '$',
};

export const COUNTRY_FLAG_MAP: Record<string, string> = {
    'US': '🇺🇸',
    'IN': '🇮🇳',
    'GB': '🇬🇧',
    'CA': '🇨🇦',
    'AU': '🇦🇺',
    'DE': '🇩🇪',
    'FR': '🇫🇷',
    'ES': '🇪🇸',
    'IT': '🇮🇹',
    'NL': '🇳🇱',
    'JP': '🇯🇵',
    'SG': '🇸🇬',
    'PH': '🇵🇭',
    'NZ': '🇳🇿',
    'BR': '🇧🇷',
    'MX': '🇲🇽',
};

export const COUNTRY_OPTIONS = [
    { value: 'US', label: <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CountryFlag code="US" size={16} /><span>United States (US)</span></div>, text: 'United States (US)' },
    { value: 'IN', label: <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CountryFlag code="IN" size={16} /><span>India (IN)</span></div>, text: 'India (IN)' },
    { value: 'GB', label: <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CountryFlag code="GB" size={16} /><span>United Kingdom (UK)</span></div>, text: 'United Kingdom (UK)' },
    { value: 'CA', label: <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CountryFlag code="CA" size={16} /><span>Canada (CA)</span></div>, text: 'Canada (CA)' },
    { value: 'AU', label: <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CountryFlag code="AU" size={16} /><span>Australia (AU)</span></div>, text: 'Australia (AU)' },
    { value: 'DE', label: <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CountryFlag code="DE" size={16} /><span>Germany (DE)</span></div>, text: 'Germany (DE)' },
    { value: 'FR', label: <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CountryFlag code="FR" size={16} /><span>France (FR)</span></div>, text: 'France (FR)' },
    { value: 'ES', label: <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CountryFlag code="ES" size={16} /><span>Spain (ES)</span></div>, text: 'Spain (ES)' },
    { value: 'IT', label: <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CountryFlag code="IT" size={16} /><span>Italy (IT)</span></div>, text: 'Italy (IT)' },
    { value: 'NL', label: <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CountryFlag code="NL" size={16} /><span>Netherlands (NL)</span></div>, text: 'Netherlands (NL)' },
    { value: 'JP', label: <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CountryFlag code="JP" size={16} /><span>Japan (JP)</span></div>, text: 'Japan (JP)' },
    { value: 'SG', label: <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CountryFlag code="SG" size={16} /><span>Singapore (SG)</span></div>, text: 'Singapore (SG)' },
    { value: 'PH', label: <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CountryFlag code="PH" size={16} /><span>Philippines (PH)</span></div>, text: 'Philippines (PH)' },
    { value: 'NZ', label: <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CountryFlag code="NZ" size={16} /><span>New Zealand (NZ)</span></div>, text: 'New Zealand (NZ)' },
    { value: 'BR', label: <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CountryFlag code="BR" size={16} /><span>Brazil (BR)</span></div>, text: 'Brazil (BR)' },
    { value: 'MX', label: <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CountryFlag code="MX" size={16} /><span>Mexico (MX)</span></div>, text: 'Mexico (MX)' },
];

/**
 * Formats a number as a localized currency string.
 * @param amount The numerical value to format.
 * @param countryCode The ISO 3166-1 alpha-2 country code (e.g., 'US', 'IN').
 */
export const formatCurrency = (amount: number, countryCode: string = 'US'): string => {
    const currency = COUNTRY_CURRENCY_MAP[countryCode] || 'USD';

    // Map country code to preferred locale for numbering style
    const localeMap: Record<string, string> = {
        'IN': 'en-IN',
        'US': 'en-US',
        'GB': 'en-GB',
        'CA': 'en-CA',
        'AU': 'en-AU',
        'DE': 'de-DE',
        'FR': 'fr-FR',
        'ES': 'es-ES',
        'IT': 'it-IT',
        'NL': 'nl-NL',
        'JP': 'ja-JP',
        'SG': 'en-SG',
        'PH': 'en-PH',
        'NZ': 'en-NZ',
        'BR': 'pt-BR',
        'MX': 'es-MX',
    };

    const locale = localeMap[countryCode] || 'en-US';

    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
};

/**
 * Gets the currency symbol for a country code.
 */
export const getCurrencySymbol = (countryCode: string = 'US'): string => {
    return COUNTRY_SYMBOL_MAP[countryCode] || '$';
};
