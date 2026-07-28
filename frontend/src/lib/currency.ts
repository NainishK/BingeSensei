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
    { value: 'US', label: '🇺🇸 United States (US)' },
    { value: 'IN', label: '🇮🇳 India (IN)' },
    { value: 'GB', label: '🇬🇧 United Kingdom (UK)' },
    { value: 'CA', label: '🇨🇦 Canada (CA)' },
    { value: 'AU', label: '🇦🇺 Australia (AU)' },
    { value: 'DE', label: '🇩🇪 Germany (DE)' },
    { value: 'FR', label: '🇫🇷 France (FR)' },
    { value: 'ES', label: '🇪🇸 Spain (ES)' },
    { value: 'IT', label: '🇮🇹 Italy (IT)' },
    { value: 'NL', label: '🇳🇱 Netherlands (NL)' },
    { value: 'JP', label: '🇯🇵 Japan (JP)' },
    { value: 'SG', label: '🇸🇬 Singapore (SG)' },
    { value: 'PH', label: '🇵🇭 Philippines (PH)' },
    { value: 'NZ', label: '🇳🇿 New Zealand (NZ)' },
    { value: 'BR', label: '🇧🇷 Brazil (BR)' },
    { value: 'MX', label: '🇲🇽 Mexico (MX)' },
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
