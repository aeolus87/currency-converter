import React, { useState, useEffect } from "react";

type Currency = {
  code: string;
  name: string;
  symbol?: string;
};

type ExchangeRates = {
  [key: string]: number;
};

type CurrencyAPIRatesResponse = {
  meta: { last_updated_at: string };
  data: { [key: string]: { code: string; value: number } };
};

type CurrencyAPICurrenciesResponse = {
  data: {
    [key: string]: {
      code: string;
      name: string;
      symbol?: string;
      symbol_native?: string;
    };
  };
};

// Cache types with multiple base currencies
type RatesCache = {
  [baseCurrency: string]: {
    rates: ExchangeRates;
    lastUpdated: string;
    timestamp: number;
  };
};

type CurrenciesCache = {
  currencies: Currency[];
  timestamp: number;
};

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const RATES_CACHE_KEY = "currency_rates_cache";
const CURRENCIES_CACHE_KEY = "currencies_cache";

const CurrencyConverter: React.FC = () => {
  const [amount, setAmount] = useState<number | string>("");
  const [fromCurrency, setFromCurrency] = useState<string>("USD");
  const [toCurrency, setToCurrency] = useState<string>("EUR");
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);
  const [exchangeRates, setExchangeRates] = useState<{
    [base: string]: ExchangeRates;
  }>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<{ [base: string]: string }>(
    {}
  );
  const [error, setError] = useState<string | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [isCurrenciesLoading, setIsCurrenciesLoading] = useState<boolean>(true);
  const [swapAnimation, setSwapAnimation] = useState<boolean>(false);

  const API_KEY = import.meta.env.VITE_CURRENCY_API_KEY;

  // Get cached data utilities
  const getCachedCurrencies = (): CurrenciesCache | null => {
    const cached = localStorage.getItem(CURRENCIES_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  };

  const setCachedCurrencies = (currencies: Currency[]) => {
    localStorage.setItem(
      CURRENCIES_CACHE_KEY,
      JSON.stringify({ currencies, timestamp: Date.now() })
    );
  };

  const getCachedRates = (): RatesCache | null => {
    const cached = localStorage.getItem(RATES_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  };

  const setCachedRates = (
    baseCurrency: string,
    rates: ExchangeRates,
    lastUpdated: string
  ) => {
    const cachedRates = getCachedRates() || {};
    cachedRates[baseCurrency] = {
      rates,
      lastUpdated,
      timestamp: Date.now(),
    };
    localStorage.setItem(RATES_CACHE_KEY, JSON.stringify(cachedRates));
  };

  // Fetch currencies list only once
  const fetchCurrencies = async () => {
    try {
      // Check cache first
      const cachedData = getCachedCurrencies();
      if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
        setCurrencies(cachedData.currencies);
        setIsCurrenciesLoading(false);
        return;
      }

      setIsCurrenciesLoading(true);
      const response = await fetch(
        `https://api.currencyapi.com/v3/currencies?apikey=${API_KEY}`
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: CurrencyAPICurrenciesResponse = await response.json();
      const currencyList: Currency[] = Object.keys(data.data).map((key) => ({
        code: data.data[key].code,
        name: data.data[key].name,
        symbol: data.data[key].symbol || data.data[key].symbol_native,
      }));

      currencyList.sort((a, b) => a.code.localeCompare(b.code));
      setCurrencies(currencyList);
      setCachedCurrencies(currencyList);
      setIsCurrenciesLoading(false);
    } catch (err) {
      console.error("Error fetching currencies:", err);
      setError("Failed to fetch currencies. Using fallback list.");
      setIsCurrenciesLoading(false);

      // Fallback currencies
      const fallbackCurrencies = [
        { code: "USD", name: "US Dollar", symbol: "$" },
        { code: "EUR", name: "Euro", symbol: "€" },
        { code: "GBP", name: "British Pound", symbol: "£" },
        { code: "JPY", name: "Japanese Yen", symbol: "¥" },
        { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
      ];

      setCurrencies(fallbackCurrencies);
      setCachedCurrencies(fallbackCurrencies);
    }
  };

  // Fetch fresh exchange rates from API
  const fetchExchangeRates = async (base: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `https://api.currencyapi.com/v3/latest?apikey=${API_KEY}&base_currency=${base}`
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: CurrencyAPIRatesResponse = await response.json();
      const rates: ExchangeRates = {};
      Object.keys(data.data).forEach((currencyCode) => {
        rates[currencyCode] = data.data[currencyCode].value;
      });

      const formattedDate = new Date(
        data.meta.last_updated_at
      ).toLocaleString();

      // Update state with new rates
      setExchangeRates((prev) => ({
        ...prev,
        [base]: rates,
      }));

      setLastUpdated((prev) => ({
        ...prev,
        [base]: formattedDate,
      }));

      // Cache the new rates
      setCachedRates(base, rates, formattedDate);
      setIsLoading(false);
    } catch (err) {
      console.error("Error fetching rates:", err);
      setError("Failed to fetch exchange rates. Check API key or try again.");
      setIsLoading(false);
    }
  };

  // Load exchange rates with improved caching strategy
  const loadExchangeRates = async (base: string, forceReload = false) => {
    // Check if we already have these rates in memory
    if (!forceReload && exchangeRates[base]) {
      return; // Use rates we already have
    }

    // Check cache if not forcing reload
    if (!forceReload) {
      const cachedData = getCachedRates();
      if (
        cachedData &&
        cachedData[base] &&
        Date.now() - cachedData[base].timestamp < CACHE_DURATION
      ) {
        // Use cached data for this base currency
        setExchangeRates((prev) => ({
          ...prev,
          [base]: cachedData[base].rates,
        }));
        setLastUpdated((prev) => ({
          ...prev,
          [base]: cachedData[base].lastUpdated,
        }));
        setIsLoading(false);
        return;
      }
    }

    // If we reach here, we need to fetch fresh data
    await fetchExchangeRates(base);
  };

  // Initial loads
  useEffect(() => {
    fetchCurrencies();
    loadExchangeRates("USD", false); // Load USD rates by default
  }, []);

  // Calculate converted amount when values change
  useEffect(() => {
    if (
      amount !== "" &&
      exchangeRates[fromCurrency] &&
      toCurrency &&
      fromCurrency
    ) {
      const numAmount =
        typeof amount === "string" ? parseFloat(amount) : amount;
      const rates = exchangeRates[fromCurrency];

      if (!rates) {
        loadExchangeRates(fromCurrency, false);
        return;
      }

      if (toCurrency === fromCurrency) {
        setConvertedAmount(numAmount);
      } else if (rates[toCurrency]) {
        setConvertedAmount(numAmount * rates[toCurrency]);
      } else {
        setConvertedAmount(null);
      }
    } else {
      setConvertedAmount(null);
    }
  }, [amount, exchangeRates, fromCurrency, toCurrency]);

  // Input validation for amount
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "") {
      setAmount("");
      return;
    }

    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      setAmount(value);
    }
  };

  // Handle from currency change
  const handleFromCurrencyChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const newCurrency = e.target.value;
    setFromCurrency(newCurrency);

    // Load rates if we don't have them
    if (!exchangeRates[newCurrency]) {
      loadExchangeRates(newCurrency, false);
    }
  };

  // Refresh rates for current currency
  const handleRefreshRates = () => {
    if (fromCurrency) {
      loadExchangeRates(fromCurrency, true);
    }
  };

  // Swap currencies
  const handleSwapCurrencies = () => {
    setSwapAnimation(true);
    setTimeout(() => {
      const temp = fromCurrency;
      setFromCurrency(toCurrency);
      setToCurrency(temp);

      // Load rates if needed
      if (!exchangeRates[toCurrency]) {
        loadExchangeRates(toCurrency, false);
      }
      setSwapAnimation(false);
    }, 300);
  };

  // Check if using cached data
  const isUsingCachedData = () => {
    const cachedData = getCachedRates();
    return (
      cachedData &&
      cachedData[fromCurrency] &&
      Date.now() - cachedData[fromCurrency].timestamp < CACHE_DURATION
    );
  };

  // Get exchange rate between current currencies
  const getExchangeRate = () => {
    if (fromCurrency === toCurrency) {
      return 1;
    }

    const rates = exchangeRates[fromCurrency];
    return rates ? rates[toCurrency] : null;
  };

  const exchangeRate = getExchangeRate();
  const currentLastUpdated = lastUpdated[fromCurrency] || "Loading...";

  return (
    <div className="max-w-md mx-auto bg-gray-50 rounded-xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gray-800 text-white p-5">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Currency Converter</h1>
          <button
            type="button"
            onClick={handleRefreshRates}
            className="px-3 py-1 text-sm bg-gray-700 rounded-full hover:bg-gray-600 transition-colors flex items-center"
            disabled={isLoading}
            title="Refresh rates"
          >
            <span className={`mr-1 ${isLoading ? "animate-spin" : ""}`}>↻</span>
            {isLoading ? "Loading" : "Refresh"}
          </button>
        </div>
        <p className="text-gray-400 text-sm mt-1">
          {isUsingCachedData() ? "Using cached rates" : "Using live rates"}
        </p>
      </div>

      {/* Main content */}
      <div className="p-6">
        {error && (
          <div className="mb-5 p-3 bg-gray-100 border-l-4 border-gray-800 text-gray-700 rounded">
            <div className="font-bold">Error</div>
            <div>{error}</div>
          </div>
        )}

        {/* Amount input */}
        <div className="mb-5">
          <label
            htmlFor="amount"
            className="block text-sm font-medium text-gray-600 mb-2"
          >
            Amount
          </label>
          <div className="relative rounded-md shadow-sm">
            <input
              id="amount"
              type="number"
              value={amount}
              onChange={handleAmountChange}
              className="w-full p-4 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent text-xl"
              min="0"
              step="any"
              placeholder="0"
            />
          </div>
        </div>

        {/* Currency selectors */}
        <div className="relative mb-5">
          <div className="grid grid-cols-5 gap-2">
            <div className="col-span-2">
              <label
                htmlFor="fromCurrency"
                className="block text-sm font-medium text-gray-600 mb-2"
              >
                From
              </label>
              <select
                id="fromCurrency"
                value={fromCurrency}
                onChange={handleFromCurrencyChange}
                className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                disabled={isCurrenciesLoading}
              >
                {isCurrenciesLoading ? (
                  <option>Loading...</option>
                ) : (
                  currencies.map((currency) => (
                    <option key={`from-${currency.code}`} value={currency.code}>
                      {currency.code} - {currency.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Swap button */}
            <div className="flex items-center justify-center">
              <button
                onClick={handleSwapCurrencies}
                className={`w-10 h-10 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded-full transition-transform ${
                  swapAnimation ? "rotate-180" : ""
                }`}
                title="Swap currencies"
              >
                ⇄
              </button>
            </div>

            <div className="col-span-2">
              <label
                htmlFor="toCurrency"
                className="block text-sm font-medium text-gray-600 mb-2"
              >
                To
              </label>
              <select
                id="toCurrency"
                value={toCurrency}
                onChange={(e) => setToCurrency(e.target.value)}
                className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                disabled={isCurrenciesLoading}
              >
                {isCurrenciesLoading ? (
                  <option>Loading...</option>
                ) : (
                  currencies.map((currency) => (
                    <option key={`to-${currency.code}`} value={currency.code}>
                      {currency.code} - {currency.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>

        {/* Result area */}
        {convertedAmount !== null && amount !== "" ? (
          <div className="mt-5 p-5 bg-gray-100 rounded-lg border-l-4 border-gray-800">
            <div className="text-lg text-gray-600">
              {Number(amount).toLocaleString()} {fromCurrency} =
            </div>
            <div className="text-3xl font-bold text-gray-800 my-2">
              {convertedAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4,
              })}{" "}
              {toCurrency}
            </div>
            <div className="flex justify-between items-center mt-3 text-sm text-gray-500">
              <div>
                1 {fromCurrency} = {exchangeRate?.toFixed(4) || "..."}{" "}
                {toCurrency}
              </div>
              <div>
                1 {toCurrency} ={" "}
                {exchangeRate ? (1 / exchangeRate).toFixed(4) : "..."}{" "}
                {fromCurrency}
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between items-center">
              <div className="text-xs text-gray-500">
                Last updated: {currentLastUpdated}
              </div>
              <div
                className={`text-xs px-2 py-1 rounded-full ${
                  isUsingCachedData()
                    ? "bg-gray-200 text-gray-700"
                    : "bg-gray-700 text-white"
                }`}
              >
                {isUsingCachedData() ? "Cached" : "Live"}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 p-5 bg-gray-100 rounded-lg text-center text-gray-500">
            Enter an amount to see the conversion
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-200 p-3 text-center text-xs text-gray-500">
        Data provided by Currency API • Using exchange rates from{" "}
        {currentLastUpdated}
      </div>
    </div>
  );
};

function App() {
  return (
    <div className="min-h-screen bg-gray-200 flex items-center justify-center p-4">
      <CurrencyConverter />
    </div>
  );
}

export default App;
