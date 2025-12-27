import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw } from 'lucide-react';

export default function InvestmentDashboard() {
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // 1. Fetch all transactions
      const transactions = await invoke('get_all_transactions');
      
      // 2. Calculate holdings
      const holdingMap = {};
      
      transactions.forEach(tx => {
        if (tx.ticker && tx.shares) {
          if (!holdingMap[tx.ticker]) {
            holdingMap[tx.ticker] = {
              ticker: tx.ticker,
              shares: 0,
              costBasis: 0,
            };
          }
          holdingMap[tx.ticker].shares += tx.shares;
          // Simplified cost basis: Add amount if it's a buy (positive shares in brokerage logic usually means buy, but let's check logic)
          // In the rust code: Buy -> brokerage_shares = shares. Sell -> brokerage_shares = -shares.
          // Amount: Buy -> +Value. Sell -> -Value.
          // This amount logic in Rust seems to track "Account Balance" not "Cost Basis".
          // For Cost Basis, we should track the money spent to acquire the CURRENT shares.
          // This is complex with partial sells.
          // Let's use a simplified Average Cost approach if possible, or just Total Cost for now.
          // If we assume FIFO or Average Cost, we need more logic.
          // For this dashboard, let's just track "Net Invested" (Sum of Buys - Sum of Sells) for simplicity, 
          // or just focus on Current Value if Cost Basis is too hard.
          // User asked for "colored with the return on investment". So we need ROI.
          // ROI = (Current Value - Cost Basis) / Cost Basis.
          // Let's try to estimate Cost Basis: Sum of (Buy Price * Shares) - Sum of (Sell Price * Shares).
          // This is "Net Cost". If I sold for profit, my net cost goes down.
          
          if (tx.shares > 0) { // Buy
             holdingMap[tx.ticker].costBasis += (tx.price_per_share || 0) * tx.shares + (tx.commission || 0);
          } else { // Sell
             // Reduce cost basis proportionally? Or just subtract proceeds?
             // Subtracting proceeds is "Net Invested".
             holdingMap[tx.ticker].costBasis -= (tx.price_per_share || 0) * Math.abs(tx.shares) - (tx.commission || 0);
          }
        }
      });

      const currentHoldings = Object.values(holdingMap).filter(h => h.shares > 0.0001);
      
      if (currentHoldings.length === 0) {
        setHoldings([]);
        setLoading(false);
        return;
      }

      // 3. Fetch quotes
      const tickers = currentHoldings.map(h => h.ticker);
      const quotes = await invoke('get_stock_quotes', { tickers });
      
      // 4. Merge data
      const finalHoldings = currentHoldings.map(h => {
        const quote = quotes.find(q => q.symbol === h.ticker);
        const price = quote ? quote.regularMarketPrice : 0;
        const currentValue = h.shares * price;
        const roi = h.costBasis > 0 ? ((currentValue - h.costBasis) / h.costBasis) * 100 : 0;
        
        return {
          ...h,
          price,
          currentValue,
          roi,
          changePercent: quote ? quote.regularMarketChangePercent : 0
        };
      });

      finalHoldings.sort((a, b) => b.currentValue - a.currentValue);
      setHoldings(finalHoldings);
      
    } catch (e) {
      console.error("Error fetching investment data:", e);
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  }

  const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Investment Dashboard</h2>
        <button onClick={fetchData} className="p-2 hover:bg-gray-100 rounded-full">
          <RefreshCw size={20} />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">Loading...</div>
      ) : error ? (
        <div className="text-red-500">Error: {error}</div>
      ) : holdings.length === 0 ? (
        <div className="text-gray-500">No investments found.</div>
      ) : (
        <div className="flex-1 flex flex-col gap-4">
          <div className="text-xl font-semibold">
            Total Value: €{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          
          <div className="flex-1 min-h-0 border rounded-lg overflow-hidden relative">
             <TreeMap items={holdings} totalValue={totalValue} />
          </div>
          
          <div className="overflow-auto max-h-60">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="p-2">Ticker</th>
                  <th className="p-2">Shares</th>
                  <th className="p-2">Price</th>
                  <th className="p-2">Value</th>
                  <th className="p-2">ROI</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map(h => (
                  <tr key={h.ticker} className="border-t">
                    <td className="p-2 font-medium">{h.ticker}</td>
                    <td className="p-2">{h.shares.toFixed(4)}</td>
                    <td className="p-2">€{h.price.toFixed(2)}</td>
                    <td className="p-2">€{h.currentValue.toLocaleString()}</td>
                    <td className={`p-2 ${h.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {h.roi.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TreeMap({ items, totalValue }) {
  // Recursive binary split treemap
  return (
    <div className="w-full h-full relative">
      <TreeMapNode 
        items={items} 
        x={0} y={0} w={100} h={100} 
        totalValue={totalValue} 
      />
    </div>
  );
}

function TreeMapNode({ items, x, y, w, h, totalValue }) {
  if (items.length === 0) return null;

  if (items.length === 1) {
    const item = items[0];
    const percent = (item.currentValue / totalValue) * 100;
    // Color based on ROI
    // Green for positive, Red for negative. Intensity based on magnitude?
    // Let's use simple thresholds or a gradient.
    // ROI -20% to +20% mapped to color.
    const roi = item.roi;
    let bgColor;
    if (roi >= 0) {
        // Green: 0% -> #e6fffa (light), 50% -> #047857 (dark)
        const intensity = Math.min(roi / 50, 1); 
        // Simple interpolation or classes. Let's use HSL.
        // Green is approx 150 hue. Lightness 90% down to 40%.
        const lightness = 90 - (intensity * 50);
        bgColor = `hsl(150, 70%, ${lightness}%)`;
    } else {
        // Red: 0% -> #fff5f5, -50% -> #c53030
        const intensity = Math.min(Math.abs(roi) / 50, 1);
        const lightness = 90 - (intensity * 50);
        bgColor = `hsl(0, 70%, ${lightness}%)`;
    }

    return (
      <div 
        style={{ 
          position: 'absolute', 
          left: `${x}%`, 
          top: `${y}%`, 
          width: `${w}%`, 
          height: `${h}%`,
          backgroundColor: bgColor,
          border: '1px solid white',
          overflow: 'hidden'
        }}
        className="flex flex-col items-center justify-center p-1 text-xs text-center transition-all hover:opacity-90 hover:z-10 hover:scale-[1.02] cursor-pointer"
        title={`${item.ticker}: €${item.currentValue.toLocaleString()} (${item.roi.toFixed(2)}%)`}
      >
        <span className="font-bold text-gray-800">{item.ticker}</span>
        <span className="text-gray-700 hidden sm:inline">{item.roi.toFixed(1)}%</span>
      </div>
    );
  }

  // Split items into two groups
  const halfValue = items.reduce((sum, i) => sum + i.currentValue, 0) / 2;
  let currentSum = 0;
  let splitIndex = 0;
  
  for (let i = 0; i < items.length; i++) {
    if (currentSum + items[i].currentValue > halfValue && i > 0) {
      // Check if adding this item makes it closer or further from half
      const diffWith = Math.abs((currentSum + items[i].currentValue) - halfValue);
      const diffWithout = Math.abs(currentSum - halfValue);
      if (diffWith < diffWithout) {
        splitIndex = i + 1;
        currentSum += items[i].currentValue;
      } else {
        splitIndex = i;
      }
      break;
    }
    currentSum += items[i].currentValue;
    splitIndex = i + 1;
  }

  const groupA = items.slice(0, splitIndex);
  const groupB = items.slice(splitIndex);
  
  const valueA = groupA.reduce((sum, i) => sum + i.currentValue, 0);
  const valueB = groupB.reduce((sum, i) => sum + i.currentValue, 0);
  const total = valueA + valueB; // Should match sum of items

  // Split direction: Split along the longer axis
  const isVerticalSplit = w > h; // If width is larger, split vertically (left/right)

  let wA, hA, xB, yB, wB, hB;

  if (isVerticalSplit) {
    wA = (valueA / total) * w;
    hA = h;
    xB = x + wA;
    yB = y;
    wB = w - wA;
    hB = h;
  } else {
    wA = w;
    hA = (valueA / total) * h;
    xB = x;
    yB = y + hA;
    wB = w;
    hB = h - hA;
  }

  return (
    <>
      <TreeMapNode items={groupA} x={x} y={y} w={wA} h={hA} totalValue={totalValue} />
      <TreeMapNode items={groupB} x={xB} y={yB} w={wB} h={hB} totalValue={totalValue} />
    </>
  );
}
